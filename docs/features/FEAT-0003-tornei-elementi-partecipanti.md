---
id: FEAT-0003
title: Tornei, elementi e partecipanti
status: proposed
branch: feat/0003-tornei-elementi-partecipanti
worktree: .worktrees/0003
batch: 3
depends_on: [FEAT-0001, FEAT-0002]
touches: ["migrations/", "src/worker/routes/tournaments.ts", "src/worker/db/", "src/stores/tournament.ts", "src/views/tournaments/", "src/components/tournament/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Creare e gestire la bozza di un torneo: dettagli, campi personalizzati, elementi, partecipanti, co-organizzatori e visibilità.

**Fuori scope.** Piano delle fasi, pubblicazione, apertura delle fasi.

**Criteri di accettazione.**

- Un utente attivo crea un torneo e ne diventa `owner`; lo slug è generato dal nome ed è univoco.
- Un torneo in `draft` è visibile solo agli organizzatori.
- Si possono definire fino a 10 campi personalizzati per torneo.
- Ogni elemento ha nome, immagine obbligatoria, video YouTube opzionale e valori conformi ai campi.
- Gli elementi si possono riordinare e l'ordine è persistito.
- L'organizzatore seleziona i partecipanti tra gli utenti esistenti e nomina co-organizzatori.
- La pubblicazione dell'undicesimo torneo attivo è rifiutata con `409`.
- Un torneo con più di 20 partecipanti attivi è rifiutato.

**Priorità proposta.** P0 — è il contenitore di tutto il resto.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0003-tornei-elementi-partecipanti.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: `docs/tickets/TICKET-0004-*.md`, `docs/tickets/TICKET-0005-*.md`, `docs/tickets/TICKET-0006-*.md`

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
