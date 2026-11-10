---
id: TICKET-0030
title: Creare il database D1 e configurare database_id
status: needs-triage
category: enhancement
blocked_by: []
blocks: [TICKET-0029]
source: docs/features/FEAT-0013-deploy-cloudflare-migrazioni.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Prerequisito umano: creare il database D1 reale e collegarlo al progetto.

**Comportamento richiesto.**
- Creare il database `versus-db` con Wrangler sull'account Cloudflare corretto.
- Sostituire il `database_id` placeholder nella configurazione con l'id restituito.
- Verificare che le migrazioni locali e remote usino lo stesso nome di database.
- Confermare l'accesso Cloudflare e il repo GitHub di destinazione.

**Fuori scope.** Codice applicativo, deploy, migrazioni con schema.

## Acceptance criteria
- [ ] Il database D1 `versus-db` esiste sull'account Cloudflare.
- [ ] `wrangler.jsonc` contiene il `database_id` reale.
- [ ] Le migrazioni locali puntano a `versus-db`.
- [ ] L'accesso Cloudflare e il repo GitHub sono verificati.

## Choices

Nessuna scelta registrata.
