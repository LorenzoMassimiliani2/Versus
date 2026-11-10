# Versus

PWA mobile-first per organizzare tornei: gironi, eliminazione diretta, votazioni in stile Eurovision, crediti che pesano sul voto e regole configurabili dall'organizzatore.

Stato attuale: **scheletro applicativo creato**. Specifiche v1 chiuse; le funzionalità vengono aggiunte con i prossimi ticket.

## Documenti

- `docs/architettura.md` — stack, struttura, deploy, convenzioni.
- `docs/spec/0001-versus-v1.md` — specifica funzionale completa: ruoli, fasi, voti, crediti, segretezza, dati, API, schermate, criteri di accettazione.
- `docs/decisioni/` — ADR delle scelte non ovvie.

## Stack

Vue 3 + TypeScript + Vite, Tailwind CSS v4, shadcn-vue, Pinia, Vue Router, `vite-plugin-pwa`; Cloudflare Workers con static assets, D1 (SQLite), deploy da GitHub su `main`.

## Sviluppo

```bash
npm install
npm run dev          # solo frontend su :5173
npm run dev:all      # Vite :5173 + API :8787
npm run build
npm run type-check
npm test
```

La prima volta va creato il database D1 e aggiornato `database_id` in `wrangler.jsonc`:

```bash
npx wrangler d1 create versus-db
npm run db:migrate:local
```

Le migrazioni vivono in `migrations/` e verranno aggiunte insieme allo schema.
