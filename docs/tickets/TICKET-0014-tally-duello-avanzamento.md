---
id: TICKET-0014
title: Calcolare i duelli e avanzare i vincitori
status: done
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

| decisione | rationale | alternative_rejected | evidence |
|---|---|---|---|
| Il tally vive in `src/domain/duel.ts` ed esporta `tallyDuel` puro; l'avanzamento vive in `src/domain/advance.ts` ed esporta `applyAdvance` puro | separa i due seams indicati dalla spec e segue i file previsti da FEAT-0006, senza dipendenze da D1, HTTP o UI | un unico modulo "motore eliminazione": mescolerebbe due contratti usati da ticket diversi | `src/domain/duel.ts`, `src/domain/advance.ts` |
| `tallyDuel` riceve `sideA`, `sideB`, i voti e restituisce `sideA`/`sideB` con `weight`, `credits`, `voters`, piu `winner`, `winnerElementId`, `resolvedBy`, `unresolved`; non solleva eccezioni | la forma replica il risultato atteso dalla spec (`sideA: { elementId, weight, credits, voters }`), quindi TICKET-0021 puo serializzarlo senza ricalcolare; le astensioni e i duelli senza voti validi producono `unresolved` invece di un errore, lasciando al chiamante la fase `awaiting_resolution` | restituire solo `winnerElementId` e perdere i conteggi: il report dei risultati li richiede | test peso 5→6, astensioni, nessun voto |
| L'ordine degli spareggi e configurabile con `criteria` (`credits`, `voters`, `manual`), ma `manual` viene sempre spostato in coda | la spec ammette l'ordine modificabile per fase ma impone la risoluzione manuale come ultimo passo | fidarsi dell'ordine fornito senza normalizzarlo: permetterebbe di mettere `manual` prima dei criteri automatici | test con `['voters', 'credits']` |
| `applyAdvance` riceve liste ordinate gia pronte (`ranking` per `top_global`, `groups` per `top_per_group`, `entrants` per `all`, `matches` per `winners`/`winner`) e restituisce `{ ok, qualified, winnerElementId }` | il tally a monte ha gia applicato gli spareggi; passare id ordinati evita di duplicare qui la logica di classifica e rende banale verificare l'ordine | passare righe complete di classifica e rifare il sorting: duplicherebbe `resolveTie` e creerebbe due fonti di verita | test top_global, top_per_group, all |
| La finale 3/4 posto e marcata sulla singola sfida con `thirdPlace: true` e viene esclusa da `winners` e da `winner`; i bye passano automaticamente il lato presente | la spec dice che il terzo posto non influisce sull'avanzamento; il flag per sfida non richiede di conoscere la posizione nel tabellone | dedurre il terzo posto dall'ultima sfida: fragile se l'ordine o la presenza dei bye cambia | test finale 3/4 con finalisti invariati |
| Un duello irrisolto o una sfida senza vincitore non bye produce `missing_winner`; input assente produce `missing_input` | sono errori di programmazione o di stato, non esiti di dominio silenziosi; il chiamante deve fermarsi prima dell'avanzamento | scegliere un vincitore arbitrario: violerebbe il divieto di sorteggio automatico silenzioso | test errori e determinismo |
