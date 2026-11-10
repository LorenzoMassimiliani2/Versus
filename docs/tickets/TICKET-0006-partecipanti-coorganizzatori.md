---
id: TICKET-0006
title: Partecipanti, co-organizzatori e limiti
status: ready-for-agent
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

| decisione | rationale | alternatives_rejected | evidence |
|---|---|---|---|
| Migrazione `0004_tournament_participants.sql` con `status` `active`/`removed`, PK composta `(tournament_id, user_id)`, `added_by`/`added_at`/`removed_at` e indice su `user_id` | rispetta la tabella D1 della spec e conserva lo storico della rimozione senza duplicare righe | cancellazione fisica della riga (perde lo storico), tabella di storico separata (complessità non necessaria) | `migrations/0004_tournament_participants.sql`, `src/worker/db/migrations.test.ts` |
| Il limite di 20 partecipanti attivi è un controllo applicativo: il ventunesimo restituisce `409 participant_limit_reached`; riaggiungere un partecipante già attivo è idempotente (`200`), riaggiungerne uno rimosso lo riattiva (`201`) | il limite è di istanza (ADR-0009), non un vincolo DDL esprimibile in SQLite; l'idempotenza evita errori da doppio clic | limite solo in UI, errore `409` anche per un partecipante già attivo | `src/worker/routes/participants.test.ts` |
| Aggiunta e rimozione di partecipanti consentite solo con torneo in `draft`, altrimenti `409 tournament_not_editable`; la rimozione è logica (`status = 'removed'`, `removed_at`) | il ticket dichiara fuori scope la gestione durante il torneo; TICKET-0033 rilasserà il vincolo a «tra una fase e l'altra» | consentire subito le modifiche in `published`/`running` (anticipa TICKET-0033 senza le fasi) | `src/worker/routes/participants.ts`, test «rifiuta modifiche quando il torneo non è più in bozza» |
| Visibilità: il partecipante attivo vede il torneo solo se non è `draft`; `GET /api/tournaments` include i tornei partecipati solo se non in bozza; se un utente è sia organizzatore sia partecipante prevale il ruolo di organizzatore | la spec dice che la pubblicazione rende il torneo visibile ai partecipanti e che le bozze restano riservate agli organizzatori; un solo `role` per riga mantiene semplice la UI a tab | mostrare le bozze ai partecipanti, restituire un array di ruoli (complica tab e dettaglio) | `src/worker/db/tournaments.ts`, test «mostra nella lista solo i tornei pubblicati a cui si partecipa» |
| Solo gli organizzatori (`owner` o `co_organizer`) gestiscono i partecipanti; solo l'`owner` nomina e revoca i co-organizzatori; l'owner non è revocabile (`409 cannot_remove_owner`) | replica la matrice dei permessi della spec e TICKET-0033 | permettere al co-organizzatore di nominare altri co-organizzatori (vietato dalla matrice) | `src/worker/routes/participants.test.ts` |
| Aggiunta rotta `GET /api/tournaments/:id/candidates` (organizzatore) che restituisce gli utenti attivi con `isParticipant` | la UI deve selezionare utenti esistenti, ma `GET /api/users` è riservata all'admin dalla spec; la rotta dedicata non espone flag amministrativi | allargare `GET /api/users` a tutti gli autenticati (indebolisce una rotta admin), inserimento manuale dello username (nessuna selezione) | `src/worker/routes/participants.ts`, `src/components/tournament/ParticipantsPanel.vue` |
| `GET /api/tournaments/:id/participants` restituisce sia attivi sia rimossi, ordinati con gli attivi per primi; il completamento per fase non è ancora esposto | le fasi arrivano con TICKET-0007, quindi il completamento non è calcolabile; lo stato del partecipante è l'informazione disponibile | omettere i rimossi (la UI non mostrerebbe lo storico richiesto «stato dei partecipanti») | `src/worker/routes/participants.ts`, `src/components/tournament/ParticipantsPanel.vue` |
| Nuovi componenti `ParticipantsPanel` (solo organizzatori, editabile in bozza) e `OrganizersPanel` (lista a tutti i membri, comandi solo all'owner); il dettaglio torneo sostituisce la vecchia lista statica degli organizzatori | separa presentazione e gestione, riusa il pattern dei pannelli esistenti e lascia il dettaglio leggibile ai partecipanti | aggiungere tutta la logica dentro `TournamentDetailView.vue` (componente già grande e non testabile in isolamento) | `src/components/tournament/ParticipantsPanel.test.ts`, `src/components/tournament/OrganizersPanel.test.ts`, `src/views/TournamentDetailView.test.ts` |
