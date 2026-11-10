---
id: TICKET-0020
title: Completamento, modalità sequenziale e auto-voto
status: needs-triage
category: enhancement
blocked_by: [TICKET-0018, TICKET-0019]
blocks: []
source: docs/features/FEAT-0008-voto-crediti.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Gestire il ritmo del voto e le regole di partecipazione.

**Comportamento richiesto.**
- Con `simultaneous` tutti i target sono aperti dall'inizio.
- Con `sequential` è aperto un solo target alla volta; quando tutti i votanti hanno votato o si sono astenuti, si apre il successivo.
- L'organizzatore può forzare il passaggio al target successivo; l'azione è tracciata.
- La UI mostra quante sfide o schede mancano e quali sono completate.
- Con `selfVoteAllowed: false`, il voto per un elemento collegato al votante è rifiutato con 422.
- Il completamento considera anche l'astensione come voto espresso.

**Fuori scope.** Risultati, crediti, auto-avanzamento di fase.

## Acceptance criteria
- [ ] In simultaneo tutti i target sono votabili.
- [ ] In sequenziale si apre un target alla volta e il successivo si apre al completamento.
- [ ] L'organizzatore può forzare il passaggio e l'azione è tracciata.
- [ ] Con auto-voto disattivato il voto per il proprio elemento restituisce 422.
- [ ] La UI mostra completamento e target mancanti.

## Choices

Nessuna scelta registrata.
