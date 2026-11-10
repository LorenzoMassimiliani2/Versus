---
id: TICKET-0032
title: Registrare le modifiche strutturali in audit log
status: needs-triage
category: enhancement
blocked_by: [TICKET-0031]
blocks: []
source: docs/features/FEAT-0014-modificabilita-audit.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Rendere tracciabile ogni modifica strutturale del torneo.

**Comportamento richiesto.**
- Ogni modifica a torneo, fasi, elementi, partecipanti e organizzatori produce una riga in `audit_log`.
- La riga contiene attore, azione, tipo e id del target, stato prima e dopo, data.
- L'organizzatore può leggere il log del proprio torneo.
- I partecipanti non possono leggere il log.
- Le modifiche non strutturali, come il voto, non finiscono in `audit_log`.

**Fuori scope.** Audit delle azioni admin, esportazione del log, retention.

## Acceptance criteria
- [ ] Una modifica a una fase pending produce una riga con before e after.
- [ ] La nomina di un co-organizzatore produce una riga.
- [ ] L'organizzatore legge il log del torneo.
- [ ] Un partecipante riceve 403 sul log.
- [ ] Il voto non produce righe in `audit_log`.

## Choices

Nessuna scelta registrata.
