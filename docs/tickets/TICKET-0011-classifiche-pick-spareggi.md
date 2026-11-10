---
id: TICKET-0011
title: Calcolare classifiche, pick e spareggi
status: done
category: enhancement
blocked_by: [TICKET-0010]
blocks: [TICKET-0012, TICKET-0015, TICKET-0019, TICKET-0021]
source: docs/features/FEAT-0005-motore-gironi-classifica-ripescaggio.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Trasformare schede di voto e duelli in classifiche ordinate.

**Comportamento richiesto.**
- `tallyRanking` somma i punti delle schede, accetta schede parziali e non redistribuisce i punti non assegnati.
- `tallyPick` conta un punto per ogni pick.
- `computeStandings` calcola i punti del girone round-robin con vittoria/pareggio/sconfitta configurabili.
- Gli spareggi applicano nell'ordine: punti, prime preferenze, numero di schede, scontri diretti, differenza di peso, crediti, risoluzione manuale, secondo la formula.
- Una classifica con pareggio irrisolto è segnalata come tale.

**Fuori scope.** Persistenza, UI, ripescaggio, duelli con crediti.

## Acceptance criteria
- [x] Una scheda parziale è accettata e i punti non assegnati non vengono redistribuiti.
- [x] Il numero di prime preferenze è calcolato sul valore massimo della scala.
- [x] Un girone da 4 con risultati noti produce la classifica attesa con punti 3/1/0.
- [x] Gli spareggi automatici sono deterministici e testati con fixture.
- [x] Un pareggio non risolvibile viene restituito come stato di risoluzione manuale.

## Choices

| decisione | rationale | alternative_rejected | evidence |
|---|---|---|---|
| Il motore vive in `src/domain/ranking.ts`, `src/domain/pick.ts`, `src/domain/standings.ts` e `src/domain/tiebreak.ts`; `resolveTie` è condiviso dalle tre classifiche | gli spareggi sono la stessa procedura con criteri diversi; centralizzarli evita tre ordinamenti divergenti e rende `resolveTie` il seam già previsto dalla spec | ordinare separatamente dentro `tallyRanking`, `tallyPick` e `computeStandings`: duplicazione della regola di spareggio | `src/domain/tiebreak.ts`, test di ranking, pick e standings |
| `resolveTie` restituisce `rows` con `position` e `tied`, più `unresolved` (gruppi di id ancora appaiati) e `requiresManualResolution` | il chiamante (avanzamento, risultati, UI) decide se il pareggio conta per la qualificazione, ma il motore deve dichiararlo esplicitamente invece di sorteggiare in silenzio | aggiungere un fallback sull'id: nasconderebbe un pareggio reale e violerebbe il criterio «nessun sorteggio automatico silenzioso» | test «segnala il pareggio irrisolto e accetta un ordine manuale» (ranking, pick e standings) |
| I criteri predefiniti sono per formula: ranking `points, first_preferences, ballots, manual`; pick `points, manual`; girone `points, head_to_head, weight_difference, credits, manual` | replica l'ordine della spec per classifica, scelta e girone round-robin, dove non esistono prime preferenze o schede | usare un unico ordine globale: applicherebbe criteri privi di significato a gironi o pick | `RANKING_TIEBREAKS`, `PICK_TIEBREAKS`, `GROUP_TIEBREAKS` in `src/domain/tiebreak.ts` |
| `tallyRanking` somma solo i punti assegnati: una scheda parziale non produce punti extra e non redistribuisce i valori mancanti. Le prime preferenze contano le schede con il valore massimo della scala; le schede contano i voti distinti che hanno dato almeno un punto | è il comportamento richiesto dai criteri 24 e 25 della spec; contare le schede per assegnazione conterebbe due volte una scheda con duplicati | normalizzare o ridistribuire la scala: cambierebbe l'esito rispetto alla scheda espressa | test «somma i punti delle schede parziali senza redistribuire quelli non assegnati», «conta le prime preferenze sul valore massimo della scala» |
| Le posizioni usano la classifica di competizione: elementi appaiati condividono la posizione e la successiva salta (1, 1, 3) | rende visibile il pareggio senza inventare un ordine; è la forma naturale per una classifica con spareggi | posizioni consecutive assegnate per indice: suggerirebbe un ordine che non esiste | test «risolve la parità sui punti con le prime preferenze» |
| `computeStandings` riceve sfide con esito già deciso (`winner: a/b/draw`) e i pesi e crediti dei due lati; non ricalcola il duello, che resta di TICKET-0014 | separa la classifica di girone dal tally del duello e permette di testare la classifica con fixture note senza crediti o ledger | derivare il vincitore dai pesi dentro `computeStandings`: duplicherebbe la logica di spareggio del duello | `src/domain/standings.ts`, test del girone da 4 |
| I punti di classifica sono configurabili con default `{ win: 3, draw: 1, loss: 0 }` | il default è quello della spec per i gironi; la configurazione è già prevista da `GroupPhaseConfig.standings` | fissare 3/1/0 nel codice: impedirebbe la configurazione per fase | test «accetta punti vittoria, pareggio e sconfitta configurabili» |
| Lo scontro diretto usa una mini-classifica a vittorie tra i soli elementi appaiati, calcolata con il comparatore passato dal chiamante; un ciclo a tre resta irrisolto e passa al criterio successivo | è deterministico anche per parità multiple, senza assumere che il confronto sia transitivo | ordinamento pairwise dipendente dall'ordine di input: risultato instabile nei cicli | test «risolve la parità con gli scontri diretti» |
| La differenza di peso è la somma di `weightA - weightB` su tutte le sfide dell'elemento; i crediti sono la somma dei crediti investiti nei suoi lati | sono le due misure richieste dalla spec per il girone e non richiedono il ledger, solo i totali per sfida | calcolare la differenza solo sulle sfide vinte: non rappresenta la forza complessiva | test «dopo gli scontri diretti usa la differenza di peso», «dopo la differenza di peso usa i crediti investiti» |
| L'ordine manuale si applica solo quando copre tutti gli elementi del gruppo appaiato; un ordine parziale lascia il gruppo irrisolto | evita di attribuire una posizione a chi l'organizzatore non ha ancora ordinato | usare l'ordine parziale e completare con l'id: sorteggio silenzioso | test «segnala il pareggio irrisolto e accetta un ordine manuale» |
| I test sono co-locati (`ranking.test.ts`, `pick.test.ts`, `standings.test.ts`) e includono un golden per ciascuna classifica con fixture letterali | la spec chiede test golden per gli spareggi; i valori attesi sono indipendenti dall'implementazione | snapshot generati dal codice: tautologici | `npm test` (263 test verdi) |
