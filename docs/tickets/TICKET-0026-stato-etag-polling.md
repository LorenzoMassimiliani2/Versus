---
id: TICKET-0026
title: Stato del torneo con ETag e polling
status: needs-triage
category: enhancement
blocked_by: [TICKET-0015, TICKET-0021, TICKET-0022]
blocks: [TICKET-0027]
source: docs/features/FEAT-0011-pwa-polling-offline.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Tenere aggiornata la schermata senza WebSocket.

**Comportamento richiesto.**
- `GET /api/tournaments/:id/state` restituisce torneo, fasi, conteggi visibili e `serverTime`.
- L'`ETag` deriva da `updated_at` di torneo e fasi, stato e conteggi visibili.
- Con `If-None-Match` uguale, la risposta è `304` senza corpo.
- Il client esegue polling ogni 4 secondi solo a pagina visibile.
- Il polling si interrompe quando la scheda è nascosta e riprende al ritorno visibile.
- Un `304` non altera lo stato della UI.

**Fuori scope.** SSE, WebSocket, notifiche push.

## Acceptance criteria
- [ ] Lo stato restituisce torneo, fasi e conteggi visibili.
- [ ] La seconda richiesta con lo stesso ETag riceve 304.
- [ ] Il polling si ferma a scheda nascosta e riprende al ritorno.
- [ ] Un cambio di stato produce un nuovo ETag e un payload aggiornato.
- [ ] La UI non ricarica l'intera pagina a ogni polling.

## Choices

Nessuna scelta registrata.
