---
id: FEAT-0009
title: Risultati, segretezza e risoluzione
status: proposed
branch: feat/0009-risultati-segretezza-risoluzione
worktree: .worktrees/0009
batch: 8
depends_on: [FEAT-0007, FEAT-0008]
touches: ["src/domain/results.ts", "src/worker/routes/results.ts", "src/worker/auth/filter.ts", "src/views/results/", "src/worker/db/results.ts", "migrations/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Calcolare e mostrare i risultati di fase rispettando la segretezza, gestire la risoluzione manuale degli spareggi e conservare gli snapshot.

**Fuori scope.** Podio, statistiche, export.

**Criteri di accettazione.**

- In `live` il partecipante vede i risultati aggregati durante la fase.
- In `blind` vede solo il proprio voto fino alla chiusura.
- In `secret` l'organizzatore riceve solo aggregati tramite l'app, anche dopo la chiusura.
- In nessuna modalità un partecipante riceve l'identità di un altro votante.
- La risoluzione manuale di un pareggio richiede una nota e produce una riga di audit.
- Alla chiusura viene salvato `phase_results` con `config_snapshot` e `results`.
- Una fase chiusa non può essere modificata né riaperta.

**Priorità proposta.** P0 — senza risultati il torneo non ha senso.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0009-risultati-segretezza-risoluzione.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: nessuno.

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
