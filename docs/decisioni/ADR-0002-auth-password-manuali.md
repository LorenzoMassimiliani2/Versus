---
id: ADR-0002
title: Autenticazione con username e password create dall'admin
status: accepted
date: 2026-11-09
---

# Autenticazione con username e password create dall'admin

## Contesto

Il prodotto è pensato per un gruppo chiuso. Gli utenti non si registrano: l'admin li crea e consegna le credenziali. Non c'è email, non c'è reset self-service. Crumbs usa Google OAuth, ma qui l'utenza è fittizia o senza email e il flusso OAuth aggiungerebbe attrito.

## Decisione

- Username univoco sull'istanza, minuscolo, 3–32 caratteri `[a-z0-9_.-]`.
- Password scelta dall'admin, hash PBKDF2-HMAC-SHA256 con 100.000 iterazioni e salt di 16 byte, tramite WebCrypto nel Worker.
- 100.000 è il massimo di iterazioni PBKDF2 accettato da Cloudflare Workers; un valore superiore fa fallire il login con `NotSupportedError`.
- Password iniziale mostrata una sola volta; l'admin può impostarne una nuova, che revoca tutte le sessioni dell'utente.
- Sessione con token casuale da 32 byte, salvato come SHA-256 in D1 e inviato in cookie `HttpOnly`, `Secure`, `SameSite=Lax` per 30 giorni.
- Nessuna rotta pubblica di registrazione o reset.

## Conseguenze

- L'admin diventa un collo di bottiglia operativo: è accettato, il gruppo è piccolo.
- Se un utente perde la password, l'admin gliene assegna una nuova; nessun flusso email.
- PBKDF2 in WebCrypto è disponibile su Workers senza dipendenze native.
- Il costo di 100.000 iterazioni è sostenibile per un login sporadico e resta entro il limite WebCrypto dei Worker.
- Il token di sessione è revocabile centralmente, a differenza di un JWT stateless.
