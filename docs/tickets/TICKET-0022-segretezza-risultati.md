---
id: TICKET-0022
title: Filtrare i risultati per segretezza
status: needs-triage
category: enhancement
blocked_by: [TICKET-0021]
blocks: [TICKET-0024, TICKET-0026]
source: docs/features/FEAT-0009-risultati-segretezza-risoluzione.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Garantire che ogni ruolo veda solo ciò che la modalità di segretezza consente.

**Comportamento richiesto.**
- In `live` il partecipante vede i risultati aggregati durante la fase.
- In `blind` vede solo il proprio voto fino alla chiusura.
- In `secret` l'organizzatore riceve solo aggregati anche dopo la chiusura.
- In nessuna modalità un partecipante riceve l'identità di un altro votante.
- Il filtro è applicato nelle API, non solo nella UI.
- I test verificano i payload per ruolo e modalità.

**Fuori scope.** Crittografia lato client, accesso diretto a D1, UI oltre i risultati.

## Acceptance criteria
- [ ] `live` mostra aggregati al partecipante durante la fase.
- [ ] `blind` mostra solo il proprio voto prima della chiusura.
- [ ] `secret` non espone voti individuali all'organizzatore tramite API.
- [ ] Nessuna risposta API contiene l'identità dei votanti per un partecipante.
- [ ] I test coprono i payload per ruolo e modalità.

## Choices

Nessuna scelta registrata.
