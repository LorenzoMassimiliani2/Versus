---
id: TICKET-0001
title: Schema D1 iniziale, health e migrazioni
status: needs-triage
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
- [ ] La migrazione si applica su un database D1 vuoto senza errori.
- [ ] Le tabelle `users`, `sessions`, `login_attempts` e `audit_log` esistono con i vincoli previsti.
- [ ] `GET /api/health` risponde 200 senza cookie o token.
- [ ] `npm run type-check` e `npm test` passano.

## Choices

Nessuna scelta registrata.
