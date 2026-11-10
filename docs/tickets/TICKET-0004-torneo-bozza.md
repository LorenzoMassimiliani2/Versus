---
id: TICKET-0004
title: Creare e gestire un torneo in bozza
status: ready-for-agent
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

| decisione | rationale | alternatives_rejected | evidence |
|---|---|---|---|
| Lo slug è generato da `slugify()` in `src/domain/` con suffisso numerico (`-2`, `-3`) in caso di collisione; non cambia più dopo la creazione | slug stabile e riproducibile, logica pura e testabile | rigenerarlo a ogni PATCH del nome (rompe i link), UUID come slug (illeggibile) | `src/domain/slug.test.ts`, `src/worker/routes/tournaments.test.ts` |
| `winner_element_id` resta `TEXT` senza foreign key, come `audit_log.tournament_id` | `elements` arriva con TICKET-0005 e SQLite non permette di aggiungere FK dopo | rinviare la colonna a una migrazione futura (richiederebbe rebuild della tabella) | `migrations/0002_tournaments.sql` |
| `POST /api/tournaments` salva `settings` come `{"autoAdvance":false}` di default; accetta solo `settings.autoAdvance` booleano | rispetta il default della spec e ADR-0010 senza anticipare le impostazioni future | `{}` con default applicato in lettura (più punti di verità) | `src/worker/routes/tournaments.test.ts` |
| `GET /api/tournaments` elenca per ora solo i tornei dove l'utente è organizzatore, con `role` nella risposta | `tournament_participants` arriva con TICKET-0006; la tab Partecipo resta vuota fino ad allora | creare ora la tabella partecipanti (fuori scope del ticket) | commento in `src/worker/routes/tournaments.ts` |
| Un torneo esistente ma non visibile risponde `403`; un id inesistente risponde `404` | distingue autorizzazione da assenza della risorsa, coerente con le rotte utenti | `404` per entrambi (nasconde l'esistenza ma confonde la UI) | test di autorizzazione |
| Anche l'admin non organizzatore riceve `403` sul dettaglio e non vede tornei altrui in lista | la spec dichiara i ruoli indipendenti: l'admin non è automaticamente membro | accesso in lettura per gli admin (violerebbe la matrice dei permessi) | test `nasconde la bozza a chi non è organizzatore, admin compreso` |
| `PATCH /api/tournaments/:id` modifica solo nome, descrizione e copertina; le impostazioni si passano solo alla creazione | il ticket limita la modifica ai dettagli; `settings.autoAdvance` prima della prima fase arriverà con i ticket delle fasi | accettare già `settings` nel PATCH (senza fasi non è verificabile) | `parsePatchInput` |
| La URL di copertina è validata come `http`/`https`, massimo 2048 caratteri; stringa vuota o `null` la rimuovono | evita URL non incorporabili e permette di cancellare la copertina | nessuna validazione (contenuti arbitrari) | test `cancella la copertina con null` |
| La home `/` è la lista tornei; il dettaglio è `/tornei/:id`; l'admin vede la tab Utenti accanto a Partecipo/Organizzo | rispetta la schermata 2 della spec senza aggiungere una schermata intermedia | mantenere la vecchia home e aggiungere `/tornei` (passaggio in più) | `src/router/index.ts`, `src/views/TournamentsView.vue` |
