import type { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import worker from '../index'
import { createTestEnvironment } from '../../test/d1'
import { hashPassword } from '../auth/password'

const ORIGIN = 'https://versus.test'

interface TournamentBody {
  tournament: { id: string }
}

interface FieldBody {
  id: string
  key: string
  label: string
  type: string
  position: number
}

interface ElementBody {
  id: string
  userId: string | null
  name: string
  description: string
  imageUrl: string
  videoUrl: string | null
  customValues: Record<string, string | number>
  position: number
}

async function seedUser(
  db: DatabaseSync,
  id: string,
  username: string,
  password = 'password123',
): Promise<void> {
  db.prepare(
    'INSERT INTO users (id, username, password_hash, is_admin, is_active, created_at) VALUES (?, ?, ?, 0, 1, ?)',
  ).run(id, username, await hashPassword(password), new Date().toISOString())
}

async function login(env: Env, username: string, password = 'password123'): Promise<string> {
  const response = await worker.fetch(
    new Request(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'CF-Connecting-IP': `203.0.113.${username.length}`,
      },
      body: JSON.stringify({ username, password }),
    }),
    env,
    {} as ExecutionContext,
  )
  expect(response.status).toBe(200)
  const match = (response.headers.get('Set-Cookie') ?? '').match(/versus_session=([^;]+)/)
  if (!match) throw new Error('Set-Cookie versus_session assente')
  return match[1]!
}

function request(path: string, token: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('Origin', ORIGIN)
  headers.set('Cookie', `versus_session=${token}`)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  return new Request(`${ORIGIN}${path}`, { ...init, headers })
}

async function call(env: Env, path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(request(path, token, init), env, {} as ExecutionContext)
}

async function createTournament(env: Env, token: string): Promise<string> {
  const response = await call(env, '/api/tournaments', token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Torneo di Prova' }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as TournamentBody).tournament.id
}

async function createField(
  env: Env,
  token: string,
  tournamentId: string,
  body: Record<string, unknown>,
): Promise<FieldBody> {
  const response = await call(env, `/api/tournaments/${tournamentId}/fields`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { field: FieldBody }).field
}

async function createElement(
  env: Env,
  token: string,
  tournamentId: string,
  body: Record<string, unknown>,
): Promise<ElementBody> {
  const response = await call(env, `/api/tournaments/${tournamentId}/elements`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { element: ElementBody }).element
}

async function listElements(env: Env, token: string, tournamentId: string): Promise<ElementBody[]> {
  const response = await call(env, `/api/tournaments/${tournamentId}/elements`, token)
  expect(response.status).toBe(200)
  return ((await response.json()) as { elements: ElementBody[] }).elements
}

const IMAGE = 'https://images.example.test/item.jpg'

describe('campi personalizzati', () => {
  it('crea campi con posizione progressiva e li elenca', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const tournamentId = await createTournament(env, token)

    const genre = await createField(env, token, tournamentId, {
      key: 'genere',
      label: 'Genere',
      type: 'text',
    })
    const year = await createField(env, token, tournamentId, {
      key: 'anno',
      label: 'Anno',
      type: 'number',
    })

    expect(genre).toMatchObject({ key: 'genere', label: 'Genere', type: 'text', position: 1 })
    expect(year.position).toBe(2)

    const response = await call(env, `/api/tournaments/${tournamentId}/fields`, token)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { fields: FieldBody[] }
    expect(body.fields.map((field) => field.key)).toEqual(['genere', 'anno'])
  })

  it('rifiuta l undicesimo campo con 409', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const tournamentId = await createTournament(env, token)

    for (let index = 0; index < 10; index += 1) {
      await createField(env, token, tournamentId, {
        key: `campo_${index}`,
        label: `Campo ${index}`,
        type: 'text',
      })
    }

    const response = await call(env, `/api/tournaments/${tournamentId}/fields`, token, {
      method: 'POST',
      body: JSON.stringify({ key: 'undicesimo', label: 'Undicesimo', type: 'text' }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'field_limit_reached' })
  })

  it('rifiuta chiavi duplicate e tipi non ammessi', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const tournamentId = await createTournament(env, token)
    await createField(env, token, tournamentId, { key: 'genere', label: 'Genere', type: 'text' })

    const duplicate = await call(env, `/api/tournaments/${tournamentId}/fields`, token, {
      method: 'POST',
      body: JSON.stringify({ key: 'genere', label: 'Genere bis', type: 'text' }),
    })
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toEqual({ error: 'duplicate_field_key' })

    for (const body of [
      { key: 'x', label: 'X', type: 'boolean' },
      { key: 'con-spazio', label: 'X', type: 'text' },
      { key: '1campo', label: 'X', type: 'text' },
      { key: 'campo', label: '', type: 'text' },
    ]) {
      const response = await call(env, `/api/tournaments/${tournamentId}/fields`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      expect(response.status).toBe(400)
    }
  })

  it('modifica l etichetta e cancella il campo rimuovendo i valori degli elementi', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const tournamentId = await createTournament(env, token)
    const field = await createField(env, token, tournamentId, {
      key: 'genere',
      label: 'Genere',
      type: 'text',
    })
    const element = await createElement(env, token, tournamentId, {
      name: 'Canzone',
      imageUrl: IMAGE,
      customValues: { genere: 'pop' },
    })

    const patched = await call(env, `/api/fields/${field.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ label: 'Genere musicale' }),
    })
    expect(patched.status).toBe(200)
    expect(((await patched.json()) as { field: FieldBody }).field.label).toBe('Genere musicale')

    const renamed = await call(env, `/api/fields/${field.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ type: 'number' }),
    })
    expect(renamed.status).toBe(400)

    const deleted = await call(env, `/api/fields/${field.id}`, token, { method: 'DELETE' })
    expect(deleted.status).toBe(204)

    const elements = await listElements(env, token, tournamentId)
    expect(elements[0]!.id).toBe(element.id)
    expect(elements[0]!.customValues).toEqual({})

    const fieldsResponse = await call(env, `/api/tournaments/${tournamentId}/fields`, token)
    expect(((await fieldsResponse.json()) as { fields: FieldBody[] }).fields).toEqual([])
  })
})

