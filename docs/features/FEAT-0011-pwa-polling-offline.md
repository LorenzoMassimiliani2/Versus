---
id: FEAT-0011
title: PWA, polling e offline
status: proposed
branch: feat/0011-pwa-polling-offline
worktree: .worktrees/0011
batch: 9
depends_on: [FEAT-0007, FEAT-0009]
touches: ["vite.config.ts", "public/", "src/main.ts", "src/App.vue", "src/composables/usePolling.ts", "src/composables/useOnline.ts", "src/router/"]
created_by: prime-agent
created: 2026-11-10
---

## Brief

**Obiettivo.** Rendere l'app installabile, aggiornare lo stato con polling condizionale e consentire la consultazione offline in sola lettura.

**Fuori scope.** Notifiche push, background sync, coda di mutazioni offline.

**Criteri di accettazione.**

- La PWA è installabile e mostra la shell anche offline.
- Il polling usa `If-None-Match` e riceve `304` quando nulla è cambiato.
- Il polling si interrompe a scheda nascosta e riprende al ritorno visibile.
- Le schermate in cache sono di sola lettura e mostrano l'ora dell'ultimo aggiornamento.
- Il voto offline è disabilitato con un messaggio esplicito; nessuna mutazione viene accodata.

**Priorità proposta.** P1 — importante per l'uso reale, ma il torneo funziona anche senza offline.

## Sub-spec / tickets

- spec: da generare in `docs/spec/0011-pwa-polling-offline.md`; riferimento: `docs/spec/0001-versus-v1.md`.
- tickets: nessuno.

## Note di merge

- risultato merge su `orchestrator/integrate`: non eseguito
- note conflitto: nessuna
