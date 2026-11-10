---
id: TICKET-0012
title: Selezionare i ripescati
status: done
category: enhancement
blocked_by: [TICKET-0010, TICKET-0011]
blocks: [TICKET-0015, TICKET-0021]
source: docs/features/FEAT-0005-motore-gironi-classifica-ripescaggio.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Calcolare quali esclusi entrano nella fase successiva quando il piano prevede un ripescaggio.

**Comportamento richiesto.**
- `applyRepechage` ordina gli esclusi con i criteri configurati: `group_points`, `first_preferences`, `weight_difference`, `draw`.
- Seleziona i primi fino a `targetSize`, senza superare il totale degli esclusi.
- `draw` usa un sorteggio crittografico e il risultato è tracciabile.
- `weight_difference` è disponibile solo se la fase precedente ha prodotto duelli.
- Se gli esclusi non bastano, la funzione restituisce un errore di validazione.
- Il risultato è deterministico a parità di input e criteri.

**Fuori scope.** Override manuale, persistenza, UI, apertura della fase successiva.

## Acceptance criteria
- [x] Con 20 qualificati diretti e target 32 vengono selezionati 12 ripescati.
- [x] I criteri sono applicati nell'ordine configurato.
- [x] `weight_difference` viene rifiutato se non ci sono duelli.
- [x] Esclusi insufficienti producono un errore.
- [x] `draw` è deterministico con lo stesso seed e tracciabile.

## Choices

| decisione | rationale | alternative_rejected | evidence |
|---|---|---|---|
| Il motore vive in `src/domain/repechage.ts` ed esporta `applyRepechage` come funzione pura con risultato discriminato `{ ok: true, ... }` / `{ ok: false, error }` | separa la selezione dei ripescati dalla validazione del piano e permette di testarla con fixture note, senza D1, HTTP o UI; la forma discriminata segue `buildGroups` e `validateCustomValues` | sollevare eccezioni per esclusi insufficienti: il chiamante API dovrebbe usare `try/catch` per un caso d'uso previsto | `src/domain/repechage.ts`, test con 20 diretti e target 32 |
| L'input dichiara `directQualified` e `targetSize`; i posti da riempire sono `max(0, targetSize - directQualified)`. Con target già raggiunto la funzione non seleziona nessuno e non consuma il sorteggio | replica la regola della spec «se `targetSize` è già raggiunto dai qualificati diretti, il ripescaggio non fa nulla» | derivare il target dai soli esclusi: perderebbe il conteggio dei diretti, unico dato che determina i posti | test «con target gia raggiunto non seleziona nessuno» |
| Un criterio è applicabile solo se ogni escluso espone la misura richiesta (`groupPoints`, `firstPreferences`) e, per `weight_difference`, se `hasDuels` è vero; altrimenti si restituisce `{ error: 'criterion_unavailable', criterion }` | la disponibilità dipende sia dai dati prodotti dalla fase precedente sia dal tipo di scheda; dichiarare quale criterio manca rende l'errore azionabile | assumere 0 per le misure assenti: falserebbe l'ordine e nasconderebbe una configurazione impossibile | test «rifiuta weight_difference senza duelli», «rifiuta group_points senza dato di girone», «rifiuta first_preferences senza schede» |
| La selezione applica i criteri in ordine; un criterio che non separa il gruppo passa il gruppo intatto al successivo. A parità totale resta l'ordine di input, che è deterministico | a parità di input e criteri il risultato è sempre lo stesso, come richiesto; l'ordine di input è una base dichiarata dal chiamante, non un sorteggio silenzioso | ordinare per id come fallback: nasconderebbe un pareggio reale e sarebbe un criterio non configurato | test «applica i criteri nell ordine configurato», «senza draw una parita totale resta nell ordine di input» |
| `draw` prepara un'unica permutazione crittografica di tutti gli esclusi tramite Fisher-Yates con `randomInt` iniettabile; quando il criterio `draw` viene raggiunto usa la posizione nella permutazione, e l'ordine completo è restituito in `draw` | il sorteggio deve essere crittografico in produzione e riproducibile nei test; esporre l'intera permutazione rende il risultato tracciabile e ricostruibile anche se i criteri precedenti hanno già separato alcuni elementi | sorteggiare solo i gruppi ancora appaiati: il log non conterrebbe un ordine completo e sarebbe più difficile da verificare | test «draw e deterministico con lo stesso seed e traccia il sorteggio», «draw rompe la parita al confine», «draw senza generatore usa il sorteggio crittografico» |
| Gli esclusi insufficienti producono `{ error: 'not_enough_excluded', required, available }`, senza risultato parziale | un avanzo parziale silenzioso romperebbe la dimensione della fase successiva; i due numeri rendono immediato il messaggio di validazione | selezionare tutti gli esclusi disponibili: la funzione dichiarerebbe un successo che il piano non può rispettare | test «restituisce un errore se gli esclusi non bastano» |
| Il risultato espone `selected`, `excluded` (non selezionati), `order` (selezione deterministica completa), `criteria`, `slots` e `draw` | copre quanto richiesto dal ticket e permette all'anteprima e all'apertura della fase di mostrare e salvare l'esito senza ricalcolarlo | restituire solo gli id selezionati: il log non distinguerebbe gli esclusi rimasti fuori né l'ordine applicato | `RepechageSelection`, test sul contenuto di `selected`/`excluded`/`order` |
| Il preview di `plan.ts` resta invariato: la sua `applyRepechage` privata calcola solo conteggi e non dispone delle misure degli esclusi | il ticket è limitato alla selezione; il collegamento a dati reali e apertura fase appartiene a TICKET-0015/0021 | sostituire subito il helper di anteprima: richiederebbe misure che il piano non calcola e uscirebbe dallo scope | `src/domain/plan.ts` invariato; `applyRepechage` testata in isolamento |
| I test sono co-locati in `src/domain/repechage.test.ts` (13 casi) con generatore LCG iniettato per il determinismo | segue la convenzione del repo e verifica il seam pubblico senza dipendere dal sorteggio crittografico reale | test sul generatore di default: non riproducibili | `npm test` (276 test verdi) |
