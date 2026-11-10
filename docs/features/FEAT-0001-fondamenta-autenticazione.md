---
id: FEAT-0001
title: Fondamenta e autenticazione
status: proposed
branch: feat/0001-fondamenta-autenticazione
worktree: .worktrees/0001
batch: 1
depends_on: []
touches: ["migrations/", "src/worker/index.ts", "src/worker/auth/", "src/worker/db/", "src/stores/session.ts", "src/views/LoginView.vue", "src/router/", "scripts/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Mettere in piedi le fondamenta dell'app: schema D1 per utenti e sessioni, bootstrap del primo admin, login/logout con cookie, rate limit, ruoli base e limiti di istanza.

**Fuori scope.** Gestione utenti completa da parte dell'admin, tornei, fasi, voti.

**Criteri di accettazione.**

- `npm run admin:create` crea il primo admin interrogando D1.
- Il login con username e password valida restituisce il cookie `versus_session` con `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- Il logout revoca la sessione e il token non è più accettato.
- Un utente disattivato riceve `403` al login e le sue sessioni sono revocate.
- Dopo 10 tentativi falliti in 15 minuti per username o IP, il login risponde `429`.
- La creazione del ventunesimo utente attivo è rifiutata con `409`.
- Le migrazioni D1 si applicano in locale con `npm run db:migrate:local`.

**Priorità proposta.** P0 — senza questa feature non si può usare nulla.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0001-fondamenta-autenticazione.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: nessuno.

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
