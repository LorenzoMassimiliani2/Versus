---
id: TICKET-0023
title: Risolvere manualmente uno spareggio
status: ready-for-agent
category: enhancement
blocked_by: [TICKET-0016, TICKET-0021]
blocks: [TICKET-0024]
source: docs/features/FEAT-0009-risultati-segretezza-risoluzione.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Sbloccare una fase quando i criteri automatici non bastano.

**Comportamento richiesto.**
- Una fase in `awaiting_resolution` espone all'organizzatore i target ambigui.
- L'organizzatore invia un ordinamento per ogni target e una nota obbligatoria.
- La risoluzione produce una riga in `audit_log` e chiude la fase.
- La risoluzione è idempotente e non accetta un secondo ordinamento per lo stesso target.
- Con `autoAdvance` attivo, dopo la risoluzione e la chiusura si apre la fase successiva.
- Un partecipante non può vedere né usare la rotta di risoluzione: 403.

**Fuori scope.** Spareggi automatici, podio, export.

## Acceptance criteria
- [ ] Una fase in `awaiting_resolution` mostra i target da risolvere all'organizzatore.
- [ ] La risoluzione richiede una nota e scrive una riga di audit.
- [ ] Dopo la risoluzione la fase passa a `closed`.
- [ ] Un secondo tentativo per lo stesso target viene rifiutato.
- [ ] Un partecipante riceve 403 sulla rotta di risoluzione.

## Choices

Nessuna scelta registrata.