describe('elementi', () => {
  it('richiede un immagine http o https', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const tournamentId = await createTournament(env, token)

    for (const body of [
      { name: 'Senza immagine' },
      { name: 'Immagine vuota', imageUrl: '  ' },
      { name: 'Immagine relativa', imageUrl: '/foto.jpg' },
      { name: 'Protocollo strano', imageUrl: 'ftp://example.test/foto.jpg' },
    ]) {
      const response = await call(env, `/api/tournaments/${tournamentId}/elements`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid_request' })
    }
  })

  it('rifiuta video che non sono YouTube', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const tournamentId = await createTournament(env, token)

    const response = await call(env, `/api/tournaments/${tournamentId}/elements`, token, {
      method: 'POST',
      body: JSON.stringify({ name: 'Canzone', imageUrl: IMAGE, videoUrl: 'https://vimeo.com/1' }),
    })
    expect(response.status).toBe(400)

    const element = await createElement(env, token, tournamentId, {
      name: 'Canzone',
      imageUrl: IMAGE,
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })
    expect(element.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it('valida i valori contro il tipo dei campi', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const tournamentId = await createTournament(env, token)
    await createField(env, token, tournamentId, { key: 'genere', label: 'Genere', type: 'text' })
    await createField(env, token, tournamentId, { key: 'anno', label: 'Anno', type: 'number' })
    await createField(env, token, tournamentId, { key: 'sito', label: 'Sito', type: 'url' })
    await createField(env, token, tournamentId, { key: 'uscita', label: 'Uscita', type: 'date' })

    const valid = await createElement(env, token, tournamentId, {
      name: 'Canzone',
      imageUrl: IMAGE,
      customValues: { genere: 'pop', anno: 1999, sito: 'https://example.test', uscita: '1999-12-31' },
    })
    expect(valid.customValues).toEqual({
      genere: 'pop',
      anno: 1999,
      sito: 'https://example.test',
      uscita: '1999-12-31',
    })

    for (const customValues of [
      { anno: '1999' },
      { sito: 'non-un-url' },
      { uscita: '31/12/1999' },
      { genere: 42 },
    ]) {
      const response = await call(env, `/api/tournaments/${tournamentId}/elements`, token, {
        method: 'POST',
        body: JSON.stringify({ name: 'Canzone', imageUrl: IMAGE, customValues }),
      })
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ error: 'invalid_values' })
    }

    const unknown = await call(env, `/api/tournaments/${tournamentId}/elements`, token, {
      method: 'POST',
      body: JSON.stringify({ name: 'Canzone', imageUrl: IMAGE, customValues: { colore: 'rosso' } }),
    })
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toEqual({ error: 'unknown_field' })
  })

  it('crea, modifica, elenca e cancella un elemento', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const token = await login(env, 'alice')
    const tournamentId = await createTournament(env, token)
    await createField(env, token, tournamentId, { key: 'genere', label: 'Genere', type: 'text' })

    const element = await createElement(env, token, tournamentId, {
      name: '  Canzone  ',
      description: 'Una descrizione',
      imageUrl: IMAGE,
      videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      customValues: { genere: 'pop' },
      userId: 'u2',
    })
    expect(element).toMatchObject({
      name: 'Canzone',
      description: 'Una descrizione',
      imageUrl: IMAGE,
      videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      customValues: { genere: 'pop' },
      userId: 'u2',
      position: 1,
    })

    const patched = await call(env, `/api/elements/${element.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Canzone nuova',
        imageUrl: 'https://images.example.test/nuova.jpg',
        customValues: { genere: 'rock' },
        userId: null,
        videoUrl: null,
      }),
    })
    expect(patched.status).toBe(200)
    expect(((await patched.json()) as { element: ElementBody }).element).toMatchObject({
      name: 'Canzone nuova',
      imageUrl: 'https://images.example.test/nuova.jpg',
      customValues: { genere: 'rock' },
      userId: null,
      videoUrl: null,
    })

    const invalidPatch = await call(env, `/api/elements/${element.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ customValues: { genere: 1 } }),
    })
    expect(invalidPatch.status).toBe(422)

    const deleted = await call(env, `/api/elements/${element.id}`, token, { method: 'DELETE' })
    expect(deleted.status).toBe(204)
    expect(await listElements(env, token, tournamentId)).toEqual([])
  })

  it('rifiuta un utente collegato inesistente', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const tournamentId = await createTournament(env, token)

    const response = await call(env, `/api/tournaments/${tournamentId}/elements`, token, {
      method: 'POST',
      body: JSON.stringify({ name: 'Canzone', imageUrl: IMAGE, userId: 'inesistente' }),
    })
    expect(response.status).toBe(400)
  })
})

