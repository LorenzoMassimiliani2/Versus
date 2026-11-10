---
id: FEAT-0007
title: Ciclo di fase e avanzamento
status: proposed
branch: feat/0007-ciclo-fase-avanzamento
worktree: .worktrees/0007
batch: 6
depends_on: [FEAT-0004, FEAT-0005, FEAT-0006]
touches: ["src/domain/phase.ts", "src/worker/routes/phases.ts", "src/worker/db/phases.ts", "src/worker/db/audit.ts", "migrations/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Gestire il ciclo di vita della fase: apertura, chiusura a scadenza o a tutti i voti, stato `awaiting_resolution`, snapshot dei risultati, avanzamento e `autoAdvance`.

**Fuori scope.** Voto dei partecipanti, crediti, UI di voto.

**Criteri di accettazione.**

- L'apertura della prima fase porta il torneo in `running` e crea gironi, match e snapshot votanti.
- Con `closeTriggers: ["all_voted"]` la fase si chiude quando ogni votante ha votato o si è astenuto.
- Con `closeTriggers: ["deadline"]` la fase si chiude alla prima richiesta dopo la scadenza, in modo idempotente.
- Un pareggio irrisolvibile porta la fase in `awaiting_resolution`; la risoluzione richiede una nota e produce audit.
- Una fase `cancelled` non produce avanzamento.
- Con `autoAdvance: true`, alla chiusura la fase successiva `pending` viene aperta nella stessa richiesta; con `false` resta `pending`.
- Con `autoAdvance: true` e ultima fase chiusa, il torneo passa a `concluded`.
- `autoAdvance` non è modificabile dopo l'apertura della prima fase.

**Priorità proposta.** P0 — è il motore che fa avanzare il torneo.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0007-ciclo-fase-avanzamento.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: nessuno.

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
