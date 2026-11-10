---
id: TICKET-0008
title: Validazione del piano e anteprima
status: done
category: enhancement
blocked_by: [TICKET-0005, TICKET-0006, TICKET-0007]
blocks: [TICKET-0009]
source: docs/features/FEAT-0004-piano-fasi-validazione-anteprima.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Impedire piani rotti e mostrare all'organizzatore cosa succederà.

**Comportamento richiesto.**
- La validazione applica tutte le regole del piano e restituisce errori che indicano la fase.
- La pubblicazione è bloccata se il piano non è valido.
- L'anteprima calcola gironi, accoppiamenti, bye, qualificati e ripescati.
- Il piano canonico 40 → 10 gironi da 4 → primi 2 → ripescaggio a 32 → sedicesimi → ottavi → classifica finale a 8 è valido.
- Con `autoAdvance` attivo, l'anteprima segnala deadline non successive o già passate come warning.
- Gli errori bloccanti e i warning non bloccanti sono distinti nella UI.

**Fuori scope.** Pubblicazione, apertura della prima fase, calcolo dei risultati.

## Acceptance criteria
- [x] Il piano canonico è valido e mostra 20 qualificati diretti e 12 ripescati.
- [x] Un piano con ultima fase che qualifica N>1 viene rifiutato con un errore sulla fase.
- [x] Una fase `elimination` non finale con avanzamento diverso da `winners` viene rifiutata.
- [x] L'anteprima mostra gironi, bye, accoppiamenti e ripescati.
- [x] I warning non bloccano la pubblicazione; gli errori sì.

## Choices

