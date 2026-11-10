---
id: TICKET-0020
title: Completamento, modalità sequenziale e auto-voto
status: done
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

| decisione | rationale | alternatives_rejected | evidence |
|---|---|---|---|
| Migrazione `0009_phase_targets.sql` con tabella `phase_targets` (`phase_id`, `target_id`, `name`, `position`, `status`, `opened_at`, `completed_at`) e indice `(phase_id, position, status)` | serve uno stato persistente per ordine e apertura dei target; una tabella esplicita rende completati, corrente e mancanti interrogabili e non richiede di reinterpretare lo stato delle sfide | colonna `current_target_id` su `phases`: non conserva l'ordine, i target completati né i nomi da mostrare | `migrations/0009_phase_targets.sql`, test di migrazione e di route |
| La modalita `simultaneous` non crea righe in `phase_targets` e lascia tutte le sfide `open` come prima | il ticket chiede di non cambiare il comportamento esistente; migrare le fasi gia aperte non serve perché la tabella è letta solo per `sequential` | popolare i target anche in simultaneo: aggiungerebbe stato non necessario e rischio di regressione | test «lascia tutte le sfide votabili» |
| Target votabili: una sfida per `elimination`, un girone per `group`, la fase stessa per le altre formule. Per `group` il target resta il girone anche con voto duello; tutte le sfide del girone appartengono allo stesso target | rispetta la spec «una sfida per elimination, un girone per group» e riusa l'id già usato da `ballot_votes` | usare sempre l'id della fase: non distinguerebbe i gironi e impedirebbe il completamento per girone | `src/worker/phase-targets.ts`, test sequenziale duelli e gironi |
| All'apertura sequenziale il primo target è `open` e gli altri `pending`; le sfide fuori dal target corrente nascono `pending` e vengono aperte all'avanzamento | il vincolo «un solo target aperto» vale anche a livello di `matches`, quindi la UI e il controllo `match_not_open` restano coerenti senza logica speciale nel client | lasciare tutte le sfide `open` e filtrare solo in lettura: il controllo di voto dovrebbe ignorare lo stato reale della sfida | `openPendingPhase`, test su stato delle sfide |
| L'avanzamento automatico avviene nel salvataggio del voto: se ogni votante attivo ha votato o si è astenuto sul target corrente, il target passa a `completed`, le sue sfide a `closed` e il successivo a `open`. Il claim è un `UPDATE ... WHERE status = 'open'` | l'astensione è una riga in `duel_votes`, quindi il conteggio la include; il claim condizionale evita doppie aperture con richieste concorrenti | avanzare solo al polling di stato: il target successivo resterebbe chiuso fino alla richiesta seguente e il voto appena salvato sembrerebbe perso | `maybeAdvanceSequential`, `advanceTarget`, test di completamento |
| Passaggio forzato: `POST /api/phases/:id/targets/advance`, solo organizzatore, con `targetId` opzionale. Il target viene completato anche se non tutti hanno votato; l'azione scrive `audit_log` con azione `phase.target_advance` | l'organizzatore deve poter sbloccare una fase; `targetId` rende l'operazione idempotente (ripeterla su un target già completato non avanza oltre) e l'audit conserva before/after | endpoint senza `targetId`: due retry farebbero avanzare due target; nessun audit: non sarebbe tracciato | `routes/phase-targets.ts`, test passaggio forzato e ripetizione |
| Auto-voto: con `settings.selfVoteAllowed = false` il voto su un lato collegato a `elements.user_id` del votante e ogni scheda che assegna punti o pick al proprio elemento restituiscono `422 self_vote_forbidden` | la regola è la stessa per duelli e schede e va applicata dopo la validazione della forma, così un payload non valido resta `invalid_payload` | confrontare solo gli elementi in ingresso alla fase: perderebbe il collegamento utente-elemento e il caso di un elemento non in ingresso | `selfVoteElementIds`, test duello, ranking e pick |
| `GET /api/phases/:id/ballot` espone `votingMode`, `progress` (target con stato e voto del votante) e lo `status` di ogni target; la UI mostra sezione «Avanzamento del voto», target corrente, completati e conteggio mancanti | il partecipante deve vedere quali target restano e perché una card è disabilitata; il dato deriva dalle stesse righe `phase_targets` usate dal server | calcolare il progresso nel client dai soli voti: non conosce l'ordine né i target ancora `pending` | `loadBallot`, `PhaseVoteView`, test view sequenziale |
| Modifica ed eliminazione del voto restano possibili solo sul target `open`; dopo il completamento la sfida è `closed` e la scheda risponde `409` | coerente con «finché il target è aperto» e con lo stato delle sfide già usato da TICKET-0018/0019 | consentire modifiche retroattive: cambierebbero un target già completato e potrebbero falsare l'avanzamento | test modifica/eliminazione dopo il completamento |
| Restano fuori scope risultati, segretezza, risoluzione spareggi e avanzamento automatico di fase | sono ticket successivi; qui si riusa la chiusura esistente senza modificarla | anticipare calcolo risultati o auto-avanzamento di fase | nessuna modifica a `phase-close` o `phase-results` |
