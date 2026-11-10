---
id: TICKET-0005
title: Elementi con media e campi personalizzati
status: done
category: enhancement
blocked_by: [TICKET-0004]
blocks: [TICKET-0007, TICKET-0008]
source: docs/features/FEAT-0003-tornei-elementi-partecipanti.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Definire ciò che si vota: elementi con immagine, video opzionale e campi personalizzati.

**Comportamento richiesto.**
- Ogni torneo ha al massimo 10 campi personalizzati con chiave, etichetta, tipo (`text`, `number`, `url`, `date`) e posizione.
- Ogni elemento ha nome, immagine obbligatoria, video YouTube opzionale e valori conformi ai campi.
- Gli elementi si creano, modificano e riordinano; l'ordine è persistito.
- Un elemento può essere collegato a un partecipante per il controllo dell'auto-voto.
- La UI mostra le card degli elementi con immagine e video solo dopo un tap.

**Fuori scope.** Upload di file, download o scansione di media, modifica durante il torneo.

## Acceptance criteria
- [x] Il torneo rifiuta l'undicesimo campo personalizzato.
- [x] Un elemento senza immagine viene rifiutato.
- [x] I valori dei campi rispettano il tipo dichiarato.
- [x] Il riordino degli elementi persiste e cambia il seeding iniziale.
- [x] Il video YouTube è mostrato solo dopo un tap e usa `youtube-nocookie.com`.

## Choices

| decisione | rationale | alternative_rejected | evidence |
|---|---|---|---|
| Migrazione `0003_elements_custom_fields.sql` con `custom_fields` ed `elements`; i valori dinamici sono l'oggetto JSON `elements.custom_values`, validato dall'applicazione | SQLite non tipizza campi dinamici; i vincoli statici restano nel DDL | tabelle per singolo valore o `json_extract`: più join e nessun guadagno per 10 campi | `migrations/0003_elements_custom_fields.sql`, `src/worker/db/migrations.test.ts` |
| Limite di 10 campi applicativo con risposta `409 field_limit_reached`; chiave normalizzata in minuscolo con pattern `[a-z][a-z0-9_]{0,31}` e univoca per torneo | il limite è di istanza, non strutturale; la chiave è un identificatore stabile per i valori | `CHECK` sul conteggio (non esprimibile in SQLite) o limite solo UI | `src/worker/routes/elements.ts`, test «rifiuta l undicesimo campo» |
| `PATCH /api/fields/:id` cambia solo l'etichetta: chiave e tipo restano immutabili; la cancellazione del campo rimuove la chiave dai valori degli elementi | cambiare tipo o chiave invaliderebbe valori già salvati; eliminare il campo non deve lasciare dati orfani | permettere il cambio tipo con migrazione dei valori o rifiuto a runtime: complessità fuori scope | `src/worker/routes/elements.ts`, test «cancella il campo rimuovendo i valori» |
| Immagine obbligatoria e solo `http`/`https`; video accettato solo se il dominio è YouTube, con id estratto da `watch`, `youtu.be`, `shorts`, `embed`, `live` | nessun upload né scansione; l'embed può usare `youtube-nocookie.com` | accettare qualunque URL e incorporarlo: rischio di contenuti non previsti | `src/domain/youtube.ts`, test «rifiuta video che non sono YouTube» |
| I valori dei campi sono validati in `src/domain/custom-values.ts`; valori errati `422 invalid_values`, chiave sconosciuta `400 unknown_field` | validazione pura e testabile, riusabile da fasi e wizard | validazione solo nel route o nella UI | `src/domain/custom-values.ts`, test «valida i valori contro il tipo dei campi» |
| `PUT /api/tournaments/:id/elements/order` richiede esattamente gli id del torneo, assegna posizioni contigue da 1 e riscrive `tournaments.updated_at`; il seeding iniziale deriva dalla posizione (`initialSeeding`) | evita ordini parziali o id estranei e rende l'ordine la sorgente del seeding | accettare un sottoinsieme o posizioni arbitrarie: seeding ambiguo | `src/domain/seeding.ts`, test «persiste l ordine e lo usa come seeding iniziale» |
| Il riordino in UI usa bottoni «Sposta su/giù» da 44 px con `aria-label`, non il drag & drop | il requisito ammette entrambi; i bottoni sono affidabili su mobile, accessibili e testabili | drag & drop con pointer events: più fragile su touch e non accessibile | `src/components/tournament/ElementsPanel.vue`, test «riordina con i bottoni accessibili» |
| `GET /api/tournaments/:id/elements` resta riservato agli organizzatori finché TICKET-0006 non introduce i partecipanti | oggi solo gli organizzatori sono membri del torneo; la rotta si estenderà con i partecipanti | aprire la rotta a qualunque utente autenticato: esporrebbe bozze | `src/worker/routes/elements.ts`, test di autorizzazione |
| `DELETE /api/elements/:id` non blocca ancora gli elementi usati in una fase e compatta le posizioni residue | le tabelle delle fasi nascono in TICKET-0007; il vincolo «mai usato» arriva con TICKET-0033 | rinviare del tutto la cancellazione o aggiungere guardie su tabelle inesistenti | commento nel handler, `src/worker/db/elements.ts` |
| `user_id` è accettato e validato contro un utente attivo, ma la UI non lo espone finché TICKET-0006 non fornisce la lista partecipanti | il collegamento serve all'auto-voto; l'API è pronta senza inventare una selezione utenti fuori scope | campo di testo con id utente nella UI: scomodo e soggetto a errori | `src/worker/routes/elements.ts`, test «rifiuta un utente collegato inesistente» |
