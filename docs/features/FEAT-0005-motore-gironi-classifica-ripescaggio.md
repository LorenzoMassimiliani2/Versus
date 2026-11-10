---
id: FEAT-0005
title: "Motore di dominio: gironi, classifica e ripescaggio"
status: proposed
branch: feat/0005-motore-gironi-classifica-ripescaggio
worktree: .worktrees/0005
batch: 5
depends_on: [FEAT-0004]
touches: ["src/domain/groups.ts", "src/domain/standings.ts", "src/domain/repechage.ts", "src/domain/ranking.ts", "src/domain/pick.ts", "src/domain/__tests__/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Implementare come funzioni pure la composizione dei gironi, il calcolo delle classifiche, i pick e il ripescaggio.

**Fuori scope.** Persistenza D1, HTTP, UI, eliminazione diretta.

**Criteri di accettazione.**

- Con 40 elementi e dimensione 4 vengono creati 10 gironi da 4.
- Con 38 elementi e `remainder: smaller_groups` vengono creati 8 gironi da 4 e 2 da 3.
- Con `remainder: byes` vengono creati 9 gironi da 4 e 2 bye.
- Un girone round-robin da 4 produce 6 sfide e usa i punti 3/1/0.
- La classifica somma i punti, gestisce le schede parziali e applica gli spareggi configurati.
- Il ripescaggio ordina gli esclusi con i criteri scelti e seleziona fino a `targetSize`.
- La fixture canonica produce sempre la stessa struttura a parità di input.

**Priorità proposta.** P0 — è il cuore dei gironi e del ripescaggio.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0005-motore-gironi-classifica-ripescaggio.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: `docs/tickets/TICKET-0010-*.md`, `docs/tickets/TICKET-0011-*.md`, `docs/tickets/TICKET-0012-*.md`

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
