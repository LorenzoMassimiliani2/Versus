---
id: FEAT-0013
title: Deploy Cloudflare e migrazioni
status: proposed
branch: feat/0013-deploy-cloudflare-migrazioni
worktree: .worktrees/0013
batch: 9
depends_on: [FEAT-0001]
touches: ["wrangler.jsonc", "migrations/", "scripts/", "package.json", ".github/workflows/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Portare l'app su Cloudflare Workers con D1, migrazioni locali e remote, build e deploy da GitHub su `main`.

**Fuori scope.** Ambienti di staging separati, rollback automatico, monitoraggio avanzato.

**Criteri di accettazione.**

- `npx wrangler d1 create versus-db` e l'aggiornamento di `database_id` sono documentati.
- Le migrazioni si applicano in locale con `npm run db:migrate:local`.
- `deploy:ci` applica le migrazioni remote solo se `WORKERS_CI_BRANCH=main`, poi esegue `wrangler deploy`.
- Se una migrazione fallisce, il deploy non avviene.
- La build `npm run build` produce `dist/` e il worker.

**Priorità proposta.** P1 — il deploy arriva dopo i test locali, ma la configurazione va validata presto.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0013-deploy-cloudflare-migrazioni.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: `docs/tickets/TICKET-0029-*.md`, `docs/tickets/TICKET-0030-*.md`

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
