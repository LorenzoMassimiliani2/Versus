---
id: TICKET-0007
title: Modello e API del piano di fasi
status: needs-triage
category: enhancement
blocked_by: [TICKET-0004, TICKET-0005]
blocks: [TICKET-0008, TICKET-0010, TICKET-0013, TICKET-0028]
source: docs/features/FEAT-0004-piano-fasi-validazione-anteprima.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Rappresentare e gestire il piano come sequenza ordinata di fasi configurabili.

**Comportamento richiesto.**
- Ogni fase ha posizione, nome, formula (`group`, `elimination`, `ranking`), scheda (`duel`, `ranking`, `pick`), configurazione e regola di avanzamento.
- Le posizioni sono contigue e partono da 1.
- Le fasi `draft` sono modificabili; le fasi avviate non lo sono.
- Il piano conserva le impostazioni `selfVoteAllowed` e `autoAdvance`.
- Le API restituiscono il piano completo e consentono di aggiungere, modificare, eliminare e riordinare fasi non avviate.
- La UI mostra il piano e permette di modificarlo prima della pubblicazione.

**Fuori scope.** Validazione semantica completa, anteprima, pubblicazione, apertura fasi.

## Acceptance criteria
- [ ] Un piano con posizioni contigue viene salvato e riletto correttamente.
- [ ] Una fase con formula o scheda non ammessa viene rifiutata.
- [ ] Una fase avviata non può essere modificata.
- [ ] Aggiungere, eliminare e riordinare fasi aggiorna le posizioni.
- [ ] `selfVoteAllowed` e `autoAdvance` sono persistiti nelle impostazioni del torneo.

## Choices

Nessuna scelta registrata.
