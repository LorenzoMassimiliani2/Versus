---
id: ADR-0001
title: Cloudflare Workers, D1 e Vue PWA
status: accepted
date: 2026-11-09
---

# Cloudflare Workers, D1 e Vue PWA

## Contesto

L'app deve girare come PWA mobile, avere pochi dati (tornei, elementi, voti), costi quasi nulli e un deploy semplice da `main`. Esiste già un progetto simile, Crumbs, con stack collaudato: Vue 3 + Vite + Cloudflare Workers + D1, deploy da GitHub.

## Decisione

Adottare lo stesso stack di Crumbs:

- Vue 3, TypeScript, Vite, Tailwind v4, shadcn-vue, Pinia, Vue Router.
- Cloudflare Workers con static assets e API `/api/*`.
- D1 (SQLite) con migrazioni in `migrations/`.
- `vite-plugin-pwa` con `autoUpdate`.
- Deploy da GitHub su `main` con `npm run deploy:ci`.

## Conseguenze

- Zero server da amministrare; D1 ha un primary unico, adatto a un gruppo chiuso.
- Niente WebSocket nativi: serve polling (ADR-0004).
- D1 non supporta transazioni interattive lunghe: le operazioni di apertura e chiusura fase vanno scritte come batch atomici.
- I limiti del piano gratuito (righe lette/scritte giornaliere) sono sufficienti per decine di tornei e centinaia di utenti; vanno monitorati.
- Si riusa la conoscenza operativa di Crumbs, riducendo il costo di setup.
