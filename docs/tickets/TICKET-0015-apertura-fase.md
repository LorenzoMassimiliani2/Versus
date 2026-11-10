---
id: TICKET-0015
title: Aprire una fase e creare gironi, match e snapshot votanti
status: ready-for-agent
category: enhancement
blocked_by: [TICKET-0009, TICKET-0010, TICKET-0011, TICKET-0012, TICKET-0013, TICKET-0014]
blocks: [TICKET-0016, TICKET-0018, TICKET-0019, TICKET-0026, TICKET-0031]
source: docs/features/FEAT-0007-ciclo-fase-avanzamento.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Avviare una fase e congelare lo stato operativo necessario al voto.

**Comportamento richiesto.**
- L'apertura è ammessa solo se la fase è `pending` e la precedente è `closed` o è la prima fase.
- Vengono calcolati gli elementi in ingresso, i gironi o gli accoppiamenti e gli eventuali ripescati.
- L'organizzatore può correggere manualmente i ripescati prima dell'apertura; la modifica è tracciata.
- Vengono creati `phase_entrants`, `phase_voters`, `groups`, `group_members` e `matches` con stato `open`.
- Il budget crediti per votante è fotografato.
- La fase passa a `open` e il torneo a `running`.
- La UI dell'organizzatore mostra la fase aperta e permette di avviarla.

**Fuori scope.** Chiusura, voto, risultati, auto-avanzamento.

## Acceptance criteria
- [ ] Aprire la prima fase porta il torneo in `running`.
- [ ] Gironi e match sono creati con gli elementi corretti.
- [ ] Il budget crediti è fotografato in `phase_voters`.
- [ ] L'override manuale dei ripescati è tracciato.
- [ ] Una fase non `pending` o con precedente non chiusa viene rifiutata con 409.

## Choices

Nessuna scelta registrata.
