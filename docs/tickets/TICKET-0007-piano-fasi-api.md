---
id: TICKET-0007
title: Modello e API del piano di fasi
status: done
category: enhancement
blocked_by: [TICKET-0004, TICKET-0005]
blocks: [TICKET-0008, TICKET-0010, TICKET-0013, TICKET-0028]
source: docs/features/FEAT-0004-piano-fasi-validazione-anteprima.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Rappresentare e gestire il piano come sequenza ordinata di fasi configurabili.

**Comportamento richiesto.**
- Ogni fase ha posizione, nome, formula (`group`, `elimination`, `ranking`), scheda (`duel`, `ranking`, `pick`), configurazione e regola di avanzamento.
- Le posizioni sono contigue e partono da 1.
- Le fasi `draft` sono modificabili; le fasi avviate non lo sono.
- Il piano conserva le impostazioni `selfVoteAllowed` e `autoAdvance`.
- Le API restituiscono il piano completo e consentono di aggiungere, modificare, eliminare e riordinare fasi non avviate.
- La UI mostra il piano e permette di modificarlo prima della pubblicazione.

**Fuori scope.** Validazione semantica completa, anteprima, pubblicazione, apertura fasi.

## Acceptance criteria
- [x] Un piano con posizioni contigue viene salvato e riletto correttamente.
- [x] Una fase con formula o scheda non ammessa viene rifiutata.
- [x] Una fase avviata non può essere modificata.
- [x] Aggiungere, eliminare e riordinare fasi aggiorna le posizioni.
- [x] `selfVoteAllowed` e `autoAdvance` sono persistiti nelle impostazioni del torneo.

## Choices

| decisione | rationale | alternative_rejected | evidence |
|---|---|---|---|
| Tipi e validazione strutturale in `src/domain/phases.ts`: `Phase`, `PhaseConfig`, `PhaseAdvance`, `RepechageRule`, mappe formula→scheda e formula→avanzamento, più `validatePhaseCreate` e `validatePhasePatch` | il motore di dominio resta puro e testabile senza D1/HTTP; le tabelle della spec su schede e avanzamenti diventano un'unica fonte usata da API e UI | validare nelle rotte o nei componenti Vue (duplicazione delle regole, non testabile in isolamento) | `src/domain/phases.test.ts`, `src/worker/routes/phases.ts` |
| Configurazione normalizzata con i default della spec: deadline `null`, `closeTriggers` vuoto, segretezza `live`, voto `simultaneous`, crediti `0`/`null`; i blocchi opzionali `groups`, `ranking`, `elimination` ricevono i default solo se presenti | permette di creare una fase con `config: {}` e di rileggere sempre una struttura completa, senza anticipare la validazione semantica di TICKET-0008 | richiedere ogni campo nel body (API più rumorosa), salvare il JSON grezzo (tipi non garantiti) | `src/domain/phases.ts`, test «salva e rilegge un piano» |
| Migrazione `0005_phases.sql` con `UNIQUE(tournament_id, position)` e indice `idx_phases_tournament`; la contiguità è applicativa | SQLite non esprime una sequenza contigua; il vincolo di unicità impedisce duplicati e gli aggiornamenti di posizione usano un passaggio temporaneo a valori negativi per evitare collisioni durante riordino e cancellazione | trigger SQL di ricompattamento (più difficile da testare e da mantenere), nessun vincolo di unicità | `migrations/0005_phases.sql`, `src/worker/db/migrations.test.ts` |
| Rotte `GET/POST /api/tournaments/:id/phases`, `PATCH/DELETE /api/phases/:id`, `PUT /api/tournaments/:id/phases/order` con body `{ ids }` | segue le rotte della spec e riusa il pattern già adottato per l'ordine degli elementi | inserire la posizione nel body di PATCH (più ambigua sui conflitti), una rotta per ogni spostamento | `src/worker/routes/phases.ts`, `src/worker/routes/phases.test.ts` |
| Errori: `400 invalid_request` per body malformato, `422 invalid_phase` per formula/scheda/avanzamento/config non ammessi, `409 phase_not_editable` per fasi non `pending`, `409 tournament_not_editable` per mutazioni fuori bozza | separa malformazione, regola di dominio e stato della risorsa; mantiene i codici esistenti delle altre aree | un solo `400` per ogni errore (la UI non può distinguere i casi), `403` per fase avviata (non è un problema di permessi) | `src/worker/routes/phases.test.ts` |
| Solo le fasi `pending` di un torneo in bozza si creano, modificano, eliminano e riordinano; il riordino richiede che tutte le fasi siano `pending` | rispetta A2 e il perimetro del ticket; una fase avviata resta immutabile e il piano non si riordina a metà | consentire modifiche alle fasi pending anche dopo l'avvio (TICKET-0031), riordinare ignorando le fasi non pending (posizioni ambigue) | test «non modifica una fase avviata», «rifiuta il riordino se una fase è già avviata» |
| `TournamentSettings` esteso a `{ selfVoteAllowed, autoAdvance }` con default `true`/`false`, parsato da un modulo di dominio; il piano restituisce le impostazioni insieme alle fasi | la spec definisce entrambe le impostazioni e il piano deve mostrarle; un parser unico evita default divergenti tra creazione, lettura e modifica | restituire solo `autoAdvance` dal dettaglio torneo e `selfVoteAllowed` dal piano (due forme diverse), salvare le due chiavi in tabelle separate | `src/domain/tournament-settings.ts`, `src/worker/routes/tournaments.ts`, `src/worker/routes/phases.test.ts` |
| UI: nuovo `PhasesPanel` con elenco, form di creazione/modifica, frecce di riordino, eliminazione e anteprima lineare; le due impostazioni sono checkbox nel form del torneo | copre il requisito UI senza costruire il wizard di TICKET-0009; il pannello conserva i blocchi di configurazione non esposti quando si modifica una fase | mettere tutto in `TournamentDetailView` (componente già grande), costruire subito il wizard completo (fuori scope) | `src/components/tournament/PhasesPanel.test.ts`, `src/views/TournamentDetailView.test.ts` |
| Nessuna riga in `audit_log` e nessuna validazione semantica del piano | sono esplicitamente di TICKET-0032 e TICKET-0008; il ticket chiede solo la validazione strutturale minima | anticipare audit e validazione semantica (duplicherebbe ticket futuri e allargherebbe il perimetro) | `docs/tickets/TICKET-0008-validazione-anteprima-piano.md`, `docs/tickets/TICKET-0032-audit-log-strutturale.md` |
