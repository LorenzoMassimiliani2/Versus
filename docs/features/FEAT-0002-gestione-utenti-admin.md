---
id: FEAT-0002
title: Gestione utenti admin
status: proposed
branch: feat/0002-gestione-utenti-admin
worktree: .worktrees/0002
batch: 2
depends_on: [FEAT-0001]
touches: ["src/worker/routes/users.ts", "src/worker/auth/", "src/views/admin/", "src/router/", "migrations/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Dare all'admin le operazioni sugli utenti: ricerca, creazione, disattivazione, reset password e promozione a admin, con revoca delle sessioni quando serve.

**Fuori scope.** Registrazione pubblica, reset password via email, cancellazione fisica degli utenti.

**Criteri di accettazione.**

- L'admin crea un utente con username e password iniziale; la password è restituita una sola volta.
- L'admin disattiva un utente e tutte le sue sessioni vengono revocate.
- L'admin imposta una nuova password e tutte le sessioni attive dell'utente vengono revocate.
- L'admin promuove un altro utente ad admin; l'operazione produce una riga in `audit_log`.
- Un co-organizzatore non può creare utenti né promuovere admin: `403`.
- La creazione del ventunesimo utente attivo è rifiutata con `409`.

**Priorità proposta.** P0 — l'admin è l'unico che crea le utenze.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0002-gestione-utenti-admin.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: `docs/tickets/TICKET-0003-*.md`

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
