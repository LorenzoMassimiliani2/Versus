---
id: TICKET-0021
title: Calcolare e mostrare i risultati di fase
status: needs-triage
category: enhancement
blocked_by: [TICKET-0011, TICKET-0012, TICKET-0014, TICKET-0016, TICKET-0018, TICKET-0019]
blocks: [TICKET-0022, TICKET-0023, TICKET-0024, TICKET-0026]
source: docs/features/FEAT-0009-risultati-segretezza-risoluzione.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Rendere leggibile l'esito di una fase.

**Comportamento richiesto.**
- I risultati includono classifiche dei gironi, sfide, qualificati, ripescati e vincitore.
- I punteggi mostrano peso e numero di votanti per lato.
- Il risultato è conservato in `phase_results` con la configurazione usata.
- `GET /api/phases/:id/results` restituisce il payload filtrato per ruolo.
- La UI mostra classifiche, sfide, qualificati e ripescati.
- Una fase chiusa non ricalcola i risultati automaticamente.

**Fuori scope.** Filtri di segretezza, risoluzione manuale, podio, export.

## Acceptance criteria
- [ ] I risultati di un girone mostrano la classifica ordinata.
- [ ] I risultati di un duello mostrano peso, crediti e votanti per lato.
- [ ] Qualificati e ripescati sono elencati.
- [ ] Lo snapshot contiene la configurazione usata.
- [ ] La UI di risultati mostra i dati senza modificare lo stato.

## Choices

Nessuna scelta registrata.