| decisione | rationale | alternative_rejected | evidence |
|---|---|---|---|
| `validatePlan` vive in `src/domain/plan.ts` ed è pura: riceve torneo, elementi, campi, fasi, partecipanti attivi e `now`, e restituisce `{ valid, errors, warnings, preview }` | la validazione semantica non deve dipendere da D1 o HTTP; la stessa funzione serve alla preview API e ai test del piano canonico | validare dentro la rotta o nei componenti Vue: regole duplicate e non testabili in isolamento | `src/domain/plan.ts`, `src/domain/plan.test.ts` |
| Ogni errore è `{ code, phase?, phaseName?, elementId? }`; i messaggi italiani restano in `src/lib/strings.ts` tramite `planIssueMessage` | mantiene il dominio senza testi UI e consente alla UI di mostrare fase e messaggio senza duplicare logica | restituire frasi già pronte dal dominio: accoppia il motore alla lingua e alle stringhe | `src/lib/strings.ts`, `src/components/tournament/PlanPreviewPanel.vue` |
| Le regole 1-15 sono applicate in un solo passaggio che propaga gli elementi in uscita da una fase alla successiva; numero di gironi, bye, qualificati diretti e ripescati sono calcolati con le stesse regole della spec | evita due implementazioni divergenti tra validazione e anteprima e rende verificabile il piano canonico | validare i conteggi e calcolare l'anteprima con funzioni separate: rischio di risultati incoerenti | test «accetta il piano canonico e ne calcola l anteprima» |
| Il piano canonico 40 → 10 gironi da 4 → primi 2 → ripescaggio a 32 → sedicesimi → ottavi → classifica finale a 8 risulta valido e mostra 20 qualificati diretti + 12 ripescati | è il criterio di accettazione esplicito della spec | nessuno: è il caso guida | `src/domain/plan.test.ts`, `src/worker/routes/preview.test.ts` |
| Regola 12 e criterio «ultima fase con N>1»: una fase non finale deve qualificare almeno 2 elementi; l'ultima esattamente 1. `winner` è ammesso solo sull'ultima fase e una eliminazione non finale usa `winners` | rende esplicito il criterio 9 della spec senza ambiguità sui piani che finiscono con più qualificati | consentire all'ultima fase `top_global n=1`: il torneo non avrebbe un vincitore unico | test «rifiuta winner su una fase non finale e l ultima fase che qualifica N>1» |
| Il ripescaggio è validato sulla fase che lo dichiara (la sorgente dei risultati), non sulla fase precedente: `group_points` richiede `group`, `first_preferences` una scheda `ranking`, `weight_difference` una scheda `duel` | `advance.repechage` descrive la transizione dopo la fase corrente, quindi i criteri si applicano ai risultati di quella fase | guardare alla fase precedente: rifiuterebbe il piano canonico, dove il ripescaggio segue i gironi | test «rifiuta criteri di ripescaggio non applicabili» |
| Con `remainder: byes` i gironi sono pieni (`floor(N/size)`) e il resto va in bye; con `smaller_groups` si usa `ceil(N/size)`. L'anteprima compone i gironi in modo deterministico: serpentina per `snake`, blocchi per `random`/`manual` | permette di mostrare gironi e bye prima dell'apertura senza anticipare il sorteggio crittografico, che avviene all'apertura della fase | mescolare casualmente in anteprima: il risultato non sarebbe riproducibile né utile | test «mostra gironi pieni, bye e accoppiamenti» |
| Gli accoppiamenti di eliminazione usano il tabellone alla potenza di 2 superiore con `1 vs P`, `2 vs P-1`, …; i seed senza avversario sono bye. I nomi dei qualificati/vincitori non ancora determinabili sono segnaposto (`Qualificato N`, `Ripescato N`, `Vincente N`) | prima del torneo i risultati non esistono: mostrare nomi reali sarebbe una previsione falsa | mostrare solo i conteggi: perderebbe la struttura del tabellone richiesta dal ticket | test «mostra gironi pieni, bye e accoppiamenti» |
| `GET /api/tournaments/:id/preview` riservata agli organizzatori (404 torneo assente, 403 non organizzatore) e restituisce `{ valid, errors, warnings, preview }`; nessuna scrittura e nessun blocco della pubblicazione in questo ticket | la pubblicazione è TICKET-0009; qui si fornisce il dato che la UI e il futuro publish useranno | fondere preview e publish: mescolerebbe due ticket e due transazioni | `src/worker/routes/tournaments.ts`, `src/worker/routes/preview.test.ts` |
| I warning con `autoAdvance` attivo segnalano deadline non successive alla precedente e deadline già passate, senza incidere su `valid`; senza `autoAdvance` non vengono prodotti | la spec limita questi avvisi all'avanzamento automatico, dove una deadline già scaduta apre e chiude subito la fase | segnalare sempre le deadline passate: rumore per i tornei a chiusura manuale | test «con autoAdvance segnala deadline non successive e già passate senza bloccare» |
| Regola 14: `validatePlan` verifica nome e slug non vuoti; l'unicità dello slug resta garantita da `uniqueSlug` alla creazione, perché il dominio non può interrogare D1 | evita di duplicare nel dominio una query di unicità già applicata alla scrittura | query di unicità dentro la funzione pura: romperebbe il confine del dominio | `src/worker/db/tournaments.ts`, `src/domain/plan.test.ts` |
| Regola 11 non ha un campo dipendenze nel modello delle fasi: le fasi sono una sequenza ordinata e ogni transizione dipende solo dalla precedente, quindi non esiste un riferimento a sé o a una fase successiva da validare | il modello approvato in TICKET-0007 non modella dipendenze esplicite; introdurle ora sarebbe fuori scope | aggiungere un campo `dependsOn` non richiesto: cambierebbe piano e persistenza | `src/domain/phases.ts`, `src/domain/plan.ts` |
| UI: `PlanPreviewPanel` nel dettaglio torneo, con esito valido/non valido, errori bloccanti, avvisi e struttura per fase; un bottone ricarica l'anteprima | copre il requisito UI senza costruire il wizard di pubblicazione; il refresh esplicito evita un polling aggiuntivo | aggiornare l'anteprima a ogni modifica di fase via event bus: complessità non richiesta | `src/components/tournament/PlanPreviewPanel.vue`, `src/components/tournament/PlanPreviewPanel.test.ts`, `src/views/TournamentDetailView.vue` |
