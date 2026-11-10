---
id: TICKET-0004
title: Creare e gestire un torneo in bozza
status: needs-triage
category: enhancement
blocked_by: [TICKET-0001, TICKET-0002, TICKET-0003]
blocks: [TICKET-0005, TICKET-0006, TICKET-0007]
source: docs/features/FEAT-0003-tornei-elementi-partecipanti.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Permettere a un utente attivo di creare un torneo in bozza e gestirne i dettagli.

**Comportamento richiesto.**
- Il creatore del torneo diventa `owner`; lo slug è generato dal nome ed è univoco.
- Un torneo in `draft` è visibile solo agli organizzatori.
- Si possono modificare nome, descrizione e copertina tramite URL esterno.
- La lista tornei mostra le tab "Partecipo" e "Organizzo"; l'admin vede anche "Utenti".
- Il dettaglio del torneo mostra lo stato e i dati di base.
- Una rotta o un'azione non autorizzata restituisce 403.

**Fuori scope.** Elementi, partecipanti, fasi, pubblicazione.

## Acceptance criteria
- [ ] Un utente attivo crea un torneo e ne diventa owner.
- [ ] Lo slug è univoco e stabile.
- [ ] Un draft non è visibile a chi non è organizzatore.
- [ ] Nome, descrizione e copertina si aggiornano e persistono.
- [ ] La lista tornei filtra correttamente per ruolo.

## Choices

Nessuna scelta registrata.
