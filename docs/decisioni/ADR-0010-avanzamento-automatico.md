---
id: ADR-0010
title: Avanzamento automatico opzionale
status: accepted
date: 2026-11-10
---

# Avanzamento automatico opzionale

## Contesto

Il flusso base richiede che l'organizzatore apra manualmente ogni fase dopo la chiusura della precedente. Per un torneo già pianificato e con regole stabili, questa azione è solo attrito. L'organizzatore vuole poter scegliere alla creazione se il torneo deve procedere da solo, senza perdere la possibilità di fermarsi e correggere.

## Decisione

- `TournamentSettings.autoAdvance` è un booleano, default `false`, impostato alla creazione del torneo.
- È modificabile solo finché la prima fase non è aperta. Dopo l'apertura è immutabile.
- Quando è `true`, alla chiusura di una fase la fase immediatamente successiva viene aperta nella stessa richiesta, se è `pending`.
- L'apertura usa la configurazione già definita nel piano e gli elementi calcolati da avanzamento e ripescaggio.
- L'avanzamento è sospeso se la fase va in `awaiting_resolution`, se la fase è `cancelled`, o se la fase successiva non è `pending`.
- Se la fase chiusa è l'ultima, il torneo passa a `concluded` e non si apre nulla.
- Con `autoAdvance` attivo non c'è una finestra tra le fasi per sostituire a mano i ripescati: valgono i criteri automatici. Per mantenere l'override manuale, l'opzione va lasciata disattivata.
- Le deadline restano assolute. Se la deadline della fase successiva è già passata all'apertura, la fase si apre e si chiude alla prima richiesta successiva, secondo la regola lazy; l'anteprima lo segnala come warning.
- L'operazione è idempotente. Se l'apertura automatica fallisce, la chiusura resta valida, la fase successiva resta `pending` e l'errore è visibile all'organizzatore.

## Conseguenze

- Un torneo pianificato può proseguire senza che l'organizzatore sia presente a ogni chiusura.
- L'organizzatore perde il punto di controllo tra una fase e l'altra: per correggere i ripescati o rivedere i risultati prima di aprire la fase successiva deve disattivare l'opzione.
- Il worker deve orchestrare chiusura e apertura nella stessa richiesta, con controlli condizionali sullo stato delle fasi per evitare doppie aperture.
- Un errore nell'apertura automatica non annulla la chiusura: il torneo resta in uno stato coerente e l'organizzatore può aprire la fase manualmente.
