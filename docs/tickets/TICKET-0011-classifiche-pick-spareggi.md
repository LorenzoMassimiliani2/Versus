---
id: TICKET-0011
title: Calcolare classifiche, pick e spareggi
status: ready-for-agent
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
- [ ] Una scheda parziale è accettata e i punti non assegnati non vengono redistribuiti.
- [ ] Il numero di prime preferenze è calcolato sul valore massimo della scala.
- [ ] Un girone da 4 con risultati noti produce la classifica attesa con punti 3/1/0.
- [ ] Gli spareggi automatici sono deterministici e testati con fixture.
- [ ] Un pareggio non risolvibile viene restituito come stato di risoluzione manuale.

## Choices

Nessuna scelta registrata.
