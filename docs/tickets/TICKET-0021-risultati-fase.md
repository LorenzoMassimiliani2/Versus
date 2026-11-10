---
id: TICKET-0021
title: Calcolare e mostrare i risultati di fase
status: done
category: enhancement
blocked_by: [TICKET-0011, TICKET-0012, TICKET-0014, TICKET-0016, TICKET-0018, TICKET-0019]
blocks: [TICKET-0022, TICKET-0023, TICKET-0024, TICKET-0026]
source: docs/features/FEAT-0009-risultati-segretezza-risoluzione.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Rendere leggibile l'esito di una fase.

**Comportamento richiesto.**
- I risultati includono classifiche dei gironi, sfide, qualificati, ripescati e vincitore.
- I punteggi mostrano peso e numero di votanti per lato.
- Il risultato è conservato in `phase_results` con la configurazione usata.
- `GET /api/phases/:id/results` restituisce il payload filtrato per ruolo.
- La UI mostra classifiche, sfide, qualificati e ripescati.
- Una fase chiusa non ricalcola i risultati automaticamente.

**Fuori scope.** Filtri di segretezza, risoluzione manuale, podio, export.

## Acceptance criteria
- [ ] I risultati di un girone mostrano la classifica ordinata.
- [ ] I risultati di un duello mostrano peso, crediti e votanti per lato.
- [ ] Qualificati e ripescati sono elencati.
- [ ] Lo snapshot contiene la configurazione usata.
- [ ] La UI di risultati mostra i dati senza modificare lo stato.

## Choices

| decisione | rationale | alternatives_rejected | evidence |
|---|---|---|---|
| `GET /api/phases/:id/results` legge solo `phase_results` e non ricalcola; per una fase chiusa lo snapshot è l'unica fonte | il ticket richiede che una fase chiusa non ricalcoli i risultati; il calcolo è già fatto e congelato da TICKET-0016 | ricalcolare a ogni lettura: spreco e risultati potenzialmente divergenti dallo snapshot | `src/worker/routes/phase-results.ts`, test «non ricalcola i risultati dopo la chiusura» |
| La rotta applica la chiusura lazy (`closePhaseIfDue`) prima di leggere lo snapshot | rispetta il modello di esecuzione lazy di ADR-0004: una scadenza superata si chiude alla prima richiesta di stato | ignorare la deadline: la fase resterebbe aperta finché nessuno chiama `/close` | test route fase chiusa; riuso di `closePhaseIfDue` |
| Una fase non chiusa risponde `409 phase_not_closed`; `awaiting_resolution` risponde `409 phase_awaiting_resolution` | il ticket ammette 409; il codice distingue il caso di spareggio da risolvere (TICKET-0023) | restituire un payload vuoto: confonderebbe «nessun risultato» con «fase non chiusa» | test «non espone risultati definitivi di una fase non chiusa» |
| Autorizzazione con `findTournamentRole`: organizzatori e partecipanti attivi del torneo; gli altri ricevono `403 forbidden` | è il «ruolo base» richiesto; la segretezza per modalità è di TICKET-0022 | sola `findOrganizerRole`: escluderebbe i partecipanti; nessun controllo: esporrebbe un torneo privato | test «richiede l appartenenza al torneo» |
| Il payload riusa la forma di `ResultsPayload` (`groups`, `matches`, `ranking`, `qualified`, `repechage`, `winnerElementId`) e aggiunge `phase`, `closedAt`, `version` ed `elements` | la UI deve mostrare nomi e immagini, ma `GET /api/tournaments/:id/elements` è riservata agli organizzatori; aggiungere i nomi evita di ampliare quella rotta | cambiare l'autorizzazione degli elementi: romperebbe i test e il contratto esistente; mostrare solo id: UI illeggibile | `ResultsPayload`, `PhaseResultsView`, test «restituisce lo snapshot… a un partecipante» |
| I nomi dei gironi vengono dalla tabella `groups` per `groupId`, con fallback `null` e etichetta posizionale nella UI | lo snapshot della chiusura non salvava i nomi; la tabella operativa li conserva e la UI ha comunque un'etichetta sensata | aggiungere i nomi allo snapshot: cambierebbe il formato già salvato da TICKET-0016 | `listPhaseGroups`, `PhaseResultsView` |
| Nuova view `PhaseResultsView` e store `results`; il dettaglio torneo carica sempre il piano e collega le fasi `closed` | serve una schermata di sola lettura raggiungibile da ogni membro; il link deve esistere anche per i partecipanti | mettere i risultati dentro il dettaglio: mescolerebbe voto, gestione e consultazione | `src/views/PhaseResultsView.vue`, `src/stores/results.ts`, test view e link |
