---
id: TICKET-0019
title: Votare classifica e scelta
status: ready-for-agent
category: enhancement
blocked_by: [TICKET-0015, TICKET-0011]
blocks: [TICKET-0020, TICKET-0021]
source: docs/features/FEAT-0008-voto-crediti.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Permettere schede di voto su più elementi.

**Comportamento richiesto.**
- Una scheda classifica assegna i valori della scala punti a elementi del girone o della fase.
- Ogni valore della scala può essere usato al massimo una volta per scheda.
- Una scheda parziale è valida.
- Una scheda pick sceglie un solo elemento e vale 1 punto.
- Il voto è modificabile ed eliminabile finché la fase è aperta.
- La UI mostra i punti residui, l'ordine e la selezione singola.

**Fuori scope.** Duelli, crediti, modalità sequenziale, risultati aggregati.

## Acceptance criteria
- [ ] Una scheda classifica parziale viene accettata.
- [ ] Assegnare due volte lo stesso valore viene rifiutato.
- [ ] Una scheda pick con due elementi viene rifiutata.
- [ ] Modificare o eliminare il voto aggiorna la proiezione corrente e aggiunge un evento.
- [ ] La UI mostra i punti residui e impedisce assegnazioni non valide.

## Choices

Nessuna scelta registrata.
