---
id: TICKET-0001
title: Schema D1 iniziale, health e migrazioni
status: ready-for-agent
category: enhancement
blocked_by: []
blocks: [TICKET-0002, TICKET-0003, TICKET-0004, TICKET-0029]
source: docs/features/FEAT-0001-fondamenta-autenticazione.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Creare il primo strato persistente dell'app e un endpoint di salute verificabile.

**Comportamento richiesto.**
- Una migrazione D1 crea `users`, `sessions`, `login_attempts` e `audit_log` con chiavi, vincoli e indici minimi.
- `GET /api/health` risponde `200` con un JSON stabile, senza autenticazione.
- Le migrazioni si applicano da zero su un database vuoto con il comando di progetto.
- I tipi del Worker e del binding D1 sono disponibili al type-check.

**Fuori scope.** Login, creazione utenti, tornei, UI applicativa.

## Acceptance criteria
- [x] La migrazione si applica su un database D1 vuoto senza errori.
- [x] Le tabelle `users`, `sessions`, `login_attempts` e `audit_log` esistono con i vincoli previsti.
- [x] `GET /api/health` risponde 200 senza cookie o token.
- [x] `npm run type-check` e `npm test` passano.

## Choices

| Decisione | Rationale | Alternative scartate | Evidenza |
|---|---|---|---|
| Una sola migrazione `migrations/0001_initial_schema.sql` con le quattro tabelle dello scope e gli indici minimi della spec | Il ticket copre solo lo strato autenticazione; il resto dello schema appartiene ai ticket successivi | Creare ora l'intero schema della spec: fuori scope e in conflitto con i ticket 0004–0028 | `npm run db:migrate:local` applica 1 migrazione con 8 comandi; test `src/worker/db/migrations.test.ts` |
| `audit_log.tournament_id` è `TEXT` senza `REFERENCES tournaments(id)` | `tournaments` non esiste in questa migrazione e SQLite rifiuta un insert con foreign key verso una tabella assente; SQLite non consente di aggiungere la FK dopo | Includere la FK: gli insert di audit prima di TICKET-0004 falliscono con `no such table: main.tournaments`; creare `tournaments` ora: fuori scope | Test fallito con FK, poi verde dopo la rimozione; commento nella migrazione |
| `GET /api/health` restituisce `{ "ok": true }` deterministico da `src/worker/routes/health.ts`, senza binding D1 | Payload stabile, nessun timestamp o stato dinamico; la rotta pubblica non deve dipendere dal database | Restituire stato del DB o un timestamp: renderebbe il JSON non stabile | `src/worker/routes/health.test.ts` |
| `worker-configuration.d.ts` generato con `npm run types` e committato | Rende disponibili al type-check i tipi globali del Worker e il binding `DB: D1Database` | Tipi scritti a mano: duplicano il contratto di Wrangler | `npm run type-check` e `npm run build` verdi |
| I test della migrazione usano `node:sqlite` su un database in memoria e leggono il file SQL reale | Verifica lo schema effettivamente applicato, senza mock né dipendenza da Wrangler | Test basati su stringhe SQL duplicate o mock di D1: non provano il vincolo reale | 6 test in `src/worker/db/migrations.test.ts` |
| Il `database_id` placeholder resta invariato; il flusso locale lo accetta | La creazione del database reale è TICKET-0030 (prerequisito umano) | Sostituire l'id con un valore inventato: fuori scope | `npm run db:migrate:local` eseguito su `versus-db` locale |
