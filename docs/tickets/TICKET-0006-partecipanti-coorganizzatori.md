---
id: TICKET-0006
title: Partecipanti, co-organizzatori e limiti
status: needs-triage
category: enhancement
blocked_by: [TICKET-0004, TICKET-0003]
blocks: [TICKET-0008, TICKET-0009]
source: docs/features/FEAT-0003-tornei-elementi-partecipanti.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Selezionare chi vota e chi collabora alla gestione del torneo.

**Comportamento richiesto.**
- L'organizzatore seleziona partecipanti tra gli utenti esistenti.
- L'`owner` nomina e revoca co-organizzatori; il co-organizzatore non può nominarne altri.
- Un torneo accetta al massimo 20 partecipanti attivi.
- Un utente può partecipare a più tornei contemporaneamente.
- La UI mostra lo stato dei partecipanti e il completamento per fase, quando disponibile.

**Fuori scope.** Aggiunta o rimozione di partecipanti durante il torneo, voto.

## Acceptance criteria
- [ ] L'organizzatore aggiunge e rimuove partecipanti in bozza.
- [ ] Il ventunesimo partecipante attivo viene rifiutato con 409.
- [ ] L'owner nomina un co-organizzatore; il co-organizzatore non può nominare altri.
- [ ] Un utente può essere partecipante in più tornei.
- [ ] La UI elenca i partecipanti e il loro stato.

## Choices

Nessuna scelta registrata.
