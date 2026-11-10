---
id: TICKET-0019
title: Votare classifica e scelta
status: done
category: enhancement
blocked_by: [TICKET-0015, TICKET-0011]
blocks: [TICKET-0020, TICKET-0021]
source: docs/features/FEAT-0008-voto-crediti.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Permettere schede di voto su più elementi.

**Comportamento richiesto.**
- Una scheda classifica assegna i valori della scala punti a elementi del girone o della fase.
- Ogni valore della scala può essere usato al massimo una volta per scheda.
- Una scheda parziale è valida.
- Una scheda pick sceglie un solo elemento e vale 1 punto.
- Il voto è modificabile ed eliminabile finché la fase è aperta.
- La UI mostra i punti residui, l'ordine e la selezione singola.

**Fuori scope.** Duelli, crediti, modalità sequenziale, risultati aggregati.

## Acceptance criteria
- [x] Una scheda classifica parziale viene accettata.
- [x] Assegnare due volte lo stesso valore viene rifiutato.
- [x] Una scheda pick con due elementi viene rifiutata.
- [x] Modificare o eliminare il voto aggiorna la proiezione corrente e aggiunge un evento.
- [x] La UI mostra i punti residui e impedisce assegnazioni non valide.

## Choices

- Migrazione `0008_ballot_votes.sql` con `ballot_votes` (PK
  `(phase_id, target_id, voter_id)`, `kind` vincolato a `ranking|pick`, payload
  JSON, timestamp) e indice `idx_ballot_votes_phase`. `vote_events` resta quella
  creata da TICKET-0018.
  | vincolo di dominio | alternativa: tabella unica con i duelli | test di
  migrazione e di cascata.
- Target del voto: id del girone per le fasi `group`, id della fase per le altre
  formule, come già usato dal conteggio di completamento di TICKET-0016.
  | alternativa: usare sempre l'id della fase, che confonderebbe i gironi |
  test di target errato e scheda per girone.
- Validazione in `src/domain/ballot-vote.ts`, pura e riusabile dal calcolo dei
  risultati: scala punti dalla config della fase, ogni valore usato al massimo
  una volta, ogni elemento al massimo una volta, elementi solo del target,
  scheda parziale o vuota ammessa. Il pick accetta esattamente la chiave
  `elementId`.
  | alternativa: validare nel route, duplicando regole | test di dominio e route.
- `POST /api/phases/:id/ballots` controlla prima lo stato della fase (409
  `phase_not_open`), poi target (422 `invalid_target`), kind coerente con la
  fase e payload (422 `invalid_payload`). Una scheda identica è idempotente e
  non produce eventi; ogni modifica reale scrive un `vote_events` con
  `kind` della scheda.
  | alternativa: eventi anche per schede identiche | test di idempotenza e
  conteggio eventi.
- `DELETE /api/phases/:id/ballots/:targetId` cancella la riga e scrive un
  evento `{ deleted: true, payload }`; ripetuto senza voto restituisce lo stato
  corrente. Target sconosciuto restituisce 404; fase chiusa 409.
  | alternativa: 404 anche senza voto, meno idempotente | test DELETE.
- `GET /api/phases/:id/ballot` è generalizzato: per i duelli mantiene
  `matches`, `budget`, `maxPerMatch` e `balance`; per classifica e pick espone
  `targets` con elementi, proprio voto e `points` (`scale`, `used`, `remaining`)
  per target, più il completamento sui target.
  | alternativa: una seconda rotta, che duplicherebbe la lettura del votante |
  test della scheda duello invariata e dei gironi.
- UI: `RankingBallotCard` con select per elemento limitata ai valori ancora
  disponibili, punti residui, riepilogo ordinato per punti e salvataggio;
  `PickBallotCard` con griglia a selezione singola. `PhaseVoteView` sceglie la
  scheda in base a `phase.voteType`.
  | alternativa: un solo componente con molti rami | test della view.
- La scala punti predefinita, quando la config non la definisce, resta
  `[12,10,8,6,4,2,1]`, allineata al calcolo dei risultati.
  | alternativa: imporre la scala nella config della fase | test con scala
  personalizzata.
- Duelli, modalità sequenziale, auto-voto, risultati e segretezza restano fuori
  scope come da ticket.
  | alternativa: anticipare TICKET-0020/0021 | nessuna modifica nei loro file.
