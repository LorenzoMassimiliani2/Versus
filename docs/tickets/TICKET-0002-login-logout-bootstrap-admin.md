---
id: TICKET-0002
title: Login, logout e bootstrap admin
status: needs-triage
category: enhancement
blocked_by: [TICKET-0001]
blocks: [TICKET-0003, TICKET-0004]
source: docs/features/FEAT-0001-fondamenta-autenticazione.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Permettere a un utente creato dall'admin di accedere e mantenere una sessione revocabile.

**Comportamento richiesto.**
- Un comando di progetto crea il primo admin con username e password.
- Le password sono hash PBKDF2-HMAC-SHA256 con 600.000 iterazioni e salt casuale.
- `POST /api/auth/login` valida le credenziali, imposta il cookie `versus_session` (`HttpOnly`, `Secure`, `SameSite=Lax`, durata 30 giorni) e registra un tentativo.
- `POST /api/auth/logout` revoca la sessione corrente.
- Un utente disattivato non può accedere; le sue sessioni sono rifiutate.
- Dopo 10 tentativi falliti in 15 minuti per username o IP, il login risponde `429`.
- La UI di login mostra errori leggibili e, dopo il login, porta alla home protetta.
- Le rotte applicative diverse da health e login richiedono una sessione valida.

**Fuori scope.** Creazione e gestione utenti da parte dell'admin, ruoli di torneo.

## Acceptance criteria
- [ ] `admin:create` crea un admin utilizzabile al login.
- [ ] Il cookie di sessione ha i flag richiesti e scade dopo 30 giorni.
- [ ] Logout revoca la sessione: la stessa richiesta successiva risponde 401.
- [ ] Un utente disattivato riceve 403 al login e le sessioni esistenti sono revocate.
- [ ] Il rate limit restituisce 429 dopo 10 tentativi falliti.
- [ ] La UI di login funziona e una rotta protetta senza sessione reindirizza al login.

## Choices

Nessuna scelta registrata.
