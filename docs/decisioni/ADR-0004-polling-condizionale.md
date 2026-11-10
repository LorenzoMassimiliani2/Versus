---
id: ADR-0004
title: Polling condizionale invece di WebSocket
status: accepted
date: 2026-11-09
---

# Polling condizionale invece di WebSocket

## Contesto

Durante una fase live i partecipanti devono vedere aperture, chiusure e risultati senza ricaricare. Cloudflare Workers con D1 non offre push nativo; WebSocket richiede Durable Objects, con costo e complessità aggiuntivi. Il pubblico è un gruppo chiuso, spesso poche decine di persone.

## Decisione

- Endpoint `GET /api/tournaments/:id/state` con `ETag` basato su `updated_at` di torneo e fasi, stato e conteggi visibili.
- Polling ogni 4 secondi, solo quando la pagina è visibile (`document.visibilityState === "visible"`).
- `If-None-Match` per ottenere `304` quando nulla è cambiato.
- Le scadenze sono valutate lazy su ogni richiesta di stato o azione.
- La chiusura `open -> closed` usa un batch condizionale su `status = 'open'`: richieste concorrenti non producono snapshot duplicati.

## Conseguenze

- Nessun Durable Object, nessun costo di connessioni persistenti.
- Latenza percepita fino a 4 secondi: accettabile per un torneo tra amici, non per un'asta in tempo reale.
- Il traffico è dominato da richieste `304`; va tenuto d'occhio il limite di letture D1.
- Se in futuro serve una vera sala live, l'endpoint di stato può essere affiancato da SSE senza riscrivere il dominio.
- La chiusura a scadenza non è puntuale al secondo: dipende dalla prima richiesta successiva.
- Con 20 utenti attivi e polling a 4 secondi il piano gratuito di Cloudflare è sufficiente; con più utenti servirebbe il piano pagato o un intervallo maggiore.
