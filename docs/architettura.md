# Architettura

Versus è una PWA mobile-first per organizzare tornei: gironi, eliminazione diretta, votazioni in stile Eurovision e crediti che pesano sul voto. Il frontend Vue è servito da Cloudflare Workers insieme alle API; il database è D1 (SQLite).

## Stack

- linguaggi/framework: TypeScript, Vue 3, Vite, Tailwind CSS v4, shadcn-vue (Reka UI), Pinia, Vue Router
- backend: Cloudflare Workers con static assets, API `/api/*`
- database: Cloudflare D1 (SQLite), migrazioni SQL in `migrations/`
- PWA: `vite-plugin-pwa`, service worker `autoUpdate`, `navigateFallbackDenylist: /^\/api\//`
- test: Vitest; il motore di dominio è puro e testabile senza rete
- deploy: GitHub → Cloudflare Workers Builds, branch `main`; build `npm run build`, deploy `npm run deploy:ci`
- runtime agente: prime-agent

## Struttura

```
public/
  favicon.svg
  icons/                  # icone PWA (192, 512, maskable, apple-touch)
src/
  components/ui/          # componenti shadcn-vue
  components/tournament/  # card elemento, bracket, classifica, barra crediti
  composables/            # polling, countdown, media embed, clipboard
  domain/                 # motore puro: tally, seeding, avanzamento, validazione
  lib/                    # cn(), date, formattazione
  router/
  stores/                 # session, tournament, phase
  views/
  worker/
    index.ts              # entrypoint Worker
    routes/               # handler HTTP per area
    auth/                 # sessione, password, RBAC
    db/                   # query D1
  style.css
migrations/               # migrazioni SQL di D1
scripts/                  # create-admin, seed, utility
worker-configuration.d.ts # tipi generati da wrangler
docs/
  architettura.md
  spec/
  decisioni/
  tickets/
```

## Convenzioni

- ticket tracker: `docs/tickets/` (backend: github-source)
- spec: `docs/spec/`
- decisioni (ADR): `docs/decisioni/`
- migrazioni D1: `migrations/`, applicate in locale con `npm run db:migrate:local` e in produzione dalla CI solo su `main`
- sviluppo locale: `npm run dev:all` (Vite su :5173 + `wrangler dev` su :8787, proxy `/api`)
- date: salvate in UTC (`ISO 8601`); UI nel fuso del dispositivo; default di creazione `Europe/Rome`
- identificatori: UUID v7 testuali, ordinabili per creazione
- testi UI: centralizzati in `src/lib/strings.ts`, italiano soltanto in v1
- template: condivisi e modificabili da tutti gli organizzatori; applicarne uno copia il piano in un nuovo torneo. Vedi ADR-0008

## Confini

- `src/domain/`: funzioni pure senza accesso a D1, HTTP o `window`. Contiene validazione del piano, generazione di gironi e bracket, tally dei voti, spareggi, avanzamento.
- `src/worker/`: trasporto HTTP, autenticazione, autorizzazione, query D1, orchestrazione delle transazioni.
- `src/views/` e `src/components/`: solo presentazione e interazione.
- `src/stores/`: stato client e chiamate API.
- Nessuna regola di dominio nei componenti Vue.

## Modello di esecuzione

Cloudflare Workers è stateless e D1 ha un primary unico: non ci sono WebSocket né push nativo. Le scadenze sono quindi valutate **lazy**: ogni richiesta di stato o azione controlla se una fase ha superato la deadline e, se configurato, la chiude. Il polling condizionale (ETag) ogni 4 secondi, solo a pagina visibile, rende la chiusura tempestiva senza infrastruttura aggiuntiva. Vedi ADR-0004.

## Limiti di istanza

Versus è dimensionato per un gruppo chiuso e stretto:

- massimo 20 utenti attivi;
- massimo 10 tornei attivi (`published` o `running`);
- massimo 20 partecipanti attivi per torneo;
- polling di stato ogni 4 secondi, solo a pagina visibile.

I limiti sono controlli applicativi su creazione utente, pubblicazione, aggiunta di partecipanti e validazione del piano. Con questi numeri il piano gratuito di Cloudflare è sufficiente. Vedi ADR-0009.

## Autenticazione e sessioni

- Username e password creati dall'admin. Nessuna registrazione pubblica, nessun reset self-service.
- Password: PBKDF2-HMAC-SHA256 via WebCrypto, 600.000 iterazioni, salt casuale 16 byte, formato `pbkdf2$600000$<salt_b64>$<hash_b64>`.
- Sessione: token casuale 32 byte, salvato come SHA-256 in `sessions`, inviato in cookie `versus_session` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 30 giorni).
- CSRF: `SameSite=Lax` più controllo dell'header `Origin` su ogni mutazione.
- Ruoli: `admin` d'istanza e ruoli per torneo (`owner`, `co_organizer`, `participant`). Vedi la matrice in `docs/spec/0001-versus-v1.md`.
- Bootstrap: `npm run admin:create` crea il primo admin interrogando D1; nessuna rotta di setup pubblica.

## Deploy

Workers con static assets (`wrangler.jsonc`), cartella pubblicata `dist/`.

| Campo | Valore |
|---|---|
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:ci` |
| Preview command | `npx wrangler versions upload` |

`deploy:ci` applica le migrazioni D1 remote solo se `WORKERS_CI_BRANCH=main`, poi esegue `wrangler deploy`. Se una migrazione fallisce, il deploy non avviene.

## Sicurezza e dati

- Nessun dato personale oltre username e hash della password.
- I voti individuali non sono mai esposti agli altri partecipanti; la modalità `secret` li nasconde anche all'organizzatore a livello applicativo.
- La segretezza è una garanzia applicativa, non crittografica: un admin con accesso diretto a D1, o che reimposta la password di un partecipante, può tecnicamente risalire ai voti. È un limite accettato in v1.
- Le risposte API sono filtrate per ruolo: un partecipante non riceve mai identificativi di votanti altrui.
- I contenuti multimediali sono solo URL esterni: nessun upload, nessuna scansione di file.
- Rate limit minimo su login (per username e per IP) tramite contatore in D1 o Cloudflare Rate Limiting.

## Scelte non ovvie

- ADR-0001: Cloudflare Workers + D1, stesso modello di Crumbs.
- ADR-0002: autenticazione con username e password assegnate dall'admin.
- ADR-0003: voti come eventi immutabili e risultati come proiezioni con snapshot.
- ADR-0004: polling condizionale invece di WebSocket.
- ADR-0005: ripescaggio come regola di transizione, non come fase votata.
- ADR-0006: piano a fasi evolutivo, modificabile solo tra fasi (A2).
- ADR-0008: template condivisi e modificabili da tutti gli organizzatori.
- ADR-0009: limiti di istanza per un gruppo chiuso.
