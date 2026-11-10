---
id: TICKET-0023
title: Risolvere manualmente uno spareggio
status: done
category: enhancement
blocked_by: [TICKET-0016, TICKET-0021]
blocks: [TICKET-0024]
source: docs/features/FEAT-0009-risultati-segretezza-risoluzione.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Sbloccare una fase quando i criteri automatici non bastano.

**Comportamento richiesto.**
- Una fase in `awaiting_resolution` espone all'organizzatore i target ambigui.
- L'organizzatore invia un ordinamento per ogni target e una nota obbligatoria.
- La risoluzione produce una riga in `audit_log` e chiude la fase.
- La risoluzione è idempotente e non accetta un secondo ordinamento per lo stesso target.
- Con `autoAdvance` attivo, dopo la risoluzione e la chiusura si apre la fase successiva.
- Un partecipante non può vedere né usare la rotta di risoluzione: 403.

**Fuori scope.** Spareggi automatici, podio, export.

## Acceptance criteria
- [x] Una fase in `awaiting_resolution` mostra i target da risolvere all'organizzatore.
- [x] La risoluzione richiede una nota e scrive una riga di audit.
- [x] Dopo la risoluzione la fase passa a `closed`.
- [x] Un secondo tentativo per lo stesso target viene rifiutato.
- [x] Un partecipante riceve 403 sulla rotta di risoluzione.

## Choices

| decisione | rationale | alternatives_rejected | evidence |
|---|---|---|---|
| Nuova rotta `GET /api/phases/:id/resolution` accanto a `POST /api/phases/:id/resolve`, riservata all'organizzatore | la UI deve mostrare i target ambigui con id ed etichette leggibili; la spec elenca solo il POST e i risultati della fase rispondono `409` in `awaiting_resolution`, quindi serviva una sorgente dedicata senza cambiare il contratto di TICKET-0021/0022 | restituire i target dentro `GET /results`: avrebbe cambiato il contratto esistente e confuso «risultati» con «spareggio da risolvere»; ricavare target e nomi dai dati già in pagina: duplicherebbe la logica di calcolo nel client | test GET «espone all organizzatore i target ambigui con i loro elementi» e 409 su fase non in attesa |
| `computePhaseResults` accetta `resolutions` e restituisce `unresolvedTargets` con `targetId` = id del girone, della sfida o della fase | la granularità del target coincide con quella di `ballot_votes` e con la forma `{ targetId, ordering }` della spec; il calcolo resta l'unica sorgente di verità e riusa `manualOrder`/`manualWinner` dei tally esistenti | aggiungere un secondo calcolo solo per la risoluzione: due fonti di verità su spareggi e avanzamento; derivare il target nel chiamante confrontando gli id: fragile e sparso | test di `phase-results` per classifica, duello e girone; `unresolved` resta per compatibilità della risposta di chiusura |
| `validateResolutions` richiede un ordine completo per ogni target ambiguo, nessun target in più e nessun doppione; in caso contrario `422 invalid_resolution` | il ticket chiede «ordinamento completo e valido per ogni target ambiguo»; la validazione è pura e verificabile senza D1 | accettare risoluzioni parziali e lasciare la fase bloccata: l'organizzatore non saprebbe quale target manca; applicare l'ordine a target non ambigui: falserebbe la classifica | test `phase-resolution.test.ts`; test di rotta con target errato e ordine incompleto verificano che non nasca alcuno snapshot |
| Nota obbligatoria, ripulita dagli spazi, con `422 note_required`; la riga `audit_log` (`action = 'phase.resolve'`) contiene `{ note, resolutions }` in `after` e viene scritta nello stesso batch dello snapshot | la spec impone nota obbligatoria e traccia in `audit_log`; il batch condizionale evita audit orfani se il claim fallisce | scrivere l'audit prima del claim: righe di audit per risoluzioni mai applicate | test di rotta su nota mancante e su `audit_log` con `before`/`after` attesi |
| Il claim passa da `awaiting_resolution` a `closed` e l'insert di `phase_results` è condizionato a `status = 'closed'` e allo stesso `closed_at` | rende la risoluzione atomica e un secondo tentativo innocuo: nessun doppio snapshot | risolvere in due passaggi (chiudi, poi inserisci): finestra per risultati mancanti o duplicati | test «rifiuta un secondo tentativo» (`409 phase_not_awaiting_resolution`) e test di rotta sul singolo snapshot |
| Dopo la chiusura si riusa `applyAutoAdvance`, già idempotente | il ticket chiede l'apertura della fase successiva con `autoAdvance` attivo; la funzione esiste da TICKET-0017 e va invocata solo dopo una chiusura valida | duplicare l'apertura nella rotta di risoluzione: seconda implementazione dell'avanzamento | test «con autoAdvance apre la fase successiva dopo la chiusura» |
| Pannello `PhaseResolutionPanel` visibile solo all'organizzatore, con ordine modificabile, nota e conferma; un partecipante non vede il pannello e riceve `403` dalle rotte | il ticket richiede il pannello e il 403; tenere la UI fuori dai partecipanti evita richieste destinate a fallire | mostrare il pannello a tutti con errore: esperienza confusa e superficie inutile | test componente su payload inviato e conferma disabilitata senza nota; test di rotta sul 403 del partecipante |
