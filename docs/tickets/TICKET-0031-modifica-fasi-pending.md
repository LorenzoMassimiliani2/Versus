---
id: TICKET-0031
title: Modificare fasi pending e riordinare il piano in corso
status: done
category: enhancement
blocked_by: [TICKET-0009, TICKET-0015]
blocks: [TICKET-0032, TICKET-0033]
source: docs/features/FEAT-0014-modificabilita-audit.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Applicare la regola A2 durante un torneo avviato.

**Comportamento richiesto.**
- Prima dell'apertura della prima fase tutto è modificabile.
- Dopo l'avvio, le fasi `pending` si possono aggiungere, eliminare, riordinare e riconfigurare.
- Le fasi `open`, `awaiting_resolution` e `closed` rifiutano le modifiche con 409.
- L'organizzatore può correggere i ripescati prima di aprire la fase successiva, quando l'avanzamento automatico è disattivato.
- Ogni modifica ricalcola l'anteprima e mantiene valido il piano.
- `autoAdvance` resta immutabile dopo l'apertura della prima fase.

**Fuori scope.** Riapertura di fasi chiuse, modifica di fasi avviate, audit log completo (ticket successivo).

## Acceptance criteria
- [ ] Una fase `pending` è modificabile durante il torneo.
- [ ] Una fase `open` rifiuta le modifiche con 409.
- [ ] Aggiungere o riordinare fasi future ricalcola l'anteprima.
- [ ] L'override dei ripescati è disponibile solo con `autoAdvance` disattivato.
- [ ] `autoAdvance` non è modificabile dopo l'apertura della prima fase.

## Choices

| decisione | rationale | alternatives_rejected | evidence |
|---|---|---|---|
| Dopo l'avvio è modificabile l'intera coda `pending`, purché la fase non pending che la precede sia `closed` | A2 parla di fasi pending modificabili e il ticket richiede il riordino della coda; applicare il vincolo alla fase immediatamente precedente renderebbe impossibile riordinare più fasi pending | Vincolo stretto "precedente immediata closed" per ogni fase pending | `src/worker/routes/phases.ts` (`isPendingEditable`), test "riordina le sole fasi pending durante il torneo" |
| Aggiunta in coda consentita dopo l'avvio solo se l'ultima fase è `closed`; prima dell'avvio resta libera | Riprende la regola "fase precedente chiusa" per una nuova fase e preserva il comportamento in bozza | Consentire sempre l'aggiunta in coda | test "consente di aggiungere una fase durante il torneo quando l'ultima fase è chiusa" e "rifiuta una nuova fase ... se l'ultima fase non è chiusa" |
| Le mutazioni durante il torneo non eseguono `validatePlan` completo: l'anteprima resta il gate di validità | La validazione statica impone che l'ultima fase produca un solo qualificato, quindi rifiuterebbe ogni aggiunta in coda dopo una fase chiusa; le fasi avviate restano comunque immutabili e l'anteprima viene ricalcolata | Rifiuto `422 plan_invalid` su ogni mutazione | `src/worker/routes/phases.ts`, test "ricalcola l anteprima dopo una modifica al piano" |
| Un override dei ripescati con `autoAdvance` attivo risponde `422 repechage_override_unavailable` | Criterio 68 della spec: con avanzamento automatico non esiste la finestra per l'override manuale | Ignorare l'override e aprire con la selezione automatica | `src/worker/phase-open.ts`, test "rifiuta l override manuale quando l avanzamento automatico è attivo" |
| UI: badge "Bloccata", pulsanti disabilitati e ricarica dell'anteprima dopo ogni mutazione | ADR-0006 richiede che la UI mostri quali fasi sono modificabili; l'anteprima deve riflettere subito le modifiche | Nascondere del tutto i comandi delle fasi bloccate | `src/components/tournament/PhasesPanel.vue`, test "indica le fasi bloccate..." |
| `autoAdvance` disabilitato nell'editor quando una fase è già avviata | Rende visibile in UI il vincolo già applicato dal backend (criterio 67) | Lasciare il checkbox attivo e mostrare l'errore solo al salvataggio | `src/views/TournamentDetailView.vue` |
