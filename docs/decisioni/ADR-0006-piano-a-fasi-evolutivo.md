---
id: ADR-0006
title: Piano a fasi evolutivo, modificabile solo tra fasi (A2)
status: accepted
date: 2026-11-09
---

# Piano a fasi evolutivo, modificabile solo tra fasi (A2)

## Contesto

L'organizzatore vuole cambiare forma al torneo mentre avanza: aggiungere un ripescaggio, passare da gironi a eliminazione, cambiare la scala punti della finale. Modificare una fase mentre la gente sta votando, però, rende incomprensibili i risultati e apre contestazioni.

## Decisione

- Il piano è una lista ordinata di fasi, versionata e modificabile.
- Prima dell'apertura della prima fase: tutto modificabile.
- Dopo l'apertura: le fasi `pending` si possono aggiungere, rimuovere, riordinare e riconfigurare; le fasi `open`, `awaiting_resolution` e `closed` sono immutabili.
- Per cambiare una fase già avviata bisogna annullarla o resettarla, con rimborso crediti e traccia nel log.
- Ogni modifica strutturale produce una riga in `audit_log` con stato prima e dopo.

## Conseguenze

- Il torneo resta adattabile senza sacrificare la fiducia nei risultati.
- L'organizzatore deve pianificare le fasi successive prima di aprirle: è un vincolo accettabile.
- La UI deve mostrare chiaramente quali fasi sono modificabili e quali no.
- Non serve un motore di versionamento del piano: lo snapshot per fase e l'audit log bastano.
