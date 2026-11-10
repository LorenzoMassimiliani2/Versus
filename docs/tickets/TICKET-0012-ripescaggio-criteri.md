---
id: TICKET-0012
title: Selezionare i ripescati
status: needs-triage
category: enhancement
blocked_by: [TICKET-0010, TICKET-0011]
blocks: [TICKET-0015, TICKET-0021]
source: docs/features/FEAT-0005-motore-gironi-classifica-ripescaggio.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Calcolare quali esclusi entrano nella fase successiva quando il piano prevede un ripescaggio.

**Comportamento richiesto.**
- `applyRepechage` ordina gli esclusi con i criteri configurati: `group_points`, `first_preferences`, `weight_difference`, `draw`.
- Seleziona i primi fino a `targetSize`, senza superare il totale degli esclusi.
- `draw` usa un sorteggio crittografico e il risultato è tracciabile.
- `weight_difference` è disponibile solo se la fase precedente ha prodotto duelli.
- Se gli esclusi non bastano, la funzione restituisce un errore di validazione.
- Il risultato è deterministico a parità di input e criteri.

**Fuori scope.** Override manuale, persistenza, UI, apertura della fase successiva.

## Acceptance criteria
- [ ] Con 20 qualificati diretti e target 32 vengono selezionati 12 ripescati.
- [ ] I criteri sono applicati nell'ordine configurato.
- [ ] `weight_difference` viene rifiutato se non ci sono duelli.
- [ ] Esclusi insufficienti producono un errore.
- [ ] `draw` è deterministico con lo stesso seed e tracciabile.

## Choices

Nessuna scelta registrata.