describe('riordino degli elementi', () => {
  it('persiste l ordine e lo usa come seeding iniziale', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const tournamentId = await createTournament(env, token)

    const first = await createElement(env, token, tournamentId, { name: 'Prima', imageUrl: IMAGE })
    const second = await createElement(env, token, tournamentId, { name: 'Seconda', imageUrl: IMAGE })
    const third = await createElement(env, token, tournamentId, { name: 'Terza', imageUrl: IMAGE })

    const response = await call(env, `/api/tournaments/${tournamentId}/elements/order`, token, {
      method: 'PUT',
      body: JSON.stringify({ ids: [third.id, first.id, second.id] }),
    })
    expect(response.status).toBe(200)

    const ordered = await listElements(env, token, tournamentId)
    expect(ordered.map((element) => [element.name, element.position])).toEqual([
      ['Terza', 1],
      ['Prima', 2],
      ['Seconda', 3],
    ])
  })

  it('rifiuta un ordine che non contiene esattamente gli elementi del torneo', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')
    const tournamentId = await createTournament(env, token)
    const element = await createElement(env, token, tournamentId, {
      name: 'Prima',
      imageUrl: IMAGE,
    })

    for (const ids of [[], [element.id, element.id], ['altro'], [element.id, 'altro']]) {
      const response = await call(env, `/api/tournaments/${tournamentId}/elements/order`, token, {
        method: 'PUT',
        body: JSON.stringify({ ids }),
      })
      expect(response.status).toBe(400)
    }
  })
})

describe('autorizzazione di campi ed elementi', () => {
  it('riserva la gestione agli organizzatori', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    await seedUser(db, 'u2', 'bruno')
    const alice = await login(env, 'alice')
    const bruno = await login(env, 'bruno')
    const tournamentId = await createTournament(env, alice)

    for (const [method, path, body] of [
      ['GET', `/api/tournaments/${tournamentId}/fields`, undefined],
      ['POST', `/api/tournaments/${tournamentId}/fields`, { key: 'genere', label: 'Genere', type: 'text' }],
      ['GET', `/api/tournaments/${tournamentId}/elements`, undefined],
      ['POST', `/api/tournaments/${tournamentId}/elements`, { name: 'X', imageUrl: IMAGE }],
      ['PUT', `/api/tournaments/${tournamentId}/elements/order`, { ids: [] }],
    ] as const) {
      const response = await call(env, path, bruno, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'forbidden' })
    }

    const field = await createField(env, alice, tournamentId, {
      key: 'genere',
      label: 'Genere',
      type: 'text',
    })
    const element = await createElement(env, alice, tournamentId, {
      name: 'Prima',
      imageUrl: IMAGE,
    })

    for (const [method, path, body] of [
      ['PATCH', `/api/fields/${field.id}`, { label: 'Nuova' }],
      ['DELETE', `/api/fields/${field.id}`, undefined],
      ['PATCH', `/api/elements/${element.id}`, { name: 'Nuova' }],
      ['DELETE', `/api/elements/${element.id}`, undefined],
    ] as const) {
      const response = await call(env, path, bruno, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      expect(response.status).toBe(403)
    }
  })

  it('risponde 404 per tornei, campi ed elementi inesistenti', async () => {
    const { db, env } = createTestEnvironment()
    await seedUser(db, 'u1', 'alice')
    const token = await login(env, 'alice')

    expect((await call(env, '/api/tournaments/inesistente/fields', token)).status).toBe(404)
    expect((await call(env, '/api/tournaments/inesistente/elements', token)).status).toBe(404)
    expect(
      (await call(env, '/api/fields/inesistente', token, { method: 'DELETE' })).status,
    ).toBe(404)
    expect(
      (await call(env, '/api/elements/inesistente', token, { method: 'DELETE' })).status,
    ).toBe(404)
  })

  it('richiede una sessione valida', async () => {
    const { env } = createTestEnvironment()

    const response = await worker.fetch(
      new Request(`${ORIGIN}/api/tournaments/t1/elements`),
      env,
      {} as ExecutionContext,
    )

    expect(response.status).toBe(401)
  })
})
