---
id: TICKET-0014
title: Calcolare i duelli e avanzare i vincitori
status: ready-for-agent
category: enhancement
blocked_by: [TICKET-0013]
blocks: [TICKET-0015, TICKET-0021]
source: docs/features/FEAT-0006-motore-eliminazione-bracket.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Determinare il vincitore di un duello e chi passa al turno successivo.

**Comportamento richiesto.**
- `tallyDuel` somma i pesi `1 + crediti` per lato e determina il vincitore.
- Gli spareggi applicano crediti investiti, numero di votanti e risoluzione manuale.
- `applyAdvance` produce i vincitori delle sfide per la fase successiva.
- La finale 3°/4° posto, se attiva, non modifica i qualificati della finale.
- Un duello con astensioni ma senza voti validi è gestito secondo le regole della fase.
- Il risultato è deterministico e testato con fixture.

**Fuori scope.** Persistenza, UI, crediti (ledger), risultati aggregati.

## Acceptance criteria
- [ ] Un voto con 5 crediti pesa 6.
- [ ] Il lato con peso maggiore vince.
- [ ] A parità di peso vincono il lato con più crediti, poi più votanti, poi la risoluzione manuale.
- [ ] `applyAdvance` restituisce i vincitori nell'ordine corretto.
- [ ] La finale 3°/4° posto non altera i qualificati della finale.

## Choices

Nessuna scelta registrata.
