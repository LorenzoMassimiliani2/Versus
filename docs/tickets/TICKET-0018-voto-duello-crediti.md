---
id: TICKET-0018
title: Votare un duello con crediti
status: needs-triage
category: enhancement
blocked_by: [TICKET-0015]
blocks: [TICKET-0020, TICKET-0021]
source: docs/features/FEAT-0008-voto-crediti.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Permettere il voto su una sfida 1 contro 1 con investimento di crediti.

**Comportamento richiesto.**
- Un partecipante vota `a`, `b` o `abstain` e indica i crediti investiti.
- Il peso del voto è `1 + crediti`; i crediti non possono superare budget o `maxPerMatch`.
- `abstain` conta come voto espresso ma non aggiunge peso e non accetta crediti.
- Ogni spesa produce una riga nel ledger crediti; cambiare lato rimborsa il lato precedente e addebita il nuovo.
- L'ultimo voto vince ed è idempotente per chiave.
- Il voto su una sfida non aperta è rifiutato con 409; crediti oltre il limite con 422.
- La UI mostra due card, il selettore crediti e l'astensione.

**Fuori scope.** Classifiche, pick, modalità sequenziale, auto-voto, risultati.

## Acceptance criteria
- [ ] Un voto con 5 crediti produce peso 6 e una riga di spesa.
- [ ] Cambiare lato rimborsa i crediti del lato precedente.
- [ ] `abstain` non aggiunge peso e rifiuta crediti.
- [ ] Crediti oltre `maxPerMatch` restituiscono 422.
- [ ] Il voto su una sfida chiusa restituisce 409.
- [ ] La UI salva e rilegge il proprio voto.

## Choices

Nessuna scelta registrata.
