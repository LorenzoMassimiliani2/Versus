---
id: TICKET-0002
title: Login, logout e bootstrap admin
status: done
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

| decisione | rationale | alternative scartate | evidenza |
|---|---|---|---|
| Hash PBKDF2-HMAC-SHA256 con 600.000 iterazioni, salt 16 byte e digest 32 byte in base64 standard nel formato `pbkdf2$600000$<salt>$<hash>` | Rispetta la spec e ADR-0002; 32 byte danno 256 bit di output; base64 standard rende il formato leggibile e stabile per il comando di bootstrap | digest da 16 byte (troppo corto), base64url (nessun vantaggio nel DB), iterazioni configurabili per utente (complessità non richiesta) | `src/worker/auth/password.ts`, `src/worker/auth/password.test.ts` (vettore PBKDF2 indipendente da `node:crypto`) |
| Confronto del digest a tempo costante e hash fittizio per gli username inesistenti | Evita di distinguere username esistenti e inesistenti dal tempo di risposta | confronto con `===`; nessun hash fittizio | `verifyPassword`, `DUMMY_PASSWORD_HASH`, test login con username sconosciuto |
| Rate limit a finestra fissa di 15 minuti, con chiavi `username:<nome>` e `ip:<ip>`; ogni fallimento incrementa entrambe; il successo azzera solo la chiave username | Semplice e atomico su D1 con la tabella `login_attempts`; mantiene la protezione dell'IP contro password spraying anche dopo un accesso riuscito | finestra scorrevole con più bucket (più righe e query), contatore in memoria (non condiviso tra isolate Workers) | `src/worker/auth/rate-limit.ts`, test con username fisso/IP variabile e IP fisso/username variabile |
| Token di sessione casuale da 32 byte in base64url; in D1 solo SHA-256 esadecimale; revoca con `revoked_at`; cookie `versus_session` con `Path=/`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=2592000` | Il token è revocabile centralmente e il DB non contiene il segreto utilizzabile; i flag corrispondono alla spec | JWT stateless (non revocabile), token in chiaro nel DB, `SameSite=Strict` (rompe i link di ritorno) | `src/worker/auth/token.ts`, `src/worker/auth/session.ts`, test su cookie e `token_hash` |
| Le sessioni di un utente disattivato sono rifiutate in `authenticate`; il login con password valida di un utente disattivato risponde 403 e revoca le sessioni esistenti | Copre sia la protezione continua sia la richiesta di revoca, senza introdurre la gestione utenti (TICKET-0003) | sola verifica al login (le sessioni resterebbero attive), 401 al login (la spec richiede 403) | test "utente disattivato" e "sessione di un utente disattivato" |
| Protezione centralizzata in `src/worker/index.ts`: solo `GET /api/health` e `POST /api/auth/login` sono pubblici; `/api/me` aggiunto per la UI; `Origin` se presente deve coincidere con l'host | Un unico punto evita di dimenticare rotte future; `/api/me` è previsto dalla spec ed è ciò che il router guard interroga; le richieste senza `Origin` sono ammesse per client non browser e test | guard per-rotta (facile da dimenticare), `Origin` obbligatorio (blocca curl e test interni) | `src/worker/index.ts`, `src/worker/routes/auth.ts`, test di protezione e di Origin |
| Bootstrap con `scripts/create-admin.ts` eseguito da `npm run admin:create` con `node --experimental-strip-types`; legge/scrive D1 via `npx wrangler d1 execute` locale di default, `--remote` opzionale; username/password da flag, ambiente o prompt | Riusa lo stesso hashing del Worker senza duplicarlo e non richiede una rotta pubblica di setup; il flag di Node è necessario per importare TypeScript e rispetta `engines >=22.12` | script che duplica l'hashing, rotta `/setup`, esecuzione diretta di SQL tramite driver non disponibile in Workers | esecuzione manuale su D1 locale: `alice` creata, secondo tentativo rifiutato |
| UI con store Pinia `session`, `LoginView` e router guard che carica `/api/me` prima di decidere; testi ed errori in `src/lib/strings.ts` | Segue la struttura del progetto (store per lo stato client, viste solo presentazione, testi centralizzati); il guard funziona anche su un caricamento diretto di una rotta protetta | stato di autenticazione nel componente, testi inline, redirect gestiti solo da `LoginView` | `src/stores/session.ts`, `src/router/index.ts`, `src/views/LoginView.vue`, test UI e guard |
| Test del Worker tramite un adattatore D1 minimale su `node:sqlite` | I test attraversano l'interfaccia HTTP e usano SQL reale, senza mock interni né servizi esterni | mock di ogni query, `wrangler dev` nei test (lento e non deterministico) | `src/test/d1.ts`, `src/worker/routes/auth.test.ts` |
