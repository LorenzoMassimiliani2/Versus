# Versus

PWA mobile-first per organizzare tornei: gironi, eliminazione diretta, votazioni in stile Eurovision, crediti che pesano sul voto e regole configurabili dall'organizzatore.

Stato attuale: **specifiche v1 chiuse**, nessun codice applicativo. Prossimo passo: bootstrap del progetto.

## Documenti

- `docs/architettura.md` — stack, struttura, deploy, convenzioni.
- `docs/spec/0001-versus-v1.md` — specifica funzionale completa: ruoli, fasi, voti, crediti, segretezza, dati, API, schermate, criteri di accettazione.
- `docs/decisioni/` — ADR delle scelte non ovvie.

## Stack previsto

Vue 3 + TypeScript + Vite, Tailwind CSS v4, shadcn-vue, Pinia, Vue Router, `vite-plugin-pwa`; Cloudflare Workers con static assets, D1 (SQLite), deploy da GitHub su `main`.

## Sviluppo

I comandi saranno allineati a Crumbs:

```bash
npm install
npm run dev:all       # Vite :5173 + API :8787
npm run build
npm run db:migrate:local
npm test
```
