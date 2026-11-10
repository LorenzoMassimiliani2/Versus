---
id: FEAT-0014
title: Modificabilità in corso e audit log
status: proposed
branch: feat/0014-modificabilita-audit
worktree: .worktrees/0014
batch: 8
depends_on: [FEAT-0003, FEAT-0004, FEAT-0007]
touches: ["src/worker/routes/tournaments.ts", "src/worker/routes/phases.ts", "src/worker/db/audit.ts", "src/domain/plan.ts", "src/views/organizer/", "migrations/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Applicare la regola A2: modificare il piano e i dati del torneo durante lo svolgimento senza toccare le fasi avviate, tracciando ogni modifica strutturale.

**Fuori scope.** Riapertura di fasi chiuse, modifica di fasi `open` o `closed`.

**Criteri di accettazione.**

- Una fase `pending` può essere modificata durante il torneo; una fase `open` rifiuta le modifiche con `409`.
- Aggiungere o rimuovere una fase futura ricalcola l'anteprima e mantiene valido il piano.
- Un elemento che ha partecipato a una fase aperta o chiusa non può essere eliminato.
- Un partecipante può essere rimosso tra una fase e l'altra; i voti passati restano aggregati e anonimi.
- Ogni modifica strutturale produce una riga in `audit_log` con `before` e `after`.
- L'organizzatore vede il log delle modifiche del torneo.

**Priorità proposta.** P1 — necessaria per gestire un torneo reale, ma può arrivare dopo il ciclo base.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0014-modificabilita-audit.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: nessuno.

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
