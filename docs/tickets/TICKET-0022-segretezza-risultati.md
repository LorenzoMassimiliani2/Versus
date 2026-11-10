---
id: TICKET-0022
title: Filtrare i risultati per segretezza
status: ready-for-agent
category: enhancement
blocked_by: [TICKET-0021]
blocks: [TICKET-0024, TICKET-0026]
source: docs/features/FEAT-0009-risultati-segretezza-risoluzione.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Garantire che ogni ruolo veda solo ciò che la modalità di segretezza consente.

**Comportamento richiesto.**
- In `live` il partecipante vede i risultati aggregati durante la fase.
- In `blind` vede solo il proprio voto fino alla chiusura.
- In `secret` l'organizzatore riceve solo aggregati anche dopo la chiusura.
- In nessuna modalità un partecipante riceve l'identità di un altro votante.
- Il filtro è applicato nelle API, non solo nella UI.
- I test verificano i payload per ruolo e modalità.

**Fuori scope.** Crittografia lato client, accesso diretto a D1, UI oltre i risultati.

## Acceptance criteria
- [ ] `live` mostra aggregati al partecipante durante la fase.
- [ ] `blind` mostra solo il proprio voto prima della chiusura.
- [ ] `secret` non espone voti individuali all'organizzatore tramite API.
- [ ] Nessuna risposta API contiene l'identità dei votanti per un partecipante.
- [ ] I test coprono i payload per ruolo e modalità.

## Choices

| decisione | rationale | alternatives_rejected | evidence |
|---|---|---|---|
| Nuovo modulo puro `src/domain/results-secrecy.ts` con `resultsPolicy({ secrecy, role, phaseState })` che restituisce `aggregate`, `own_vote` o `hidden` | isola la tabella di segretezza della spec in un solo punto testabile senza D1, HTTP o UI; la rotta si limita ad applicare la decisione | duplicare la matrice nella rotta e nella UI: due fonti di verità che possono divergere | `src/domain/results-secrecy.test.ts` (13 casi: 3 modalità × 2 ruoli × aperta/chiusa + pending) |
| In fase aperta `aggregate` viene calcolato al volo dai voti correnti; nessuno snapshot viene creato | `live` richiede aggregati durante la fase e la spec vuole lo snapshot solo alla chiusura | scrivere uno snapshot a ogni lettura: scritture inutili e risultati congelati a metà fase | test «in live mostra gli aggregati… durante la fase» verifica `version: 0` e zero righe in `phase_results` |
| `blind` e `secret` per il partecipante in fase aperta restituiscono `own_vote`: nessun aggregato, solo `ownVotes` del richiedente | la spec dice «solo il proprio voto»; il payload non contiene voti altrui né identificativi di votanti | restituire aggregati parziali al partecipante: viola il criterio 34 | test blind/secret aperti, `ownVotes` con solo il voto di bruno |
| L'organizzatore in fase aperta riceve aggregati anche con `blind` e `secret`; dopo la chiusura tutti i ruoli ricevono aggregati | riproduce la tabella «Segretezza» della spec: in `secret` l'organizzatore non vede mai chi ha votato cosa | nascondere gli aggregati all'organizzatore: la spec gli consente di consultarli; esporre voti individuali: vietato in `secret` | test «in secret mostra solo aggregati all organizzatore durante la fase aperta» e «… nemmeno dopo la chiusura» |
| I voti individuali non sono esposti a nessun ruolo in questa rotta; l'unica eccezione è `ownVotes`, cioè i voti del richiedente | il ticket vieta l'identità dei votanti ai partecipanti e i voti individuali all'organizzatore in `secret`; non esporli affatto è la scelta più semplice e sicura | aggiungere una vista «voti individuali» per gli organizzatori in `live`/`blind`: non richiesta dal ticket e amplierebbe la superficie di fuga | assenza di campi votante in `PhaseResultsBody`; test sul JSON serializzato senza `u1`/`u2` |
| La risposta aggiunge `state`, `secrecy`, `visibility` e, solo per `own_vote`, `ownVotes`; per gli aggregati mantiene i campi di TICKET-0021 | la UI deve spiegare perché non vede i risultati e distinguere fase aperta, cieca e segreta | dedurre la modalità dalla UI (che non la conosce per i partecipanti): richiederebbe una seconda chiamata | `src/views/PhaseResultsView.vue`, test view «fase cieca aperta» e «fase segreta chiusa» |
| Una fase `pending`, `cancelled` o `awaiting_resolution` continua a rispondere `409` (`phase_not_closed` / `phase_awaiting_resolution`) | mantiene il contratto di TICKET-0021 per le fasi che non hanno risultati; `hidden` resta nello stato della policy e la UI lo gestisce difensivamente | restituire `200` con `visibility: hidden`: cambierebbe il contratto esistente senza un requisito del ticket | test «espone aggregati provvisori di una fase aperta e non di una pending» |
| Il dettaglio torneo collega anche le fasi `open`; per un partecipante in `blind`/`secret` l'etichetta è «Vedi il tuo voto» | senza link il partecipante non potrebbe consultare il proprio voto prima della chiusura | collegare solo le fasi chiuse: renderebbe `own_vote` irraggiungibile dalla UI | `TournamentDetailView.vue`, `resultsLinkLabel`, test del dettaglio |

