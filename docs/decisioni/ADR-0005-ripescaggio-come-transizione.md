---
id: ADR-0005
title: Ripescaggio come regola di transizione, non come fase votata
status: accepted
date: 2026-11-09
---

# Ripescaggio come regola di transizione, non come fase votata

## Contesto

L'esempio dell'organizzatore è: 40 elementi, gironi da 4, passano i primi 2 (20), poi ripescaggio per arrivare a 32, quindi eliminazione. Il ripescaggio può essere deciso dai voti già espressi, oppure con una nuova votazione tra gli esclusi.

## Decisione

- Il ripescaggio è una proprietà della transizione (`advance.repechage`), non una fase con voti propri.
- Gli esclusi vengono ordinati con criteri configurabili (`group_points`, `first_preferences`, `weight_difference`, `draw`).
- I primi fino a `targetSize` vengono aggiunti ai qualificati.
- L'organizzatore può sostituire a mano i ripescati prima di aprire la fase successiva; la modifica è tracciata.
- Una variante votata potrà essere aggiunta in seguito come formula `repechage` con scheda di voto.

## Conseguenze

- Il piano resta semplice e l'anteprima può calcolare i ripescati prima che il torneo inizi.
- Nessun voto aggiuntivo richiesto ai partecipanti.
- I criteri devono essere espliciti e deterministici, altrimenti il ripescaggio diventa opaco.
- Se in futuro il ripescaggio votato diventa necessario, servirà una nuova formula e una migrazione del piano, non un cambio di significato di `advance`.
