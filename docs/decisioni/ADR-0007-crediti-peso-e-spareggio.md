---
id: ADR-0007
title: Crediti come peso del voto e come primo spareggio
status: accepted
date: 2026-11-09
---

# Crediti come peso del voto e come primo spareggio

## Contesto

L'organizzatore vuole un meccanismo che renda il voto strategico e risolva i pareggi in modo percepito come giusto: chi ha investito di più su un elemento deve contare di più. I crediti devono essere semplici da capire e da mostrare su mobile.

## Decisione

- I crediti valgono solo per la scheda `duello`.
- Peso del voto: `1 + crediti investiti`.
- Il budget è per partecipante e per fase, deciso dall'organizzatore con default suggeriti (quarti 1, semifinali 2, finale 3).
- I crediti si consumano al voto e non si trasferiscono tra fasi.
- Spareggio di un duello: punteggio ponderato, poi crediti investiti nel lato, poi numero di votanti, poi scelta dell'organizzatore.
- Ogni movimento è registrato in `credit_entries`; il voto e il movimento sono scritti nello stesso batch D1.
- Reset della fase: rimborso di tutte le spese della fase.

## Conseguenze

- Un singolo votante con molti crediti può pareggiare molti votanti; il numero di votanti resta il criterio successivo.
- I risultati devono mostrare sia il peso sia il numero di votanti, altrimenti il conteggio sembra arbitrario.
- I crediti non spesi alla chiusura si perdono: la scelta va comunicata nella UI prima del voto.
- Il ledger append-only rende ricostruibile ogni saldo senza calcoli impliciti.
