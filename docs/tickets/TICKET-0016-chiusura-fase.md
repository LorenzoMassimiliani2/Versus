---
id: TICKET-0016
title: "Chiudere una fase: manuale, tutti hanno votato, scadenza"
status: done
category: enhancement
blocked_by: [TICKET-0015]
blocks: [TICKET-0017, TICKET-0021, TICKET-0023]
source: docs/features/FEAT-0007-ciclo-fase-avanzamento.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Chiudere la finestra di voto e congelare i risultati.

**Comportamento richiesto.**
- La chiusura è disponibile manualmente all'organizzatore.
- Con `all_voted`, la fase si chiude quando ogni votante attivo ha votato o si è astenuto su ogni target.
- Con `deadline`, la prima richiesta dopo la scadenza chiude la fase.
- La transizione `open -> closed` è idempotente: due richieste concorrenti non producono due snapshot.
- Alla chiusura si calcolano i risultati e si salva `phase_results` con `config_snapshot` e `results`.
- Un pareggio irrisolto porta la fase in `awaiting_resolution` e non produce snapshot.
- Una fase chiusa non accetta più voti: 409.

**Fuori scope.** Auto-avanzamento, risoluzione manuale, filtri di segretezza.

## Acceptance criteria
- [x] La chiusura manuale passa la fase a `closed` e crea uno snapshot.
- [x] Con `all_voted` la fase si chiude al completamento di tutti i votanti.
- [x] Con `deadline` la fase si chiude alla prima richiesta dopo la scadenza.
- [x] Due richieste concorrenti producono un solo snapshot.
- [x] Un pareggio irrisolto porta la fase in `awaiting_resolution` senza snapshot.

## Choices

| decisione | rationale | alternatives_rejected | evidence |
|---|---|---|---|
| Il calcolo dei risultati vive in `src/domain/phase-results.ts` e compone `tallyDuel`, `tallyRanking`, `tallyPick`, `computeStandings`, `applyAdvance` e `applyRepechage`; il worker carica D1 e orchestra la transazione | tiene le regole pure fuori dal worker e riusa i motori già testati, come richiesto dal ticket | ricalcolare le formule nel route handler: duplicazione di dominio non testabile senza D1 | `src/domain/phase-results.ts`, `phase-results.test.ts` |
| La chiusura usa un batch con `UPDATE phases ... WHERE status = 'open'` e `INSERT OR IGNORE INTO phase_results ... SELECT ... WHERE EXISTS (phases.closed_at = ?)`; l'insert resta protetto anche da `UNIQUE(phase_id, version)` | il claim e lo snapshot sono nella stessa transazione: due richieste concorrenti non producono due righe né uno stato chiuso senza snapshot | claim separato seguito da insert: un errore tra i due lascerebbe una fase chiusa senza risultato | `closePhase`, test «due richieste concorrenti producono un solo snapshot» |
| I trigger si valutano in `evaluateCloseTrigger`: `deadline` se configurata e `now >= deadline`, altrimenti `all_voted`; la regola lazy viene applicata da `GET /api/tournaments/:id/phases` e da `POST /api/phases/:id/close` (che chiude sempre, essendo manuale) | la spec richiede la valutazione lazy su richieste di stato o azione; il polling condizionale non esiste ancora (TICKET-0026) e questo è il punto di stato delle fasi disponibile | un job schedulato: Workers non ha scheduler e la spec impone la valutazione lazy | `closePhaseIfDue`, `listPhasesHandler`, test `all_voted` e `deadline` |
| Per i voti a scheda il target è il girone nelle fasi `group` e la fase stessa nelle altre formule; il completamento `all_voted` confronta il numero di target distinti con i target attesi | allinea il conteggio di completamento al modello "un girone alla volta" della modalità sequenziale e lascia un target unico per classifica e pick | un target per elemento: renderebbe `all_voted` equivalente a "tutti hanno assegnato punti a tutti" | `countBallotVotersMissingVotes`, test `all_voted` |
| Le tabelle `duel_votes` e `ballot_votes` non esistono ancora: arrivano con TICKET-0018/0019. La chiusura controlla `sqlite_master` e le considera vuote se assenti | il ticket è sbloccato da TICKET-0015 e deve poter chiudere una fase anche prima dello schema dei voti, senza creare migrazioni che entrerebbero in conflitto con i ticket di voto | aggiungere qui una migrazione con le tabelle dei voti: duplicherebbe quella di TICKET-0018/0019 | `hasVoteTables`; i test creano lo schema dei voti in locale |
| `config_snapshot` salva `{ formula, voteType, config, advance }`; `results` segue la forma della spec con `groups`, `matches`, `qualified`, `repechage`, `winnerElementId` e aggiunge `ranking` per le fasi classifica/pick | la configurazione usata e la regola di avanzamento spiegano lo snapshot; `ranking` è necessario perché la classifica di una fase `ranking` non sta nei gironi | salvare solo `config`: perderebbe la regola di avanzamento che determina qualificati e ripescati | `closePhase`, test snapshot |
| Un pareggio blocca la chiusura solo se incide sulla soglia di avanzamento (`top_global.n`, `top_per_group.n`, `winner` = 1); un duello irrisolto blocca sempre. In entrambi i casi la fase va in `awaiting_resolution` senza `phase_results` | segue la spec: un pareggio sotto la soglia non cambia i qualificati, mentre un duello senza vincitore non è avanzabile | bloccare su qualunque pareggio: fermerebbe fasi con `advance: all` inutilmente | `tieCrossesCutoff`, test «pareggio sotto la soglia» e `awaiting_resolution` |
| Con `advance.type = "winner"` la chiusura porta il torneo a `concluded`, valorizza `concluded_at` e `winner_element_id` | è il passo 4 della sezione «Apertura, chiusura, avanzamento» della spec; l'auto-avanzamento e la conclusione dell'ultima fase con `autoAdvance` restano a TICKET-0017 | lasciare il torneo in `running`: il vincitore resterebbe non registrato | test «chiude una fase aperta e salva lo snapshot» |
| Il rifiuto 409 dei voti su fase chiusa non ha una rotta da proteggere in questo ticket: le rotte di voto sono TICKET-0018/0019. La chiusura lascia la fase in `closed` e le rotte di voto controlleranno lo stato prima di scrivere | evita di implementare handler di voto fuori scope o guardie non esercitate | aggiungere qui endpoint di voto minimi: duplicherebbero TICKET-0018/0019 | assenza di rotte `/api/phases/:id/duels/...` e `/ballots` nel branch |
