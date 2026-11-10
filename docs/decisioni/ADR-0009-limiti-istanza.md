---
id: ADR-0009
title: Limiti di istanza per un gruppo chiuso
status: accepted
date: 2026-11-10
---

# Limiti di istanza per un gruppo chiuso

## Contesto

Le ipotesi iniziali prevedevano 50 tornei attivi e 2000 utenti. Il caso d'uso reale è un gruppo stretto di amici: poche decine di persone al massimo, con pochi tornei in corso. Il polling ogni 4 secondi è adatto a questa scala, ma con centinaia di partecipanti supererebbe il piano gratuito di Cloudflare.

## Decisione

- Massimo 20 utenti attivi sull'istanza; un utente disattivato libera il posto.
- Massimo 10 tornei attivi contemporaneamente, dove attivo significa `published` o `running`.
- Massimo 20 partecipanti attivi per torneo.
- Polling di stato ogni 4 secondi, solo a pagina visibile.
- I limiti sono controlli applicativi: creazione utente, pubblicazione del torneo, aggiunta di partecipanti e validazione del piano.
- I tentativi oltre il limite rispondono `409` con un messaggio esplicito.

## Conseguenze

- Il piano gratuito di Cloudflare è sufficiente per l'uso previsto.
- Le bozze non contano nel limite dei tornei attivi; `concluded` e `archived` non contano.
- Un utente disattivato non conta nel limite e libera un posto. La riattivazione è rifiutata se ci sono già 20 utenti attivi.
- Alzare questi limiti richiede una nuova decisione e una verifica del carico su D1 e Workers.
- I limiti non vengono espressi come vincoli SQL, perché dipendono dallo stato e dal momento della transizione.
