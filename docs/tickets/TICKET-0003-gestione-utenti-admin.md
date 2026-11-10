---
id: TICKET-0003
title: Gestione utenti da parte dell'admin
status: ready-for-agent
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

| decisione | rationale | alternative scartate | evidenza |
|---|---|---|---|
| Le rotte `/api/users` sono raggruppate in `handleUsersRoute`, invocata da `src/worker/index.ts` dopo l'autenticazione; ogni handler verifica `auth.user.isAdmin` e risponde `403 forbidden` | Un solo punto di instradamento evita di duplicare il matching nell'entrypoint e mantiene la protezione applicativa vicina alle operazioni; il 403 è uniforme su GET, POST, PATCH e reset password | matching sparso in `index.ts`, guard centralizzato senza contesto della rotta | `src/worker/routes/users.ts`, `src/worker/index.ts`, test "risponde 403 a un utente che non è admin" |
| Forma delle risposte: `{ users: [...] }` per la lista, `{ user, initialPassword }` con `201` per la creazione, `{ user }` per PATCH e `204` per il reset. La password iniziale è restituita solo nella risposta di creazione; nessuna risposta espone `password_hash` | Rende esplicito il carattere una-tantum della password e mantiene payload piccoli e coerenti con `/api/me`; le liste contengono solo id, username, ruolo, stato e data di creazione | restituire la password in un campo `password` generico, includere l'hash o i flag grezzi del DB | `src/worker/routes/users.ts`, test "crea un utente e restituisce la password iniziale una sola volta" |
| Limite di 20 utenti attivi controllato prima della creazione e della riattivazione con `COUNT(*) WHERE is_active = 1`; superato il limite la risposta è `409 user_limit_reached` | Il limite è applicativo secondo ADR-0009; un utente disattivato non conta e la riattivazione oltre soglia è rifiutata senza toccare il DB | vincolo SQL, controllo solo nella UI, conteggio degli utenti totali | `src/worker/db/users.ts`, `src/worker/routes/users.ts`, test del ventunesimo utente e della riattivazione |
| Disattivazione e reset password eseguono `revokeUserSessions` nella stessa richiesta; la disattivazione aggiorna `is_active` e revoca tutte le sessioni attive | Soddisfa i criteri di accettazione e garantisce che una sessione esistente non sopravviva a un cambio di stato o di credenziali | revoca lazy al login (lascia attive le sessioni nel frattempo), revoca solo della sessione corrente | `src/worker/routes/users.ts`, test "disattiva ... revoca tutte le sue sessioni" e "reset password" |
| Ogni mutazione amministrativa scrive una riga in `audit_log` con azione `user.create`, `user.deactivate`, `user.reactivate`, `user.promote`, `user.demote` o `user.password_reset`, `target_type = 'user'`, attore, prima/dopo in JSON | Rende tracciabili promozioni e revoche come richiesto, senza aspettare il ticket strutturale sull'audit; il formato prima/dopo è già quello previsto dallo schema | tracciare solo le promozioni, tabella dedicata agli eventi utente | `src/worker/db/users.ts`, `src/worker/routes/users.ts`, test "promuove e revoca un admin tracciando ogni operazione" |
| Ricerca con `username LIKE '%q%'` su query normalizzata in minuscolo, ordinata per username | La spec chiede ricerca per username e gli username sono minuscoli; la ricerca parziale è più utile di un match esatto in una lista di massimo 20 voci | match esatto, `LIKE 'q%'` (esclude corrispondenze interne) | `src/worker/db/users.ts`, test "elenca gli utenti e filtra per username" |
| UI con store Pinia `users` e `UsersView` su `/admin/utenti` con `meta.requiresAdmin`; la password iniziale compare in un banner chiudibile e non viene salvata nello stato dopo la chiusura | Segue la separazione del progetto (store per le chiamate API, vista per la presentazione) e rende visibile una sola volta la password; il guard impedisce l'accesso diretto ai non admin | chiamate `fetch` dentro il componente, password mostrata in un alert di browser, rotta senza guard | `src/stores/users.ts`, `src/views/admin/UsersView.vue`, `src/router/index.ts`, test UI e guard |
| Test del Worker attraversano `worker.fetch` con l'adattatore `SqliteD1` su `node:sqlite` e SQL reale; i test UI montano `UsersView` con `fetch` stubbato al confine di rete | Verifica il comportamento osservabile delle API (autorizzazione, stato, audit) senza mock interni; per la UI il confine di rete è l'unico mock necessario | test delle query isolate, test end-to-end con `wrangler dev` | `src/worker/routes/users.test.ts`, `src/views/admin/UsersView.test.ts` |
