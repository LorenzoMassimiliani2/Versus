---
id: TICKET-0027
title: PWA installabile e consultazione offline
status: needs-triage
category: enhancement
blocked_by: [TICKET-0026]
blocks: []
source: docs/features/FEAT-0011-pwa-polling-offline.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Rendere l'app installabile e consultabile senza connessione in sola lettura.

**Comportamento richiesto.**
- Manifest con nome, colori, icone 192/512/maskable/apple-touch.
- Service worker `autoUpdate` con fallback di navigazione che esclude `/api/`.
- Precache della shell e cache runtime dell'ultimo torneo consultato e delle immagini esterne.
- Le schermate in cache sono di sola lettura e mostrano l'ora dell'ultimo aggiornamento.
- Il voto offline è disabilitato con un messaggio esplicito; nessuna mutazione viene accodata.
- Nessuna background sync.

**Fuori scope.** Notifiche push, coda offline, sincronizzazione in background.

## Acceptance criteria
- [ ] La PWA è installabile e mostra la shell offline.
- [ ] Le rotte `/api/` non sono servite dal fallback della PWA.
- [ ] L'ultimo torneo consultato è leggibile offline con ora di aggiornamento.
- [ ] Il voto offline è disabilitato e non viene accodato.
- [ ] Non esiste background sync.

## Choices

Nessuna scelta registrata.
