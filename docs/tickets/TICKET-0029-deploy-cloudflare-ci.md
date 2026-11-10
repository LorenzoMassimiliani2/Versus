---
id: TICKET-0029
title: Deploy Cloudflare e migrazioni in CI
status: needs-triage
category: enhancement
blocked_by: [TICKET-0001, TICKET-0030]
blocks: []
source: docs/features/FEAT-0013-deploy-cloudflare-migrazioni.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Portare build e migrazioni su Cloudflare Workers in modo ripetibile.

**Comportamento richiesto.**
- La configurazione del Worker pubblica `dist/` e instrada `/api/*` al worker.
- Il comando di deploy applica le migrazioni remote solo se il branch CI è `main`, poi esegue il deploy.
- Se una migrazione fallisce, il deploy non avviene.
- Il comando di anteprima carica una versione senza promuoverla.
- La documentazione spiega creazione D1, migrazioni locali e remote.

**Fuori scope.** Staging separato, rollback automatico, monitoraggio avanzato.

## Acceptance criteria
- [ ] La build produce `dist/` e il worker.
- [ ] `deploy:ci` applica le migrazioni remote solo su `main`.
- [ ] Una migrazione fallita blocca il deploy.
- [ ] L'anteprima carica una versione senza promuoverla.
- [ ] La documentazione copre D1 e migrazioni.

## Choices

Nessuna scelta registrata.
