---
id: FEAT-0004
title: Piano di fasi, validazione e anteprima
status: proposed
branch: feat/0004-piano-fasi-validazione-anteprima
worktree: .worktrees/0004
batch: 4
depends_on: [FEAT-0003]
touches: ["src/domain/plan.ts", "src/worker/routes/phases.ts", "src/worker/db/phases.ts", "src/views/tournaments/wizard/", "src/components/tournament/", "src/lib/strings.ts"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Modellare il piano come lista ordinata di fasi, validarlo, mostrarne l'anteprima e permettere la pubblicazione del torneo.

**Fuori scope.** Apertura delle fasi, calcolo dei risultati, voti.

**Criteri di accettazione.**

- Il piano supporta formule `group`, `elimination`, `ranking`, schede `duel`, `ranking`, `pick` e le regole di avanzamento ammesse.
- La validazione blocca i piani non validi con un errore che indica la fase.
- Il piano canonico "40 elementi, 10 gironi da 4, primi 2, ripescaggio a 32, sedicesimi, ottavi, classifica finale a 8" è valido e l'anteprima mostra 20 qualificati diretti e 12 ripescati.
- L'anteprima mostra gironi, accoppiamenti, bye, qualificati e ripescati.
- La pubblicazione è possibile solo con piano valido, elementi sufficienti e almeno un partecipante attivo.
- `settings.autoAdvance` e `settings.selfVoteAllowed` sono impostabili prima dell'apertura della prima fase.
- Dopo la pubblicazione i partecipanti vedono elementi e piano, ma non possono votare.

**Priorità proposta.** P0 — definisce la forma del torneo.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0004-piano-fasi-validazione-anteprima.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: `docs/tickets/TICKET-0007-*.md`, `docs/tickets/TICKET-0008-*.md`, `docs/tickets/TICKET-0009-*.md`

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
