---
id: TICKET-0018
title: Votare un duello con crediti
status: ready-for-agent
category: enhancement
blocked_by: [TICKET-0015]
blocks: [TICKET-0020, TICKET-0021]
source: docs/features/FEAT-0008-voto-crediti.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Permettere il voto su una sfida 1 contro 1 con investimento di crediti.

**Comportamento richiesto.**
- Un partecipante vota `a`, `b` o `abstain` e indica i crediti investiti.
- Il peso del voto è `1 + crediti`; i crediti non possono superare budget o `maxPerMatch`.
- `abstain` conta come voto espresso ma non aggiunge peso e non accetta crediti.
- Ogni spesa produce una riga nel ledger crediti; cambiare lato rimborsa il lato precedente e addebita il nuovo.
- L'ultimo voto vince ed è idempotente per chiave.
- Il voto su una sfida non aperta è rifiutato con 409; crediti oltre il limite con 422.
- La UI mostra due card, il selettore crediti e l'astensione.

**Fuori scope.** Classifiche, pick, modalità sequenziale, auto-voto, risultati.

## Acceptance criteria
- [ ] Un voto con 5 crediti produce peso 6 e una riga di spesa.
- [ ] Cambiare lato rimborsa i crediti del lato precedente.
- [ ] `abstain` non aggiunge peso e rifiuta crediti.
- [ ] Crediti oltre `maxPerMatch` restituiscono 422.
- [ ] Il voto su una sfida chiusa restituisce 409.
- [ ] La UI salva e rilegge il proprio voto.

## Choices

- Migrazione `0007_duel_votes.sql` con `duel_votes`, `vote_events`,
  `credit_entries` e i tre indici minimi della spec. `credits` ha un `CHECK
  (credits >= 0)`; `vote_events` e `credit_entries` restano append-only per
  convenzione applicativa, senza update o delete.
  | vincolo di dominio | alternativa: nessun CHECK | test di migrazione e voto.
- Saldo crediti = `credits_budget` fotografato in `phase_voters` più la somma di
  `credit_entries` per fase e votante. Le spese sono importi negativi
  (`reason = spend`), i rimborsi positivi (`reason = refund`).
  | alternativa: saldo come sola somma del ledger, che partirebbe da zero e
  impedirebbe qualsiasi spesa | test su saldo e rimborso.
- Modifica del voto: se il voto è identico non produce né eventi né movimenti;
  altrimenti un nuovo `vote_events` e, se serve, righe `refund` del vecchio
  credito e `spend` del nuovo. L'ultimo voto vince per la chiave
  `(match_id, voter_id)`.
  | alternativa: eventi anche per voto identico, che renderebbero l'idempotenza
  non verificabile | test di idempotenza e cambio lato.
- `DELETE` scrive un `vote_events` con payload `{ deleted: true, side,
  credits }`, cancella `duel_votes` e rimborsa i crediti investiti. Ripetere il
  DELETE senza voto restituisce lo stato corrente senza effetti.
  | alternativa: 404, meno idempotente per un client che ritenta | test DELETE.
- `abstain` accetta solo crediti 0; con crediti restituisce 422
  `credits_on_abstain`. Crediti oltre budget/`maxPerMatch`/saldo restituiscono
  422 `credits_exceeded`; forma del voto non valida restituisce 422
  `invalid_vote`.
  | alternativa: troncare i crediti al massimo, che nasconderebbe l'errore |
  test dei limiti.
- Fase o sfida non aperta restituiscono 409 (`phase_not_open`,
  `match_not_open`) prima della validazione del corpo, come richiesto.
  | alternativa: 422, che confonderebbe stato e input | test delle chiusure.
- Aggiunta `GET /api/phases/:id/ballot` (già nella spec) perché la UI possa
  leggere sfide, elementi, proprio voto, saldo e completamento senza esporre i
  voti altrui.
  | alternativa: riuso della risposta di apertura, disponibile solo
  all'organizzatore e non aggiornata dopo i voti | test della scheda.
- `hasVoteTables` è stato sostituito da `hasVoteTable(name)` in
  `db/phase-close.ts`: la chiusura di un duello deve leggere `duel_votes` anche
  prima che TICKET-0019 crei `ballot_votes`.
  | alternativa: creare `ballot_votes` in questa migrazione, invadendo il
  ticket successivo | test di chiusura con voto da 5 crediti.
- UI: rotta `/tornei/:id/fase/:phaseId/voto`, link dalla schermata torneo per i
  partecipanti con fase duello aperta, `DuelVoteCard` con due card, selettore
  crediti `-`/`+`, astensione e video caricato solo dopo il tap.
  | alternativa: selettore slider, escluso dalla spec mobile | test della view.
- Auto-voto, schede classifica/pick, modalità sequenziale, risultati e
  segretezza restano fuori scope come da ticket.
  | alternativa: anticipare TICKET-0019/0020 | nessuna modifica nei loro file.
