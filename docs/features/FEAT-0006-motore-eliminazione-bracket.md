---
id: FEAT-0006
title: "Motore di dominio: eliminazione e bracket"
status: proposed
branch: feat/0006-motore-eliminazione-bracket
worktree: .worktrees/0006
batch: 5
depends_on: [FEAT-0004]
touches: ["src/domain/bracket.ts", "src/domain/duel.ts", "src/domain/advance.ts", "src/domain/__tests__/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Implementare come funzioni pure il tabellone a eliminazione, i bye, il tally dei duelli e l'avanzamento dei vincitori.

**Fuori scope.** Persistenza, UI, crediti (FEAT-0008).

**Criteri di accettazione.**

- Con 32 elementi la fase produce 16 sfide; con 12 elementi produce 4 sfide e 4 bye.
- I bye si chiudono automaticamente e vengono assegnati ai seed migliori.
- Il tabellone usa la potenza di 2 superiore e gli accoppiamenti `1 vs P`, `2 vs P-1`, ecc.
- Il tally del duello somma i pesi e applica gli spareggi automatici.
- La finale 3°/4° posto, se attiva, non modifica i qualificati della finale.
- La fase `elimination` rappresenta un solo turno.

**Priorità proposta.** P0 — è il cuore del tabellone.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0006-motore-eliminazione-bracket.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: nessuno.

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
