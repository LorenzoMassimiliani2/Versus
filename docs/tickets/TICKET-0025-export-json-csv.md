---
id: TICKET-0025
title: Esportare dati in JSON e CSV
status: needs-triage
category: enhancement
blocked_by: [TICKET-0024]
blocks: []
source: docs/features/FEAT-0010-podio-statistiche-export.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Consentire all'organizzatore di portare fuori i dati del torneo.

**Comportamento richiesto.**
- L'export è disponibile solo agli organizzatori.
- L'export JSON contiene torneo, elementi, fasi, risultati e qualificazioni.
- L'export CSV produce un file leggibile con una riga per elemento e una per fase, senza dipendenze da Excel.
- Il nome del file include slug del torneo e formato.
- Un formato non supportato restituisce 400.

**Fuori scope.** Excel, PDF, immagini, export parziali.

## Acceptance criteria
- [ ] L'export JSON contiene tutte le sezioni richieste.
- [ ] L'export CSV è leggibile e non richiede Excel.
- [ ] Un partecipante riceve 403 sull'export.
- [ ] Un formato non supportato restituisce 400.
- [ ] Il file scaricato ha un nome coerente con torneo e formato.

## Choices

Nessuna scelta registrata.
