---
id: TICKET-0013
title: Costruire il tabellone a eliminazione con bye
status: ready-for-agent
category: enhancement
blocked_by: [TICKET-0007]
blocks: [TICKET-0014, TICKET-0015]
source: docs/features/FEAT-0006-motore-eliminazione-bracket.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Generare il tabellone di un turno a eliminazione diretta.

**Comportamento richiesto.**
- Gli elementi in ingresso sono ordinati per seed secondo la configurazione.
- Il tabellone è portato alla potenza di 2 superiore `P`.
- Gli accoppiamenti seguono `1 vs P`, `2 vs P-1`, `3 vs P-2`, ecc.
- I seed oltre il numero di elementi sono bye e vengono assegnati ai seed migliori.
- Una fase `elimination` rappresenta un solo turno.
- La struttura è deterministica a parità di input e seeding.

**Fuori scope.** Tally dei duelli, crediti, terzo posto, persistenza, UI.

## Acceptance criteria
- [ ] 32 elementi producono 16 sfide senza bye.
- [ ] 12 elementi producono 4 sfide e 4 bye.
- [ ] I bye sono assegnati ai seed migliori.
- [ ] Il seeding `ranking`, `random` e `manual` produce la struttura attesa.
- [ ] La fixture canonica del tabellone è deterministica.

## Choices

Nessuna scelta registrata.
