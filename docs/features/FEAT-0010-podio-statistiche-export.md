---
id: FEAT-0010
title: Podio, statistiche ed export
status: proposed
branch: feat/0010-podio-statistiche-export
worktree: .worktrees/0010
batch: 9
depends_on: [FEAT-0009]
touches: ["src/worker/routes/export.ts", "src/views/podium/", "src/lib/export.ts", "src/worker/db/results.ts"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Mostrare podio, classifica completa e statistiche di partecipazione; esportare i dati in JSON e CSV.

**Fuori scope.** Excel, PDF, immagini condivisibili.

**Criteri di accettazione.**

- Il podio mostra i primi tre elementi e la classifica completa.
- Le statistiche mostrano la partecipazione per fase.
- L'export JSON contiene torneo, elementi, fasi, risultati e qualificazioni.
- L'export CSV produce un file leggibile con una riga per elemento e una per fase.
- L'export è disponibile solo agli organizzatori.

**Priorità proposta.** P1 — utile alla fine del torneo, non blocca il ciclo di voto.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0010-podio-statistiche-export.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: nessuno.

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
