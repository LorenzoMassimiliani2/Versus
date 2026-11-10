---
id: TICKET-0016
title: "Chiudere una fase: manuale, tutti hanno votato, scadenza"
status: ready-for-agent
category: enhancement
blocked_by: [TICKET-0015]
blocks: [TICKET-0017, TICKET-0021, TICKET-0023]
source: docs/features/FEAT-0007-ciclo-fase-avanzamento.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Chiudere la finestra di voto e congelare i risultati.

**Comportamento richiesto.**
- La chiusura è disponibile manualmente all'organizzatore.
- Con `all_voted`, la fase si chiude quando ogni votante attivo ha votato o si è astenuto su ogni target.
- Con `deadline`, la prima richiesta dopo la scadenza chiude la fase.
- La transizione `open -> closed` è idempotente: due richieste concorrenti non producono due snapshot.
- Alla chiusura si calcolano i risultati e si salva `phase_results` con `config_snapshot` e `results`.
- Un pareggio irrisolto porta la fase in `awaiting_resolution` e non produce snapshot.
- Una fase chiusa non accetta più voti: 409.

**Fuori scope.** Auto-avanzamento, risoluzione manuale, filtri di segretezza.

## Acceptance criteria
- [ ] La chiusura manuale passa la fase a `closed` e crea uno snapshot.
- [ ] Con `all_voted` la fase si chiude al completamento di tutti i votanti.
- [ ] Con `deadline` la fase si chiude alla prima richiesta dopo la scadenza.
- [ ] Due richieste concorrenti producono un solo snapshot.
- [ ] Un pareggio irrisolto porta la fase in `awaiting_resolution` senza snapshot.

## Choices

Nessuna scelta registrata.
