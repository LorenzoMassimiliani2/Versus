---
id: TICKET-0003
title: Gestione utenti da parte dell'admin
status: needs-triage
category: enhancement
blocked_by: [TICKET-0001, TICKET-0002]
blocks: [TICKET-0004, TICKET-0006]
source: docs/features/FEAT-0002-gestione-utenti-admin.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Dare all'admin il controllo completo sulle utenze dell'istanza.

**Comportamento richiesto.**
- L'admin cerca utenti per username, ne crea di nuovi e ne disattiva o riattiva l'accesso.
- La password iniziale è restituita una sola volta; non è più leggibile dopo la creazione.
- Il reset password revoca tutte le sessioni attive dell'utente.
- L'admin può promuovere o revocare un altro admin; l'operazione è tracciata in `audit_log`.
- La creazione del ventunesimo utente attivo è rifiutata con `409`; un utente disattivato non occupa un posto.
- La UI admin permette ricerca, creazione, disattivazione, reset password e promozione.

**Fuori scope.** Registrazione pubblica, reset via email, cancellazione fisica degli utenti.

## Acceptance criteria
- [ ] Creare un utente restituisce la password iniziale una sola volta.
- [ ] Un utente disattivato non può accedere e le sue sessioni sono revocate.
- [ ] Il reset password revoca tutte le sessioni attive dell'utente.
- [ ] La creazione del ventunesimo utente attivo restituisce 409.
- [ ] La promozione ad admin produce una riga in `audit_log`.
- [ ] Un co-organizzatore non può usare le rotte admin: 403.

## Choices

Nessuna scelta registrata.
