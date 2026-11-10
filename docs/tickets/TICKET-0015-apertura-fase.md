---
id: TICKET-0015
title: Aprire una fase e creare gironi, match e snapshot votanti
status: done
category: enhancement
blocked_by: [TICKET-0009, TICKET-0010, TICKET-0011, TICKET-0012, TICKET-0013, TICKET-0014]
blocks: [TICKET-0016, TICKET-0018, TICKET-0019, TICKET-0026, TICKET-0031]
source: docs/features/FEAT-0007-ciclo-fase-avanzamento.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Avviare una fase e congelare lo stato operativo necessario al voto.

**Comportamento richiesto.**
- L'apertura è ammessa solo se la fase è `pending` e la precedente è `closed` o è la prima fase.
- Vengono calcolati gli elementi in ingresso, i gironi o gli accoppiamenti e gli eventuali ripescati.
- L'organizzatore può correggere manualmente i ripescati prima dell'apertura; la modifica è tracciata.
- Vengono creati `phase_entrants`, `phase_voters`, `groups`, `group_members` e `matches` con stato `open`.
- Il budget crediti per votante è fotografato.
- La fase passa a `open` e il torneo a `running`.
- La UI dell'organizzatore mostra la fase aperta e permette di avviarla.

**Fuori scope.** Chiusura, voto, risultati, auto-avanzamento.

## Acceptance criteria
- [x] Aprire la prima fase porta il torneo in `running`.
- [x] Gironi e match sono creati con gli elementi corretti.
- [x] Il budget crediti è fotografato in `phase_voters`.
- [x] L'override manuale dei ripescati è tracciato.
- [x] Una fase non `pending` o con precedente non chiusa viene rifiutata con 409.

## Choices

| decisione | rationale | alternatives_rejected | evidence |
|---|---|---|---|
| La migrazione `0006_phase_operation.sql` crea `phase_entrants`, `phase_voters`, `groups`, `group_members`, `matches` e anche `phase_results` | l'apertura di una fase successiva legge i qualificati della precedente da `phase_results`; la tabella e' la proiezione prevista dalla spec, TICKET-0016 la scrive e questo ticket la legge. Crearla qui rende il seam leggibile e testabile subito | derivare i qualificati dai soli `matches`: non funziona per `top_global` e `top_per_group`, che dipendono dalle classifiche; creare la tabella in TICKET-0016 lascerebbe l'apertura non testabile | `migrations/0006_phase_operation.sql`, test di apertura con ripescaggio |
| L'apertura usa un `UPDATE phases ... WHERE status = 'pending'` condizionale come claim, poi inserisce lo stato operativo in un batch; su errore cancella le righe parziali e riporta fase e torneo | due richieste concorrenti non creano due set di gironi o sfide; il test concorrente riceve un 200 e un 409 con un solo insieme di righe | inserire prima dei figli e controllare le modifiche dopo: la chiave di `phase_entrants` farebbe fallire la seconda richiesta con un errore 500 invece di 409 | `openPhaseHandler`, test «apre una sola volta con due richieste concorrenti» |
| Il calcolo della struttura vive in `src/domain/phase-opening.ts` e riusa `buildGroups`, `buildRoundRobin` e `buildBracket`; la scelta di formula resta nel worker | nessuna regola di dominio duplicata: il modulo puro compone i motori esistenti, il worker orchestra D1, autorizzazione e transazione | mettere la composizione nel route handler: logica di dominio non testabile senza D1 | `src/domain/phase-opening.ts`, `phase-opening.test.ts` |
| Gli elementi in ingresso vengono da `phase_results.qualified` e `repechage.selected` della fase precedente quando presenti; altrimenti `applyAdvance` ricava i vincitori dalle sfide salvate. Per `top_global`/`top_per_group` senza risultati si risponde 409 `previous_results_missing` | il risultato di chiusura e' la fonte autorevole; il fallback sulle sfide copre l'eliminazione e resta deterministico. Il 409 esplicito evita di inventare classifiche non calcolate | ricalcolare le classifiche dalle votazioni: duplicherebbe TICKET-0021 e leggerebbe tabelle di voto non ancora presenti | `computeEntrants`, test «fase precedente non chiusa» |
| L'override dei ripescati e' un array `repechageOverride` nel body di `POST .../open`; deve contenere esattamente `slots` id tutti tra gli esclusi. `GET .../open-preview` espone qualificati diretti, selezionati ed esclusi per la UI | la UI puo' mostrare e correggere la selezione prima dell'apertura; la validazione impedisce di alterare il numero di posti. Ogni override produce una riga `audit_log` con azione `phase.repechage_override`, `before` e `after` | accettare override di lunghezza diversa: cambierebbe il numero di partecipanti rispetto al piano validato | `validateOverride`, test override e audit |
| I bye dell'eliminazione sono righe `matches` con `status = 'bye'`, `winner_element_id` valorizzato e `closed_at`; la finale 3/4 posto non viene creata all'apertura | un bye non richiede voto e deve risultare chiuso subito; i partecipanti alla finale 3/4 dipendono dai perdenti delle semifinali, quindi la creazione appartiene a un ticket successivo | creare un match `open` per ogni bye: richiederebbe un voto impossibile | test «crea il tabellone con bye chiusi automaticamente» |
| Il seeding `manual` dell'eliminazione accetta `seedingOrder` nel body e risponde 422 `manual_seeding_required` se manca; l'assegnazione manuale dei gironi, priva di UI di trascinamento, conserva l'ordine di ingresso | evita di indovinare un ordine manuale e rende esplicito il dato mancante; per i gironi il fallback deterministico non blocca l'apertura | ignorare silenziosamente `manual` in entrambi i casi: nasconderebbe una configurazione non applicata | `planOpening`, `readStringArray` |
| Lo snapshot votanti contiene i partecipanti `active` del torneo con `credits_budget = config.credits.perVoter`; il torneo passa a `running` e `started_at` usa `COALESCE` | il budget e' congelato per fase e il primo avvio non sovrascrive `started_at` delle fasi successive | leggere il budget a ogni voto: tradirebbe la fotografia richiesta dalla spec | `listActiveParticipantIds`, test snapshot votanti |
