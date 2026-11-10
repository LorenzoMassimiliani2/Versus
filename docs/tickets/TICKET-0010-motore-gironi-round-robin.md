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
- [x] 40 elementi con dimensione 4 producono 10 gironi da 4.
- [x] 38 elementi con `smaller_groups` producono 8 gironi da 4 e 2 da 3.
- [x] 38 elementi con `byes` producono 9 gironi da 4 e 2 bye.
- [x] Un girone da 4 produce 6 sfide di round-robin.
- [x] La fixture canonica è deterministica nei test.

## Choices

| decisione | rationale | alternative_rejected | evidence |
|---|---|---|---|
| Il motore vive in `src/domain/groups.ts` ed esporta `buildGroups`, `layoutGroups`, `groupCountFor`, `groupSizes`, `groupName` e `buildRoundRobin` come funzioni pure | separa la composizione dei gironi dalla validazione del piano e rende il motore testabile senza D1, HTTP o UI | lasciare la logica dentro `plan.ts`: duplicazione tra anteprima e apertura fase, impossibile riuso da TICKET-0011/0015 | `src/domain/groups.ts`, `src/domain/groups.test.ts` |
| `buildGroups` restituisce un risultato discriminato `{ ok: true, groups, byes, draw }` oppure `{ ok: false, error }`, con errori `size_invalid`, `manual_incomplete`, `manual_unknown_element`, `manual_invalid_group`, `manual_group_full` | gli errori manuali sono casi d'uso, non eccezioni; il chiamante API può mapparli senza `try/catch` | stessa convenzione di `validateCustomValues` nel dominio | `src/domain/custom-values.ts`, `src/domain/groups.ts` |
| Con `smaller_groups` i gironi sono bilanciati: `groupCount = ceil(N/size)`, dimensioni `base = floor(N/groupCount)` e i primi `N % groupCount` gironi ricevono un elemento in più, così gli ultimi sono i più piccoli | 38 elementi con dimensione 4 devono produrre 8 gironi da 4 e 2 da 3; la divisione ingenua a blocchi produceva 9 da 4 e 1 da 2 | slice sequenziali da `size`: non rispetta il criterio di accettazione 15 della spec | test «con 38 elementi e smaller_groups crea 8 gironi da 4 e 2 da 3» |
| Con `byes` il numero di gironi è `floor(N/size)`, i gironi sono pieni e gli elementi residui finiscono in `byes` | 38 elementi con `byes` devono produrre 9 gironi da 4 e 2 bye; i bye passano alla fase successiva e contano come qualificati | includere i residui nei gironi: gironi sovradimensionati | test «con 38 elementi e byes crea 9 gironi da 4 e 2 bye» |
| `random` usa Fisher-Yates con `randomInt(maxExclusive)` iniettabile; il default è `crypto.getRandomValues` con rejection sampling. Il risultato espone `groups`, `byes` e `draw` (gli id nell'ordine sorteggiato) | il sorteggio deve essere crittografico in produzione e riproducibile nei test; `draw` è l'informazione da salvare per ricostruire il risultato | `Math.random`: non crittografico; mescolare senza esporre l'ordine: impossibile verificare o salvare il sorteggio | test «random usa il generatore iniettato e ripete lo stesso risultato con lo stesso seed» |
| `snake` distribuisce gli elementi già ordinati per seed a serpentina, con capacità pari alle dimensioni dei gironi; gli elementi in eccesso con `byes` restano fuori dai gironi | bilancia le teste di serie mantenendo gironi pieni o quasi e lascia i bye in coda nell'ordine di seeding | serpentina senza capacità: con `byes` riempirebbe i gironi oltre `size` | test «snake separa le teste di serie e bilancia i gironi» |
| `manual` riceve `manual: Record<elementId, groupIndex>` e richiede che ogni elemento sia assegnato esattamente una volta, che gli id esistano, che l'indice di girone sia valido e che nessun girone superi `size` | l'organizzatore trascina gli elementi: il piano non è pubblicabile finché l'assegnazione non è completa e coerente | derivare i gironi manuali dai soli indici senza validarli: gruppi sovrappieni o elementi orfani | test «manual richiede che tutti gli elementi siano assegnati», «manual rifiuta elementi sconosciuti e gironi inesistenti», «manual rifiuta un girone oltre la dimensione» |
| L'anteprima del piano riusa `layoutGroups`: serpentina per `snake`, blocchi per `random` e `manual`, senza eseguire il sorteggio crittografico | mantiene la scelta di TICKET-0008: l'anteprima è deterministica e il sorteggio reale avviene all'apertura della fase | chiamare `buildGroups` con `random` in anteprima: risultato non riproducibile e diverso dal sorteggio salvato | `src/domain/plan.ts`, test «con 38 elementi e smaller_groups l anteprima crea 8 gironi da 4 e 2 da 3» |
| `buildRoundRobin` usa il metodo del cerchio e, con un numero dispari di membri, inserisce un turno di riposo che non genera sfida | un girone da 4 produce 6 sfide distinte; i gironi da 3 restano validi senza bye fittizi | doppio ciclo con controllo delle coppie già viste: più codice e ordine meno prevedibile | test `buildRoundRobin` (4 → 6, 3 → 3, 5 → 10) |
| I nomi dei gironi sono centralizzati in `groupName` (`Girone A`…`Girone Z`, poi `Girone A1`) e usati sia dal motore sia dall'anteprima | evita due formati di nome divergenti tra anteprima e apertura fase | generare i nomi nel chiamante: duplicazione della regola | `src/domain/groups.ts`, test «usa lettere progressive e ricomincia dopo la Z» |
