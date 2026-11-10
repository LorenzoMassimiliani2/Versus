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

| decisione | rationale | alternative_rejected | evidence |
|---|---|---|---|
| `POST /api/tournaments/:id/publish` richiede organizzatore (403), torneo `draft` (409) e piano valido; in caso di piano invalido risponde `422 { error: "plan_invalid", errors }` con gli stessi codici dell'anteprima | la UI deve poter mostrare gli errori bloccanti fase per fase; riusare `validatePlan` evita una seconda implementazione delle regole | `400` generico senza elenco errori: la UI non saprebbe cosa correggere | `src/worker/routes/tournaments.ts`, `src/worker/routes/publish.test.ts` |
| La validazione condivisa è in `loadPlanValidation`, usata da `GET /preview` e da `POST /publish` | anteprima e pubblicazione devono applicare esattamente le stesse regole | duplicare la costruzione di `PlanInput` nelle due rotte | `src/worker/routes/tournaments.ts` |
| La transizione a `published` è un `UPDATE ... WHERE status = 'draft'` e imposta `published_at` e `updated_at`; se `meta.changes = 0` risponde `409` | rende la pubblicazione idempotente rispetto a richieste concorrenti, come la chiusura delle fasi | leggere lo stato e poi aggiornare: due richieste potrebbero pubblicare due volte | `publishTournament` in `src/worker/db/tournaments.ts`, test «non ripubblica un torneo già pubblicato» |
| Il limite di 10 tornei attivi conta a livello di istanza i tornei `published` e `running` e si verifica prima dell'aggiornamento; le bozze non contano | ADR-0009 e criterio 58 della spec | contare i tornei dell'organizzatore o includere le bozze: violerebbe la regola di istanza | `countActiveTournaments`, test «rifiuta l undicesimo torneo attivo» e «non conta le bozze» |
| Le impostazioni si bloccano quando esiste almeno una fase `open`, `awaiting_resolution` o `closed`; un `PATCH` che le rimanda invariate resta permesso | evita di rompere il form dettagli che invia sempre `settings`, pur rifiutando ogni modifica reale dopo l'apertura | rifiutare qualsiasi payload con `settings`: impedirebbe di rinominare il torneo | `countStartedPhases`, test «rinomina dopo l apertura» |
| Il wizard è una vista dedicata `/tornei/:id/wizard` che orchestra i pannelli esistenti (dettagli, elementi, campi, partecipanti, piano, anteprima, pubblica); la creazione del torneo resta la form esistente | il ticket consente il riuso dei pannelli e la creazione non è oggetto del ticket; un solo punto per il flusso guidato | riscrivere i form dentro il wizard o unire creazione e wizard: duplicazione e scope più ampio | `src/views/TournamentWizardView.vue`, `src/router/index.ts`, `src/views/TournamentDetailView.vue` |
| Il pulsante di pubblicazione si abilita solo con `preview.result.valid === true`; dopo la pubblicazione il wizard mostra il blocco «Torneo pubblicato» con stato `published` e il link al dettaglio | la UI blocca il piano invalido senza aspettare la risposta del server, e conferma l'esito con lo stato reale | lasciare il pulsante sempre attivo e mostrare solo l'errore del server | `src/views/TournamentWizardView.vue`, test «blocca la pubblicazione quando il piano non è valido» e «pubblica un piano valido» |
| Il wizard mostra e modifica `selfVoteAllowed` e `autoAdvance` nei dettagli; le caselle sono disabilitate quando una fase è già avviata | copre il requisito delle impostazioni nel wizard e riflette il vincolo A2 anche lato UI, senza duplicare il controllo del server | nascondere le impostazioni: l'utente non vedrebbe il valore corrente | `TournamentWizardView.vue`, test «salva i dettagli con le impostazioni» |
| Dopo la pubblicazione il piano non è più modificabile perché tutte le rotte di fasi, elementi e partecipanti richiedono già `status = 'draft'` | la transizione a `published` chiude automaticamente la finestra di modifica prevista da A2, senza nuovi controlli | aggiungere un ulteriore flag di modifica: stato duplicato | `src/worker/routes/phases.ts`, `src/worker/routes/elements.ts`, `src/worker/routes/participants.ts` |
| «Non votabile» dopo la pubblicazione è garantito dall'assenza delle rotte di voto in questo ticket; la visibilità è coperta dai controlli esistenti che escludono le bozze per i partecipanti | apertura fase e voto sono esplicitamente fuori scope | introdurre un flag `canVote` non usato da nessuna rotta | `findTournamentRole`, `listMemberTournaments`, test di visibilità |
