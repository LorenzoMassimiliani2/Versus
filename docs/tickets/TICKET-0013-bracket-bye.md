---
id: TICKET-0013
title: Costruire il tabellone a eliminazione con bye
status: done
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

| decisione | rationale | alternative_rejected | evidence |
|---|---|---|---|
| Il motore vive in `src/domain/bracket.ts` ed esporta `buildBracket` come funzione pura con risultato discriminato `{ ok: true, ... }` / `{ ok: false, error }` | separa la generazione del tabellone dalla validazione del piano e permette fixture note senza D1, HTTP o UI; la forma discriminata segue `buildGroups` | sollevare eccezioni per un seeding manuale incompleto: il chiamante API dovrebbe usare `try/catch` per un caso d'uso previsto | `src/domain/bracket.ts`, test 32→16 e 12→4+4 |
| L'input con seeding `ranking` è già ordinato per seed; `random` mescola con generatore iniettabile e restituisce l'ordine in `draw`; `manual` riceve l'ordine dei seed come lista di id | i tre seeding della spec differiscono solo per l'origine dell'ordine, quindi una sola struttura di output li copre; `draw` rende tracciabile il sorteggio come per i gironi | ordinare internamente per `position` anche con seeding `ranking`: nasconderebbe la classifica precedente già calcolata a monte | test ranking, random con `randomInt` fisso, manual con ordine esplicito |
| Gli helper `cryptoRandomInt` e `shuffle` sono estratti in `src/domain/random.ts` e usati da `groups.ts` e `bracket.ts` | il mescolamento crittografico è la stessa procedura nei due motori; un'unica implementazione evita due rejection sampling divergenti | duplicare lo shuffle nel bracket | `src/domain/random.ts`, `src/domain/groups.ts` invariato nei test |
| `buildBracket` restituisce `bracketSize`, `matches` (`a`, `b`, `bye`), `byes`, `byeCount` e `draw`; gli accoppiamenti sono `1 vs P`, `2 vs P-1`, ... e i bye vanno ai primi seed | espone in un colpo solo tutto ciò che serve all'anteprima e al turno; una fase `elimination` produce solo le sfide del turno corrente, non l'intero albero | restituire l'albero completo dei turni: la spec assegna un turno per fase | test 5 elementi: bye ai seed 1-3, sfida 4 vs 5 |
| `validatePlan` in `src/domain/plan.ts` usa `buildBracket` con seeding `ranking` al posto della copia locale di potenza di 2 e accoppiamenti | elimina la duplicazione tra anteprima e motore, mantenendo l'anteprima deterministica | mostrare nell'anteprima un bracket random: romperebbe la fixture canonica deterministica | `src/domain/plan.ts`, test canonico esistente ancora verde |
