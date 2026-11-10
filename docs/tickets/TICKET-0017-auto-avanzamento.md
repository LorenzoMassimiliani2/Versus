---
id: TICKET-0017
title: Avanzare automaticamente alla fase successiva
status: needs-triage
category: enhancement
blocked_by: [TICKET-0016]
blocks: [TICKET-0024]
source: docs/features/FEAT-0007-ciclo-fase-avanzamento.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Far proseguire il torneo senza intervento dell'organizzatore quando l'opzione è attiva.

**Comportamento richiesto.**
- `settings.autoAdvance` è impostato alla creazione e modificabile solo prima dell'apertura della prima fase.
- Alla chiusura di una fase, se la successiva è `pending`, viene aperta nella stessa richiesta.
- L'apertura usa la configurazione del piano e gli elementi calcolati da avanzamento e ripescaggio.
- L'avanzamento è sospeso su `awaiting_resolution`, `cancelled` o se la successiva non è `pending`.
- Se la fase chiusa è l'ultima, il torneo passa a `concluded` e non si apre nulla.
- L'operazione è idempotente: due richieste concorrenti non aprono due volte la stessa fase.
- Se l'apertura automatica fallisce, la chiusura resta valida e la fase successiva resta `pending`.

**Fuori scope.** Apertura manuale, risoluzione spareggi, UI di configurazione.

## Acceptance criteria
- [ ] Con `autoAdvance: true`, chiudere la fase 1 apre la fase 2.
- [ ] Con `autoAdvance: false`, la fase 2 resta `pending`.
- [ ] Un pareggio irrisolto sospende l'avanzamento.
- [ ] La chiusura dell'ultima fase porta il torneo a `concluded`.
- [ ] Due chiusure concorrenti aprono la fase successiva una sola volta.
- [ ] Modificare `autoAdvance` dopo l'apertura della prima fase restituisce 409.

## Choices

Nessuna scelta registrata.
