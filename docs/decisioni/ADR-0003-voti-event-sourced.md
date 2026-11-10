---
id: ADR-0003
title: Voti come eventi immutabili, risultati come proiezioni con snapshot
status: accepted
date: 2026-11-09
---

# Voti come eventi immutabili, risultati come proiezioni con snapshot

## Contesto

Le regole di un torneo possono cambiare tra una fase e l'altra. Serve poter ricostruire come si è arrivati a un risultato, risolvere contestazioni e impedire che un risultato pubblicato cambi in silenzio. Allo stesso tempo, il volume di dati è piccolo.

## Decisione

- `vote_events` è un log append-only di ogni voto e di ogni modifica, con payload completo e timestamp.
- `duel_votes` e `ballot_votes` contengono il voto corrente, come proiezione ottimizzata per il calcolo.
- `credit_entries` è un log append-only dei movimenti di credito.
- `phase_results` conserva uno snapshot di configurazione e risultati al momento della chiusura.
- Una fase chiusa è definitiva e non si ricalcola automaticamente. In v1 non esiste una riapertura di fase: ogni fase produce un solo snapshot con `version = 1`. La colonna `version` resta per evoluzioni future.

## Conseguenze

- È possibile ricostruire qualsiasi risultato e spiegare ogni spareggio.
- Le modifiche alle regole di una fase futura non alterano le fasi passate.
- Il costo di scrittura raddoppia rispetto a un semplice upsert (evento + proiezione), ma i volumi sono bassi.
- La logica di calcolo deve essere deterministica e testata con fixture: stessi eventi e stesse regole devono produrre lo stesso risultato.
- Le operazioni di voto vanno eseguite in batch D1 per mantenere coerenti voto, evento e credito.
- Un errore in una fase chiusa non è correggibile dall'app: va accettato, oppure gestito fuori dall'app con intervento tracciato. La correzione di una fase aperta passa da reset o annullamento.
