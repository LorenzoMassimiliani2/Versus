#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'

import { hashPassword } from '../src/worker/auth/password.ts'
import { uuidv7 } from '../src/worker/db/ids.ts'

const DATABASE_NAME = 'versus-db'
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128

interface Options {
  username: string | null
  password: string | null
  remote: boolean
  reset: boolean
  help: boolean
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    username: process.env.ADMIN_USERNAME ?? null,
    password: process.env.ADMIN_PASSWORD ?? null,
    remote: false,
    reset: false,
    help: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--username') options.username = args[++index] ?? null
    else if (argument === '--password') options.password = args[++index] ?? null
    else if (argument === '--remote') options.remote = true
    else if (argument === '--reset') options.reset = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`Argomento sconosciuto: ${argument}`)
  }

  return options
}

function usage(): string {
  return [
    'Uso: npm run admin:create -- [--username <username>] [--password <password>] [--remote] [--reset]',
    '',
    'Senza --username o --password il comando li chiede in modo interattivo.',
    'In alternativa si possono usare ADMIN_USERNAME e ADMIN_PASSWORD.',
    'Di default il comando lavora sul D1 locale (--local).',
    'Con --reset aggiorna password, ruolo admin e stato del primo utente esistente.',
  ].join('\n')
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function wranglerArgs(remote: boolean, command: string): string[] {
  return [
    'wrangler',
    'd1',
    'execute',
    DATABASE_NAME,
    remote ? '--remote' : '--local',
    '--json',
    '--command',
    command,
  ]
}

interface WranglerResult {
  ok: boolean
  rows: Record<string, unknown>[]
  error: string
}

function executeSql(remote: boolean, command: string): WranglerResult {
  const result = spawnSync('npx', wranglerArgs(remote, command), {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.error) return { ok: false, rows: [], error: result.error.message }
  if (result.status !== 0) {
    return { ok: false, rows: [], error: (result.stderr || result.stdout || '').trim() }
  }

  try {
    const parsed = JSON.parse(result.stdout) as { results?: Record<string, unknown>[] }[]
    return { ok: true, rows: parsed.flatMap((entry) => entry.results ?? []), error: '' }
  } catch {
    return { ok: true, rows: [], error: '' }
  }
}

async function promptIfMissing(options: Options): Promise<Options> {
  if (options.username && options.password) return options
  if (!stdin.isTTY) {
    throw new Error('Username o password mancanti. Usa --username/--password o ADMIN_USERNAME/ADMIN_PASSWORD.')
  }

  const rl = createInterface({ input: stdin, output: stdout })
  try {
    if (!options.username) options.username = (await rl.question('Username: ')).trim()
    if (!options.password) options.password = await rl.question('Password: ')
  } finally {
    rl.close()
  }
  return options
}

function validate(username: string, password: string): void {
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Username non valido: 3-32 caratteri tra [a-z0-9_.-].')
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new Error(`Password non valida: da ${PASSWORD_MIN} a ${PASSWORD_MAX} caratteri.`)
  }
}

async function main(): Promise<void> {
  let options: Options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error((error as Error).message)
    console.error(usage())
    process.exitCode = 1
    return
  }

  if (options.help) {
    console.log(usage())
    return
  }

  options = await promptIfMissing(options)
  const username = (options.username ?? '').trim().toLowerCase()
  const password = options.password ?? ''
  validate(username, password)

  const existing = executeSql(
    options.remote,
    `SELECT id FROM users WHERE username = ${sqlLiteral(username)}`,
  )
  if (!existing.ok) {
    console.error(`Impossibile leggere il database: ${existing.error}`)
    console.error('Se il database locale non esiste, esegui prima "npm run db:migrate:local".')
    process.exitCode = 1
    return
  }
  if (existing.rows.length > 0) {
    if (!options.reset) {
      console.error(`Lo username "${username}" esiste già. Usa --reset per reimpostarne la password.`)
      process.exitCode = 1
      return
    }

    const passwordHash = await hashPassword(password)
    const updatedAt = new Date().toISOString()
    const update = executeSql(
      options.remote,
      `UPDATE users
       SET password_hash = ${sqlLiteral(passwordHash)}, is_admin = 1, is_active = 1
       WHERE username = ${sqlLiteral(username)}`,
    )
    if (!update.ok) {
      console.error(`Aggiornamento dell'admin fallito: ${update.error}`)
      process.exitCode = 1
      return
    }

    executeSql(
      options.remote,
      `UPDATE sessions
       SET revoked_at = ${sqlLiteral(updatedAt)}
       WHERE revoked_at IS NULL
         AND user_id = (SELECT id FROM users WHERE username = ${sqlLiteral(username)})`,
    )

    console.log(`Admin aggiornato: ${username}`)
    console.log(`Database: ${options.remote ? 'remoto' : 'locale'}`)
    return
  }

  const id = uuidv7()
  const passwordHash = await hashPassword(password)
  const createdAt = new Date().toISOString()
  const insert = executeSql(
    options.remote,
    `INSERT INTO users (id, username, password_hash, is_admin, is_active, created_at)
     VALUES (${sqlLiteral(id)}, ${sqlLiteral(username)}, ${sqlLiteral(passwordHash)}, 1, 1, ${sqlLiteral(createdAt)})`,
  )

  if (!insert.ok) {
    console.error(`Creazione dell'admin fallita: ${insert.error}`)
    process.exitCode = 1
    return
  }

  console.log(`Admin creato: ${username} (${id})`)
  console.log(`Database: ${options.remote ? 'remoto' : 'locale'}`)
}

await main()
