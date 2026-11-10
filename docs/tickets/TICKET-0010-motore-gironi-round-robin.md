---
id: TICKET-0010
title: Comporre i gironi e generare il round-robin
status: ready-for-agent
category: enhancement
blocked_by: [TICKET-0007]
blocks: [TICKET-0011, TICKET-0012, TICKET-0015]
source: docs/features/FEAT-0005-motore-gironi-classifica-ripescaggio.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Calcolare la struttura dei gironi come funzioni pure e deterministiche.

**Comportamento richiesto.**
- `buildGroups` distribuisce gli elementi in gironi secondo dimensione, modalità `random`, `snake` o `manual` e resto `smaller_groups` o `byes`.
- La modalità `random` usa un sorteggio crittografico e il risultato viene salvato.
- La modalità `snake` bilancia le teste di serie.
- La modalità `manual` richiede che tutti gli elementi siano assegnati.
- Un girone con scheda `duel` genera tutte le coppie del round-robin.
- I risultati rispettano la fixture canonica e sono riproducibili a parità di input.

**Fuori scope.** Calcolo delle classifiche, ripescaggio, persistenza, UI.

## Acceptance criteria
- [ ] 40 elementi con dimensione 4 producono 10 gironi da 4.
- [ ] 38 elementi con `smaller_groups` producono 8 gironi da 4 e 2 da 3.
- [ ] 38 elementi con `byes` producono 9 gironi da 4 e 2 bye.
- [ ] Un girone da 4 produce 6 sfide di round-robin.
- [ ] La fixture canonica è deterministica nei test.

## Choices

Nessuna scelta registrata.
