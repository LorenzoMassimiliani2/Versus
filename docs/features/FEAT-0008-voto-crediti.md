---
id: FEAT-0008
title: Voto e crediti
status: proposed
branch: feat/0008-voto-crediti
worktree: .worktrees/0008
batch: 7
depends_on: [FEAT-0005, FEAT-0006, FEAT-0007]
touches: ["src/domain/votes.ts", "src/domain/credits.ts", "src/worker/routes/votes.ts", "src/worker/db/votes.ts", "src/stores/phase.ts", "src/views/vote/", "src/components/tournament/", "migrations/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Permettere ai partecipanti di votare duelli, classifiche e scelte, con crediti, astensione, modifica del voto e modalità sequenziale.

**Fuori scope.** Risultati aggregati e segretezza (FEAT-0009), UI del podio.

**Criteri di accettazione.**

- Un partecipante vota un duello scegliendo `a`, `b` o `abstain` e investendo crediti.
- Il peso di un voto è `1 + crediti`; i crediti non possono superare il budget o `maxPerMatch`.
- Cambiare lato rimborsa i crediti del lato precedente e addebita i nuovi.
- `abstain` vale come voto espresso ma non aggiunge peso.
- Una scheda classifica parziale è valida; ogni valore della scala si usa al massimo una volta.
- Una scheda pick sceglie un solo elemento.
- In modalità sequenziale si apre un target alla volta e il successivo si apre quando tutti hanno votato.
- Con `selfVoteAllowed: false` il voto per il proprio elemento è rifiutato con `422`.
- Il voto su una sfida non aperta è rifiutato con `409`.

**Priorità proposta.** P0 — è l'azione principale del partecipante.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0008-voto-crediti.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: nessuno.

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
