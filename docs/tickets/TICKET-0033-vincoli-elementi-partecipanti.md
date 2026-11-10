---
id: TICKET-0033
title: Applicare i vincoli su elementi e partecipanti durante il torneo
status: done
category: enhancement
blocked_by: [TICKET-0031]
blocks: []
source: docs/features/FEAT-0014-modificabilita-audit.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Proteggere la coerenza dei dati quando il torneo è in corso.

**Comportamento richiesto.**
- I metadati degli elementi sono modificabili anche dopo l'avvio, con traccia.
- Un elemento che ha partecipato a una fase aperta o chiusa non può essere eliminato.
- Un elemento può essere aggiunto solo se non altera una fase avviata.
- Un partecipante può essere aggiunto o rimosso solo tra una fase e l'altra.
- La rimozione di un partecipante conserva i voti passati, aggregati e anonimi.
- I ruoli di organizzatore possono essere nominati e revocati dall'owner.

**Fuori scope.** Cancellazione fisica del torneo, riapertura di fasi, modifica dei voti passati.

## Acceptance criteria
- [ ] Un elemento usato in una fase aperta o chiusa non può essere eliminato: 409.
- [ ] I metadati di un elemento usato restano modificabili con traccia.
- [ ] Un partecipante può essere rimosso tra due fasi e i voti passati restano nel conteggio.
- [ ] Un partecipante non può essere aggiunto durante una fase aperta.
- [ ] L'owner nomina e revoca co-organizzatori.

## Choices

| decisione | rationale | alternatives_rejected | evidence |
|---|---|---|---|
| L'aggiunta di elementi risponde `409 element_locked` quando esiste almeno una fase con `opened_at` valorizzato | A2 parla di insieme degli elementi congelato dall'apertura della prima fase; una fase annullata dopo l'apertura ha comunque congelato i suoi ingressi | Consentire aggiunte dopo la chiusura di una fase, lasciando elementi che non possono entrare in nessuna fase gia' calcolata | `src/worker/routes/elements.ts`, `src/worker/db/phases.ts` (`countOpenedPhases`), test "blocca con 409 l aggiunta di un elemento dopo l apertura della prima fase" |
| L'eliminazione e' bloccata se l'elemento compare in `phase_entrants`, `group_members` o `matches` di una fase con `opened_at` valorizzato, con `409 element_in_use` | Copre anche le fasi annullate dopo l'apertura, dove i riferimenti restano e i vincoli di chiave esterna impedirebbero comunque la cancellazione | Filtrare solo su `status IN ('open','closed')`, lasciando scoperti `awaiting_resolution` e le fasi annullate | `src/worker/db/elements.ts` (`listUsedElementIds`), test "blocca con 409 l eliminazione..." |
| I metadati restano modificabili senza guardie di stato; `PATCH /api/elements/:id` scrive gia' `element.update` con `before`/`after` | La regola A2 distingue i metadati (sempre modificabili) dalla struttura; il percorso esistente era gia' corretto e va solo verificato | Bloccare l'intera PATCH durante il torneo o introdurre un endpoint separato per i metadati | test "mantiene modificabili i metadati di un elemento usato con una riga di audit" |
| L'API elementi espone `locked` calcolato sull'uso in fasi avviate; la UI disabilita "Elimina" e mostra il motivo | Evita che il client deduca l'uso dalle fasi, che non conosce per singolo elemento | Solo errore 409 al click, senza stato visibile | `src/components/tournament/ElementCard.vue`, `src/components/tournament/ElementsPanel.vue` |
| I partecipanti sono modificabili con torneo `draft`, `published` o `running` e nessuna fase `open`/`awaiting_resolution`; altrimenti `409 phase_in_progress`. Tornei `concluded`/`archived` rispondono `409 tournament_not_editable` | "Tra una fase e l'altra" include la finestra prima della prima fase e quella tra chiusura e apertura successiva, ma esclude il torneo concluso | Ripristinare la vecchia regola "solo in bozza", che impedirebbe ogni correzione durante il torneo | `src/worker/routes/participants.ts`, `src/worker/db/phases.ts` (`hasActivePhases`), test "blocca aggiunta e rimozione mentre una fase è aperta" |
| La rimozione resta logica e non tocca `vote_events`, `duel_votes` o `ballot_votes` | I voti sono eventi legati al votante, non alla riga di partecipazione; la rimozione cambia solo `tournament_participants` | Cancellare o aggregare i voti alla rimozione | test "rimuove un partecipante tra due fasi e conserva i voti passati" |
| La nomina e la revoca dei co-organizzatori restano senza guardie di stato, riservate all'`owner`, con audit `organizer.nominate`/`organizer.revoke` | Il comportamento esistente rispettava gia' A2; il ticket richiede solo di verificarlo durante il torneo | Limitare la nomina alla bozza | test "l owner nomina e revoca un co-organizzatore con una fase aperta, con audit" |
| La UI dei partecipanti usa `participantsEditable` derivato da stato torneo e fasi attive; il pannello mostra "solo tra una fase e l'altra" quando bloccato | Rende visibile il vincolo senza duplicare la regola nel componente | Lasciare il pannello sempre attivo e mostrare solo l'errore API | `src/views/TournamentDetailView.vue`, `src/components/tournament/ParticipantsPanel.vue` |
