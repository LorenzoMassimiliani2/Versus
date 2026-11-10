---
id: TICKET-0031
title: Modificare fasi pending e riordinare il piano in corso
status: needs-triage
category: enhancement
blocked_by: [TICKET-0009, TICKET-0015]
blocks: [TICKET-0032, TICKET-0033]
source: docs/features/FEAT-0014-modificabilita-audit.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Applicare la regola A2 durante un torneo avviato.

**Comportamento richiesto.**
- Prima dell'apertura della prima fase tutto è modificabile.
- Dopo l'avvio, le fasi `pending` si possono aggiungere, eliminare, riordinare e riconfigurare.
- Le fasi `open`, `awaiting_resolution` e `closed` rifiutano le modifiche con 409.
- L'organizzatore può correggere i ripescati prima di aprire la fase successiva, quando l'avanzamento automatico è disattivato.
- Ogni modifica ricalcola l'anteprima e mantiene valido il piano.
- `autoAdvance` resta immutabile dopo l'apertura della prima fase.

**Fuori scope.** Riapertura di fasi chiuse, modifica di fasi avviate, audit log completo (ticket successivo).

## Acceptance criteria
- [ ] Una fase `pending` è modificabile durante il torneo.
- [ ] Una fase `open` rifiuta le modifiche con 409.
- [ ] Aggiungere o riordinare fasi future ricalcola l'anteprima.
- [ ] L'override dei ripescati è disponibile solo con `autoAdvance` disattivato.
- [ ] `autoAdvance` non è modificabile dopo l'apertura della prima fase.

## Choices

Nessuna scelta registrata.
