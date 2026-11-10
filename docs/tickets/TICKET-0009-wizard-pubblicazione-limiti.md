---
id: TICKET-0009
title: Wizard, pubblicazione e limiti dei tornei attivi
status: ready-for-agent
category: enhancement
blocked_by: [TICKET-0006, TICKET-0008]
blocks: [TICKET-0015, TICKET-0031]
source: docs/features/FEAT-0004-piano-fasi-validazione-anteprima.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Portare un torneo dalla bozza alla pubblicazione, con un flusso guidato e limiti di istanza.

**Comportamento richiesto.**
- Il wizard guida dettagli, elementi, campi, partecipanti, piano, anteprima e pubblicazione.
- La pubblicazione richiede piano valido, almeno 2 elementi e almeno 1 partecipante attivo.
- Alla pubblicazione il torneo passa a `published` e diventa visibile ai partecipanti, ma non votabile.
- La pubblicazione dell'undicesimo torneo attivo (`published` o `running`) è rifiutata con `409`; le bozze non contano.
- `autoAdvance` e `selfVoteAllowed` sono impostabili nel wizard e modificabili solo prima dell'apertura della prima fase.
- Dopo la pubblicazione il piano non è più liberamente modificabile secondo A2.

**Fuori scope.** Apertura della prima fase, voto, risultati.

## Acceptance criteria
- [ ] Il wizard permette di completare tutti i passi e pubblicare un piano valido.
- [ ] La pubblicazione senza elementi o partecipanti è bloccata con un errore chiaro.
- [ ] Il torneo pubblicato è visibile ai partecipanti ma non votabile.
- [ ] La pubblicazione dell'undicesimo torneo attivo restituisce 409.
- [ ] `autoAdvance` è modificabile prima dell'apertura della prima fase e rifiutato dopo con 409.

## Choices

Nessuna scelta registrata.
