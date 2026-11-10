---
id: FEAT-0012
title: Template condivisi
status: proposed
branch: feat/0012-template-condivisi
worktree: .worktrees/0012
batch: 9
depends_on: [FEAT-0004]
touches: ["src/worker/routes/templates.ts", "src/stores/templates.ts", "src/views/templates/", "migrations/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Salvare un piano come template riutilizzabile, condiviso e modificabile da tutti gli organizzatori, e applicarlo a un nuovo torneo.

**Fuori scope.** Template con permessi, versioning, condivisione esterna.

**Criteri di accettazione.**

- Ogni organizzatore vede, modifica ed elimina qualsiasi template.
- `templates` registra `created_by`, `updated_by`, `created_at` e `updated_at`.
- Applicare un template copia il piano nel nuovo torneo.
- Una modifica successiva al template non cambia i tornei già creati.
- La cancellazione è definitiva.

**Priorità proposta.** P2 — comodità, non necessaria al primo torneo.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0012-template-condivisi.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: nessuno.

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
