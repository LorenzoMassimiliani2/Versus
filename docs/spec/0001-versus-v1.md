---
id: SPEC-0001
title: Versus v1 — tornei configurabili con voto e crediti
status: ready-for-implementation
source: grilling del 2026-11-09
updated: 2026-11-10
---

# Versus v1

## Problem Statement

Organizzare un torneo tra amici o in una community oggi significa fogli di calcolo, messaggi sparsi e conteggi fatti a mano. Chi organizza vuole comporre un torneo che cambi forma mentre avanza — gironi, ripescaggi, eliminazione diretta, finali in stile Eurovision — e vuole che i partecipanti votino da mobile, con regole chiare su peso del voto, crediti e segretezza dei risultati.

Versus è una PWA mobile-first per un gruppo chiuso: l'admin crea gli utenti, gli organizzatori creano i tornei e scelgono le regole, i partecipanti votano. Non ci sono spettatori, non c'è registrazione pubblica.

## Solution

Una PWA installabile con:

- **Tornei** come sequenza ordinata di **Fasi**. Ogni fase ha una formula (`girone`, `eliminazione`, `classifica`), una scheda di voto (`duello`, `classifica`, `scelta`), una configurazione di tempi, segretezza e crediti, e una regola di avanzamento (`vincitore` oppure `qualifica N`).
- **Piano evolutivo**: le fasi future si possono aggiungere, togliere e riconfigurare finché non vengono avviate. Una fase avviata non cambia (decisione A2).
- **Avanzamento automatico opzionale**: se attivato alla creazione, alla chiusura di una fase si apre da sola la fase successiva, senza intervento dell'organizzatore.
- **Crediti** spendibili solo nei duelli: aumentano il peso del voto e fungono da primo spareggio. Budget per fase, deciso dall'organizzatore.
- **Segretezza** per fase: risultati live, nascosti fino alla chiusura, oppure segreti anche all'organizzatore.
- **Voto mobile**: una schermata per fase, con tutte le sfide aperte o in sequenza, video YouTube incorporato e barra dei crediti.
- **Pannello organizzatore**: anteprima del piano, stato dei voti, chiusura, risoluzione degli spareggi, log delle modifiche.
- **Podio e classifica finale**, con export CSV/JSON.

## Glossario

- **Torneo**: contenitore con elementi, partecipanti, organizzatori e un piano di fasi.
- **Elemento**: ciò che si vota (persona, canzone, foto). Ha nome, immagine opzionale, video opzionale e campi personalizzati. Può essere collegato a un partecipante, per il solo controllo dell'auto-voto.
- **Fase**: unità di svolgimento con formula, scheda di voto, configurazione e regola di avanzamento.
- **Sfida**: confronto 1 contro 1 tra due elementi dentro una fase di eliminazione o un girone round-robin.
- **Girone**: sottoinsieme di elementi che produce una classifica interna.
- **Scheda di voto**: forma del voto del partecipante (`duello`, `classifica`, `scelta`).
- **Credito**: unità spendibile nei duelli per aumentare il peso del voto; si consuma e non si trasferisce tra fasi.
- **Peso del voto**: `1 + crediti investiti` in un duello.
- **Qualificato**: elemento che passa alla fase successiva.
- **Ripescaggio**: regola di transizione che aggiunge esclusi fino a raggiungere una dimensione obiettivo.
- **Snapshot**: fotografia congelata di configurazione e risultati al momento della chiusura di una fase.
- **Organizzatore**: `owner` o `co_organizer` di un torneo.
- **Partecipante**: utente attivo del torneo che può votare e consultare.

## Ruoli e permessi

| Azione | admin | owner | co_organizer | participant |
|---|---|---|---|---|
| Creare utenti | sì | no | no | no |
| Reimpostare password | sì | no | no | no |
| Promuovere altri admin | sì | no | no | no |
| Creare torneo | sì | sì | no | no |
| Modificare torneo | solo se organizzatore | sì | sì | no |
| Nominare co-organizzatori | solo se owner | sì | no | no |
| Selezionare partecipanti | solo se organizzatore | sì | sì | no |
| Configurare fasi | solo se organizzatore | sì | sì | no |
| Aprire/chiudere fasi | solo se organizzatore | sì | sì | no |
| Risolvere spareggi | solo se organizzatore | sì | sì | no |
| Votare | solo se partecipante | solo se partecipante | solo se partecipante | sì |
| Vedere voti individuali | solo se organizzatore, secondo segretezza | secondo segretezza | secondo segretezza | mai |
| Esportare dati | solo se organizzatore | sì | sì | no |

L'`admin` d'istanza non è automaticamente organizzatore o partecipante di un torneo e non può leggere i tornei altrui. I ruoli sono indipendenti: l'admin gestisce utenti e può creare tornei propri come qualsiasi altro utente.

## Vincoli di istanza

Versus è dimensionato per un gruppo chiuso e stretto:

- Massimo **20 utenti attivi** sull'istanza. La creazione del ventunesimo utente attivo è rifiutata con `409`; un utente disattivato non occupa un posto e può essere riattivato solo se c'è spazio.
- Massimo **10 tornei attivi** contemporaneamente, dove attivo significa `published` o `running`. La pubblicazione dell'undicesimo torneo è rifiutata con `409`; le bozze non contano.
- Massimo **20 partecipanti attivi** per torneo, coerente con il numero massimo di utenti.
- Polling di stato ogni **4 secondi** con pagina visibile. Con questi numeri il piano gratuito di Cloudflare è sufficiente.

Questi limiti sono controlli applicativi, non vincoli dello schema. Vanno verificati al momento della creazione o della transizione, non solo nella UI.

## Ciclo di vita

### Torneo

```
draft -> published -> running -> concluded -> archived
              ^            |
              |            v
              +--------- (archived)
concluded -> running   solo con riapertura esplicita e conferma
```

- `draft`: visibile solo agli organizzatori. Modificabile in tutto.
- `published`: piano valido, partecipanti selezionati, elementi definiti. Visibile ai partecipanti, non votabile.
- `running`: almeno una fase aperta o chiusa.
- `concluded`: fase finale chiusa con un vincitore.
- `archived`: nascosto dalle liste attive, leggibile via URL.

Nessun torneo viene cancellato fisicamente.

### Fase

```
pending -> open -> closed
   |         |
   |         +-> awaiting_resolution -> closed
   +-> cancelled
```

- `pending`: configurata, non avviata, modificabile.
- `open`: voti accettati, configurazione congelata.
- `awaiting_resolution`: chiusa la finestra ma un pareggio non è risolvibile dai criteri automatici.
- `closed`: risultati congelati in `phase_results`.
- `cancelled`: annullata dall'organizzatore, non conta per l'avanzamento.

## User Stories

1. Come admin, voglio creare un utente con username e password iniziale, così che possa partecipare senza registrarsi.
2. Come admin, voglio vedere la password iniziale una sola volta e copiarla, così da consegnarla all'utente.
3. Come admin, voglio impostare una nuova password a un utente che l'ha persa, così da sbloccarlo senza un sistema email.
4. Come admin, voglio disattivare un utente, così che non possa più accedere.
5. Come organizzatore, voglio creare un torneo in bozza con nome, descrizione e copertina opzionale.
6. Come organizzatore, voglio definire fino a 10 campi personalizzati per il torneo, così da adattare le schede a canzoni, persone o foto.
7. Come organizzatore, voglio aggiungere elementi con nome, immagine opzionale, video YouTube opzionale e valori dei campi personalizzati.
8. Come organizzatore, voglio riordinare gli elementi con drag & drop, così da controllare il seeding iniziale.
9. Come organizzatore, voglio selezionare i partecipanti tra gli utenti esistenti, così che solo loro possano votare.
10. Come organizzatore, voglio nominare co-organizzatori tra gli utenti esistenti, così da delegare la gestione.
11. Come organizzatore, voglio comporre il piano con un wizard, così da vedere subito la struttura del torneo.
12. Come organizzatore, voglio salvare un piano come template riutilizzabile e condiviso con gli altri organizzatori, così da ricreare in fretta un formato collaudato.
13. Come organizzatore, voglio un'anteprima del piano con errori e avvisi, così da non pubblicare un torneo rotto.
14. Come organizzatore, voglio pubblicare il torneo solo se il piano è valido.
15. Come organizzatore, voglio avviare la prima fase quando sono pronti tutti.
16. Come organizzatore, voglio scegliere per un girone se usare una classifica unica o un round-robin di duelli.
17. Come organizzatore, voglio configurare dimensione dei gironi, criteri di riempimento e quanti passano per girone.
18. Come organizzatore, voglio che il ripescaggio proponga automaticamente i migliori esclusi e poterli cambiare a mano prima di aprire la fase successiva, quando l'avanzamento automatico è disattivato.
19. Come organizzatore, voglio un'eliminazione diretta con seeding e bye automatici, così da gestire numeri non potenza di due.
20. Come organizzatore, voglio una fase di classifica con scala punti in stile Eurovision, modificabile.
21. Come organizzatore, voglio decidere se una fase elegge il vincitore o qualifica N elementi alla successiva.
22. Come organizzatore, voglio scegliere per ogni fase la segretezza dei risultati: live, fino alla chiusura, oppure segreta anche a me.
23. Come organizzatore, voglio assegnare un budget di crediti per fase, con default crescenti.
24. Come organizzatore, voglio limitare quanti crediti si possono mettere su una singola sfida.
25. Come organizzatore, voglio decidere se un partecipante può votare per il proprio elemento.
26. Come organizzatore, voglio scegliere se le sfide di una fase sono tutte aperte o in sequenza.
27. Come organizzatore, voglio una scadenza con data e ora precise, con default a fine giornata.
28. Come organizzatore, voglio chiudere la fase a scadenza, quando tutti hanno votato, o manualmente.
29. Come partecipante, voglio votare un duello scegliendo un lato e investendo crediti.
30. Come partecipante, voglio esprimere una classifica o una scelta secca su più elementi.
31. Come partecipante, voglio cambiare il mio voto finché la fase è aperta.
32. Come partecipante, voglio astenermi da una sfida, così da risultare comunque "avente votato".
33. Come partecipante, voglio vedere i risultati secondo la segretezza scelta dall'organizzatore.
34. Come partecipante, voglio vedere quanti crediti mi restano e quanto ho investito.
35. Come partecipante, voglio riprodurre il video YouTube dell'elemento dentro l'app.
36. Come partecipante, voglio sapere quali fasi ho completato e quante sfide mancano.
37. Come organizzatore, voglio vedere una barra di completamento per partecipante.
38. Come organizzatore, voglio risolvere un pareggio che i criteri automatici non risolvono, con nota nel log.
39. Come organizzatore, voglio resettare una fase aperta, annullando i voti e rimborsando i crediti.
40. Come organizzatore, voglio modificare le fasi future mentre il torneo è in corso.
41. Come organizzatore, voglio vedere il log di ogni modifica strutturale con prima/dopo.
42. Come organizzatore, voglio consultare podio, classifica completa e statistiche di partecipazione.
43. Come organizzatore, voglio esportare i dati del torneo in CSV o JSON.
44. Come partecipante, voglio installare la PWA e consultare gli ultimi dati visti anche offline.
45. Come partecipante, voglio che la schermata di voto si aggiorni da sola quando l'organizzatore apre o chiude una fase.
46. Come organizzatore, voglio attivare l'avanzamento automatico alla creazione del torneo, così che la fase successiva si apra da sola alla chiusura della precedente.

## Regole di dominio

### Piano e fasi

Il piano è una lista ordinata di fasi. La prima fase riceve tutti gli elementi del torneo nell'ordine scelto dall'organizzatore. Ogni fase successiva riceve l'output della precedente secondo la regola di avanzamento.

Ogni fase è definita da:

```ts
type Phase = {
  position: number;
  name: string;
  formula: "group" | "elimination" | "ranking";
  voteType: "duel" | "ranking" | "pick";
  config: PhaseConfig;
  advance: PhaseAdvance;
};

type PhaseConfig = {
  deadline: string | null;                       // ISO UTC
  closeTriggers: ("all_voted" | "deadline")[];   // manuale sempre possibile
  secrecy: "live" | "blind" | "secret";
  votingMode: "simultaneous" | "sequential";
  credits: { perVoter: number; maxPerMatch: number | null };

  groups?: {
    size: number;                                 // default 4, minimo 2
    assignment: "random" | "snake" | "manual";   // default random
    remainder: "smaller_groups" | "byes";        // default smaller_groups
    points: number[];                             // classifica del girone, default [3,2,1]
    standings?: { win: number; draw: number; loss: number }; // default 3/1/0
  };

  ranking?: {
    points: number[];                             // default [12,10,8,6,4,2,1]
    minSelections: number;                        // solo pick, default 1
  };

  elimination?: {
    seeding: "ranking" | "random" | "manual";     // default ranking
    thirdPlaceMatch: boolean;                     // default false
  };
};

type PhaseAdvance =
  | { type: "all" }
  | { type: "winners" }
  | { type: "top_global"; n: number; repechage?: RepechageRule }
  | { type: "top_per_group"; n: number; repechage?: RepechageRule }
  | { type: "winner" };

type RepechageRule = {
  targetSize: number;
  criteria: ("group_points" | "first_preferences" | "weight_difference" | "draw")[];
};
```

Impostazioni del torneo (campo `settings`):

```ts
type TournamentSettings = {
  selfVoteAllowed: boolean;   // default true
  autoAdvance: boolean;       // default false; solo prima dell'apertura della prima fase
  timezone: string;           // default "Europe/Rome", solo per i default di creazione
};
```

Vincoli tra formula e scheda:

| Formula | Scheda ammessa | Avanzamento ammesso |
|---|---|---|
| `group` | `ranking` (classifica unica del girone) | `top_per_group`, `all` |
| `group` | `duel` (round-robin) | `top_per_group`, `all` |
| `elimination` | `duel` | `winners` (turni intermedi), `winner` (finale) |
| `ranking` | `ranking` oppure `pick` | `top_global`, `all`, `winner` |

`winners` significa "tutti i vincitori delle sfide"; `all` significa "tutti gli elementi in ingresso, nell'ordine prodotto dalla fase".

### Validazione del piano (anteprima)

La pubblicazione è bloccata se una di queste regole fallisce:

1. Almeno 2 elementi, almeno 1 fase e almeno 1 partecipante attivo.
2. Le posizioni delle fasi sono contigue a partire da 1.
3. La prima fase riceve tutti gli elementi; ogni fase successiva riceve almeno 2 elementi dalla precedente.
4. Solo l'ultima fase può avere `advance.type = "winner"`. Tutte le altre devono qualificare almeno 2 elementi.
5. Una fase `group` ha dimensione ≥ 2, almeno un girone, e `top_per_group.n < size`.
6. `advance.type = "top_global"` richiede `n` ≤ numero di elementi in ingresso; `top_per_group` richiede `n` < dimensione del girone.
7. Una fase `ranking` con scheda `ranking` ha una scala punti strettamente decrescente, positiva, con lunghezza ≤ numero di elementi.
8. `credits.perVoter` ≥ 0; `maxPerMatch` è `null` oppure compreso tra 1 e `perVoter`.
9. `closeTriggers` può contenere `"deadline"` solo se `deadline` è valorizzata. Un array vuoto significa chiusura solo manuale.
10. Il ripescaggio è ammesso solo su `top_global` e `top_per_group`. `targetSize` deve essere maggiore dei qualificati diretti e non superiore al totale degli elementi in ingresso.
11. Nessuna fase può dipendere da sé stessa o da una fase successiva.
12. Una fase `elimination` non finale deve usare `advance.type = "winners"`; la finale deve usare `"winner"`.
13. Ogni elemento ha nome e valori conformi ai campi personalizzati; l'immagine è opzionale. I campi personalizzati sono al massimo 10 per torneo.
14. Il torneo ha un nome non vuoto e uno slug univoco generato dal nome.
15. Il torneo ha al massimo 20 partecipanti attivi.

L'anteprima mostra: numero di partecipanti per fase, gironi generati, accoppiamenti, bye, qualificati e ripescati. I warning non bloccanti (per esempio una deadline precedente alla fase prima) sono mostrati ma non impediscono la pubblicazione. Con `autoAdvance` attivo, l'anteprima segnala anche le deadline non successive a quella della fase precedente e quelle già passate.

### Composizione dei gironi

- Numero di gironi: `ceil(N / size)`. Con `remainder: smaller_groups` gli ultimi gironi possono avere meno elementi; con `remainder: byes` si creano gironi pieni e bye nella fase successiva.
- `assignment: random`: mescolamento crittografico, risultato salvato in `group_members`.
- `assignment: snake`: gli elementi ordinati vengono distribuiti a serpentina, per bilanciare le teste di serie.
- `assignment: manual`: l'organizzatore trascina gli elementi; il piano non è pubblicabile finché tutti gli elementi non sono assegnati.
- Ogni girone ha un nome progressivo (`Girone A`, `Girone B`, ...).
- Con `remainder: byes`, gli elementi senza girone passano direttamente alla fase successiva e contano come qualificati; l'anteprima li elenca.

### Eliminazione diretta

- Gli elementi in ingresso sono ordinati per seed (classifica precedente, ordine iniziale o sorteggio).
- Il tabellone viene portato alla potenza di 2 superiore `P` (es. 12 elementi → `P = 16`).
- Accoppiamenti: `1 vs P`, `2 vs P-1`, `3 vs P-2`, e così via. I seed oltre il numero di elementi sono bye e vengono assegnati ai seed migliori.
- Una fase `elimination` rappresenta **un turno**: sedicesimi, ottavi, quarti, semifinali o finale. L'organizzatore decide il nome e la cadenza.
- Le sfide con un solo elemento sono `bye` e si chiudono automaticamente senza voto.
- `thirdPlaceMatch: true` aggiunge la finale 3°/4° posto, che non influisce sull'avanzamento.

### Ripescaggio

Il ripescaggio è una **regola di transizione**, non una fase votata. Dopo aver applicato i qualificati diretti, gli esclusi vengono ordinati con i criteri scelti e si prendono i primi fino a `targetSize`.

Criteri disponibili, nell'ordine configurato:

- `group_points`: punti ottenuti nel girone (classifica o round-robin).
- `first_preferences`: numero di prime preferenze ricevute.
- `weight_difference`: differenza tra peso dei voti a favore e contro nei duelli.
- `draw`: sorteggio crittografico, con risultato salvato nel log.

`weight_difference` è disponibile solo se la fase precedente ha prodotto duelli; negli altri casi la validazione lo segnala come criterio non applicabile.

Se `targetSize` è già raggiunto dai qualificati diretti, il ripescaggio non fa nulla. Se gli esclusi non bastano, la validazione del piano lo segnala come errore. Se `autoAdvance` è disattivato, l'organizzatore può sostituire a mano i ripescati prima di aprire la fase successiva; la modifica è tracciata. Con `autoAdvance` attivo valgono solo i criteri automatici.

### Schede di voto

**Duello**

```ts
type DuelVote = {
  side: "a" | "b" | "abstain";
  credits: number;   // 0..min(budget, maxPerMatch)
};
```

- Un voto per partecipante per sfida.
- `abstain` non aggiunge peso ma conta come voto espresso per il completamento della fase.
- I crediti si possono mettere solo sul lato scelto; su `abstain` devono essere 0.
- Se `settings.selfVoteAllowed` è `false` e l'elemento è collegato a un partecipante tramite `elements.user_id`, il voto per quell'elemento è rifiutato con `422`.

**Classifica**

```ts
type RankingVote = {
  assignments: { elementId: string; points: number }[];
};
```

- Ogni valore della scala punti può essere usato al massimo una volta per scheda.
- I punti vanno solo a elementi del girone o della fase.
- Una scheda parziale è valida: si possono assegnare meno valori della scala.

**Scelta**

```ts
type PickVote = {
  elementId: string;
};
```

- Un solo elemento per scheda.
- Vale 1 punto nel conteggio dei pick.

### Modalità sequenziale

Con `votingMode: "sequential"` è aperto un solo target alla volta: una sfida per le fasi `elimination`, un girone per le fasi `group`. Quando tutti i votanti attivi hanno votato o si sono astenuti sul target corrente, il successivo si apre automaticamente. L'organizzatore può forzare il passaggio al target successivo; il passaggio è tracciato nel log. Con `simultaneous` tutti i target sono aperti dall'inizio.

### Calcolo e spareggi

**Duello**

- Peso di un voto: `1 + credits`.
- Punteggio lato: somma dei pesi.
- Vince il lato con punteggio maggiore.
- Spareggi, nell'ordine predefinito: crediti investiti nel lato, numero di votanti del lato, risoluzione manuale dell'organizzatore.
- L'ordine degli spareggi è modificabile per fase; la risoluzione manuale è sempre l'ultimo passo e non può essere tolta.

**Classifica**

- Punteggio elemento: somma dei punti ricevuti.
- Spareggi predefiniti: punti totali, numero di prime preferenze (valore massimo della scala), numero di schede che gli hanno dato punti, risoluzione manuale.

**Scelta**

- Punteggio elemento: numero di pick.
- Spareggi: pick totali, risoluzione manuale.

**Girone round-robin**

- Ogni coppia di elementi del girone è una sfida.
- Classifica del girone a punti: vittoria 3, pareggio 1, sconfitta 0 (configurabile).
- Spareggi: punti classifica, scontri diretti, differenza di peso nei duelli, crediti, risoluzione manuale.

**Pareggio non risolto**

Se dopo tutti i criteri automatici due elementi restano a pari merito in una posizione che conta per l'avanzamento, la fase passa in `awaiting_resolution`. L'organizzatore sceglie l'ordine con una nota obbligatoria, che finisce in `audit_log`. Nessun sorteggio automatico silenzioso: il caso `draw` esiste solo se esplicitamente configurato e il risultato viene salvato.

### Crediti

- Solo per la scheda `duello`.
- Budget per partecipante e per fase, fotografato in `phase_voters` all'apertura.
- Ogni spesa produce una riga in `credit_entries` con `reason = spend`; i rimborsi producono `refund`.
- Saldo = somma delle righe. Deve restare tra 0 e `perVoter`.
- Cambiare un voto regola il ledger con una nuova riga, non modifica quella precedente.
- Reset di una fase: tutte le spese della fase diventano `refund`.
- Chiusura di una fase: i crediti non spesi si perdono, non si trasferiscono.
- Visibilità: il partecipante vede il proprio saldo; l'organizzatore vede i saldi di tutti; gli altri partecipanti non vedono nulla.
- Default per fase suggeriti dal wizard: quarti 1, semifinali 2, finale 3. Sono solo default, non formule automatiche.

### Segretezza

| Modalità | Partecipante durante la fase | Partecipante dopo la chiusura | Organizzatore durante | Organizzatore dopo |
|---|---|---|---|---|
| `live` | risultati aggregati | aggregati | aggregati e voti individuali | aggregati e voti individuali |
| `blind` | solo il proprio voto | aggregati | aggregati e voti individuali | aggregati e voti individuali |
| `secret` | solo il proprio voto | aggregati | solo aggregati | solo aggregati |

- I voti individuali non sono **mai** esposti agli altri partecipanti, in nessuna modalità.
- "Aggregati" significa punteggi, conteggi e vincitori, non identità dei votanti.
- In `secret` l'organizzatore non vede chi ha votato cosa, nemmeno dopo la chiusura, a livello applicativo.
- La garanzia è applicativa: un amministratore con accesso diretto a D1, o che reimposta la password di un partecipante e accede con quelle credenziali, può tecnicamente risalire ai voti. Questo limite è accettato in v1; una segretezza crittografica richiederebbe chiavi lato client, fuori scope.
- Le API filtrano i payload in base al ruolo e alla modalità; non è il frontend a nascondere i dati.

### Apertura, chiusura, avanzamento

**Apertura**

1. La fase è `pending` e la precedente è `closed` o è la prima fase.
2. Vengono calcolati gli elementi in ingresso, i gironi o gli accoppiamenti.
3. Viene fotografato l'elenco dei votanti attivi e il budget crediti in `phase_voters`.
4. Vengono create le sfide (`matches`) o i gironi con stato `open`.
5. La fase passa a `open`; il torneo passa a `running`.

**Chiusura**

Trigger possibili, configurabili per fase:

- `all_voted`: ogni votante attivo ha espresso un voto (anche `abstain`) su ogni sfida o scheda prevista.
- `deadline`: `now >= deadline`.
- manuale: sempre disponibile.

La chiusura è valutata lazy a ogni richiesta di stato o azione. Se `closeTriggers` include `deadline`, la prima richiesta dopo la scadenza chiude la fase. La transizione `open -> closed` usa un batch condizionale su `status = 'open'`: due richieste concorrenti non producono più di uno snapshot.

Alla chiusura:

1. Si calcolano i risultati.
2. Se un pareggio non è risolvibile, la fase va in `awaiting_resolution` e non produce snapshot.
3. Altrimenti si salva `phase_results` con `config_snapshot` e `results`, e la fase passa a `closed`.
4. Se `advance.type = "winner"`, il torneo passa a `concluded` e registra `winner_element_id`.

**Avanzamento**

- Se `autoAdvance` è `false`, dopo la chiusura la fase successiva resta `pending` finché l'organizzatore non la apre. Se è `true`, si apre automaticamente come descritto sotto.
- Gli elementi in ingresso sono calcolati dalla regola di avanzamento più l'eventuale ripescaggio; l'organizzatore può correggere a mano i ripescati.
- Una fase `cancelled` non produce avanzamento; l'organizzatore deve ridefinire il piano.

**Avanzamento automatico**

`settings.autoAdvance` è un'opzione del torneo, default `false`, impostata alla creazione e modificabile solo finché la prima fase non è aperta.

Quando è `true`:

- alla chiusura di una fase, se la fase immediatamente successiva è `pending`, viene aperta nella stessa richiesta, con la configurazione già definita nel piano;
- l'apertura usa gli elementi calcolati da avanzamento e ripescaggio, senza intervento dell'organizzatore;
- se la fase va in `awaiting_resolution`, l'avanzamento è sospeso finché l'organizzatore non risolve e chiude;
- se la fase chiusa è l'ultima, il torneo va in `concluded` e non si apre nulla;
- una fase `cancelled` non attiva l'avanzamento automatico;
- con `autoAdvance` attivo il ripescaggio usa i criteri automatici: non c'è una finestra tra le fasi per sostituire a mano i ripescati. Per mantenere l'override manuale, disattivare `autoAdvance`;
- se la deadline della fase successiva è già passata al momento dell'apertura, la fase si apre e si chiude alla prima richiesta successiva, secondo la regola lazy;
- l'operazione è idempotente: due richieste concorrenti non aprono due volte la stessa fase. Se l'apertura automatica fallisce, la chiusura resta valida, la fase successiva resta `pending` e l'errore è visibile all'organizzatore.

### Modificabilità (decisione A2)

Prima dell'apertura della prima fase si può modificare tutto: elementi, partecipanti, fasi, configurazioni, impostazioni del torneo, template.

Dopo l'apertura della prima fase:

- **Fasi `open`, `awaiting_resolution` e `closed`**: configurazione immutabile. Si può solo chiudere, risolvere o annullare.
- **Fasi `pending`**: si possono aggiungere, rimuovere, riordinare e riconfigurare, purché il piano resti valido e la fase precedente sia chiusa.
- **Elementi**: metadati (nome, descrizione, immagine, video, campi personalizzati) modificabili con traccia nel log. Aggiunta e rimozione consentite solo se l'elemento non ha partecipato ad alcuna fase aperta o chiusa.
- **Partecipanti**: aggiunta e rimozione solo tra una fase e l'altra. La rimozione conserva i voti già espressi, aggregati e anonimi.
- **Organizzatori**: nomina e revoca sempre possibili da parte dell'`owner`; un `admin` può farlo solo se è organizzatore del torneo.
- **Torneo**: nome, descrizione e copertina modificabili sempre. `settings.autoAdvance` è modificabile solo prima dell'apertura della prima fase.

Ogni modifica strutturale produce una riga in `audit_log` con `before`, `after`, attore e data. Il log è visibile a tutti gli organizzatori del torneo.

### Casi limite

- **Nessun voto**: la fase non avanza. L'organizzatore può forzare un risultato con doppia conferma e nota, oppure annullare la fase.
- **Pareggio totale dopo tutti i criteri**: `awaiting_resolution`; scelta manuale obbligatoria.
- **Elemento rimosso dal torneo**: non può essere rimosso se ha partecipato a fasi aperte o chiuse; i metadati restano modificabili.
- **Partecipante rimosso**: non vota più; i voti passati restano nel conteggio e non sono riconducibili a lui nelle risposte API.
- **Fase con un solo elemento**: non è una fase valida; l'unico caso ammesso è una sfida `bye` dentro una fase di eliminazione.
- **Ripescaggio senza esclusi sufficienti**: errore in anteprima, blocco della pubblicazione.
- **Deadline passata mentre nessuno usa l'app**: la fase resta `open` finché una richiesta non la chiude; la UI mostra "in chiusura" al primo accesso successivo.
- **Modifica della scala punti con voti già espressi**: impossibile su fase aperta (A2); possibile solo resettando la fase, con rimborso crediti e nuovo snapshot.
- **Doppio invio dello stesso voto**: idempotente grazie alla chiave primaria; l'ultimo aggiornamento vince e produce un nuovo evento.
- **Voto su una sfida non aperta**: rifiutato con `409`.
- **Crediti oltre il budget**: rifiutato con `422` e saldo invariato.
- **Avanzamento automatico con fase successiva `cancelled`**: non si apre nulla; l'organizzatore deve correggere il piano.
- **Avanzamento automatico con deadline della fase successiva già passata**: la fase si apre e si chiude alla prima richiesta successiva; l'anteprima avvisa.
- **Avanzamento automatico con pareggio irrisolto**: la fase resta `awaiting_resolution` e nessuna fase si apre.
- **Avanzamento automatico e ripescaggio**: i ripescati sono quelli calcolati; l'override manuale tra fasi non è disponibile.

## Dati e API

### Tabelle D1

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT
);

CREATE TABLE login_attempts (
  key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','published','running','concluded','archived')),
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  started_at TEXT,
  concluded_at TEXT,
  winner_element_id TEXT REFERENCES elements(id)
);

CREATE TABLE tournament_organizers (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','co_organizer')),
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (tournament_id, user_id)
);
CREATE UNIQUE INDEX one_owner_per_tournament
  ON tournament_organizers(tournament_id) WHERE role = 'owner';

CREATE TABLE tournament_participants (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active','removed')),
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  removed_at TEXT,
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE custom_fields (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text','number','url','date')),
  position INTEGER NOT NULL,
  UNIQUE (tournament_id, key)
);

CREATE TABLE elements (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  video_url TEXT,
  custom_values TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE phases (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  formula TEXT NOT NULL CHECK (formula IN ('group','elimination','ranking')),
  vote_type TEXT NOT NULL CHECK (vote_type IN ('duel','ranking','pick')),
  config TEXT NOT NULL,
  advance TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','open','awaiting_resolution','closed','cancelled')),
  opened_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tournament_id, position)
);

CREATE TABLE phase_entrants (
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL REFERENCES elements(id),
  seed INTEGER NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (phase_id, element_id)
);

CREATE TABLE phase_voters (
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  credits_budget INTEGER NOT NULL,
  PRIMARY KEY (phase_id, user_id)
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL REFERENCES elements(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (group_id, element_id)
);

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id),
  round INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL,
  element_a_id TEXT REFERENCES elements(id),
  element_b_id TEXT REFERENCES elements(id),
  winner_element_id TEXT REFERENCES elements(id),
  status TEXT NOT NULL CHECK (status IN ('pending','open','closed','bye')),
  closed_at TEXT
);

CREATE TABLE duel_votes (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL REFERENCES users(id),
  side TEXT NOT NULL CHECK (side IN ('a','b','abstain')),
  credits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (match_id, voter_id)
);

CREATE TABLE ballot_votes (
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  voter_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('ranking','pick')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (phase_id, target_id, voter_id)
);

CREATE TABLE vote_events (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('duel','ranking','pick')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE credit_entries (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL REFERENCES users(id),
  match_id TEXT,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spend','refund','adjust')),
  vote_event_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE phase_results (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  closed_at TEXT NOT NULL,
  config_snapshot TEXT NOT NULL,
  results TEXT NOT NULL,
  UNIQUE (phase_id, version)
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  tournament_id TEXT REFERENCES tournaments(id) ON DELETE CASCADE,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  before TEXT,
  after TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  plan TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Indici minimi:

```sql
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_organizers_user ON tournament_organizers(user_id);
CREATE INDEX idx_participants_user ON tournament_participants(user_id);
CREATE INDEX idx_elements_tournament ON elements(tournament_id, position);
CREATE INDEX idx_phases_tournament ON phases(tournament_id, position);
CREATE INDEX idx_groups_phase ON groups(phase_id, position);
CREATE INDEX idx_matches_phase ON matches(phase_id, round, position);
CREATE INDEX idx_duel_votes_match ON duel_votes(match_id);
CREATE INDEX idx_ballot_votes_phase ON ballot_votes(phase_id, target_id);
CREATE INDEX idx_vote_events_phase ON vote_events(phase_id, created_at);
CREATE INDEX idx_credit_entries_phase ON credit_entries(phase_id, voter_id);
CREATE INDEX idx_audit_tournament ON audit_log(tournament_id, created_at);
```

### Proiezioni e snapshot

- `duel_votes` e `ballot_votes` contengono il voto **corrente**.
- `vote_events` è append-only: ogni creazione o modifica aggiunge una riga. Non si aggiorna e non si cancella.
- `credit_entries` è append-only e spiega ogni movimento.
- `phase_results` congela il risultato al momento della chiusura, con la configurazione usata. In v1 una fase chiusa non viene riaperta: ogni fase ha una sola riga di risultato e `version` vale 1. La colonna `version` resta per evoluzioni future.
- `phase_entrants`, `phase_voters`, `groups`, `group_members`, `matches` sono lo stato operativo della fase, creato all'apertura.

### Rotte API

Tutte le rotte tranne `GET /api/health` e `POST /api/auth/login` richiedono una sessione valida. Le mutazioni richiedono `Origin` coerente con l'host.

**Autenticazione**

Regole: username minuscolo, 3–32 caratteri `[a-z0-9_.-]`, univoco; password 8–128 caratteri. Il login è rate-limited per username e per IP.

| Metodo | Rotta | Ruolo | Note |
|---|---|---|---|
| POST | `/api/auth/login` | pubblico | `{ username, password }`, imposta il cookie |
| POST | `/api/auth/logout` | autenticato | revoca la sessione |
| GET | `/api/me` | autenticato | utente, ruolo admin, tornei visibili |

**Utenti (solo admin)**

| Metodo | Rotta | Note |
|---|---|---|
| GET | `/api/users?q=` | ricerca per username |
| POST | `/api/users` | `{ username, password }`, password restituita una volta |
| PATCH | `/api/users/:id` | `{ isActive, isAdmin }`; solo un admin può promuovere o revocare un altro admin |
| POST | `/api/users/:id/password` | `{ password }`, nuova password impostata dall'admin |

**Tornei**

| Metodo | Rotta | Ruolo | Note |
|---|---|---|---|
| GET | `/api/tournaments` | autenticato | solo tornei dove si è organizzatore o partecipante |
| POST | `/api/tournaments` | utente attivo | `{ name, description, settings? }`, chi lo crea diventa `owner`; slug generato dal nome; `settings.autoAdvance` default `false` |
| GET | `/api/tournaments/:id` | membro | dettaglio filtrato per ruolo |
| PATCH | `/api/tournaments/:id` | organizzatore | nome, descrizione, copertina, impostazioni; `autoAdvance` solo prima dell'apertura della prima fase |
| GET | `/api/tournaments/:id/preview` | organizzatore | validazione e anteprima del piano |
| POST | `/api/tournaments/:id/publish` | organizzatore | richiede piano valido |
| POST | `/api/tournaments/:id/reopen` | owner | da `concluded` a `running`, con conferma |
| POST | `/api/tournaments/:id/archive` | owner | |
| GET | `/api/tournaments/:id/state` | membro | polling con `ETag` |
| GET | `/api/tournaments/:id/export?format=csv\|json` | organizzatore | |

**Organizzatori e partecipanti**

| Metodo | Rotta | Ruolo | Note |
|---|---|---|---|
| POST | `/api/tournaments/:id/organizers` | owner | `{ userId }`, ruolo `co_organizer` |
| DELETE | `/api/tournaments/:id/organizers/:userId` | owner | non si può rimuovere l'owner |
| POST | `/api/tournaments/:id/participants` | organizzatore | `{ userId }`, solo utenti esistenti |
| DELETE | `/api/tournaments/:id/participants/:userId` | organizzatore | tra fasi; conserva i voti |
| GET | `/api/tournaments/:id/participants` | organizzatore | stato e completamento per fase |

**Elementi e campi**

| Metodo | Rotta | Ruolo | Note |
|---|---|---|---|
| GET | `/api/tournaments/:id/elements` | membro | |
| POST | `/api/tournaments/:id/elements` | organizzatore | immagine opzionale |
| PATCH | `/api/elements/:id` | organizzatore | metadati |
| DELETE | `/api/elements/:id` | organizzatore | solo se mai usato |
| PUT | `/api/tournaments/:id/elements/order` | organizzatore | `{ ids: [...] }` |
| GET/POST | `/api/tournaments/:id/fields` | organizzatore | massimo 10 |
| PATCH/DELETE | `/api/fields/:id` | organizzatore | |

**Fasi**

| Metodo | Rotta | Ruolo | Note |
|---|---|---|---|
| GET | `/api/tournaments/:id/phases` | membro | |
| POST | `/api/tournaments/:id/phases` | organizzatore | |
| PATCH | `/api/phases/:id` | organizzatore | solo `pending` |
| DELETE | `/api/phases/:id` | organizzatore | solo `pending`, riordina le successive |
| POST | `/api/phases/:id/open` | organizzatore | crea gironi, match e snapshot votanti |
| POST | `/api/phases/:id/close` | organizzatore | forza la chiusura |
| POST | `/api/phases/:id/cancel` | organizzatore | solo se non ci sono voti o con conferma |
| POST | `/api/phases/:id/reset` | organizzatore | solo `open`; annulla voti e rimborsa crediti |
| POST | `/api/phases/:id/resolve` | organizzatore | `{ resolutions: [{ targetId, ordering: [elementId] }], note }` |
| GET | `/api/phases/:id/ballot` | partecipante | sfide, proprio voto, saldo crediti, completamento |
| POST | `/api/phases/:id/duels/:matchId/votes` | partecipante | `{ side, credits }` |
| DELETE | `/api/phases/:id/duels/:matchId/votes` | partecipante | |
| POST | `/api/phases/:id/ballots` | partecipante | `{ targetId, kind, payload }` |
| DELETE | `/api/phases/:id/ballots/:targetId` | partecipante | |
| GET | `/api/phases/:id/results` | membro | filtrata da segretezza e ruolo |

**Template**

| Metodo | Rotta | Ruolo | Note |
|---|---|---|---|
| GET | `/api/templates` | organizzatore | tutti i template dell'istanza |
| POST | `/api/templates` | organizzatore | `{ name, plan }`, il creatore viene registrato |
| PATCH | `/api/templates/:id` | organizzatore | `{ name?, plan? }`, aggiorna `updated_by` |
| DELETE | `/api/templates/:id` | organizzatore | consentita a ogni organizzatore |

I template sono condivisi e modificabili da tutti gli organizzatori. Un template salva la sequenza delle fasi e la loro configurazione, non elementi né partecipanti. Applicarlo a un nuovo torneo copia il piano: modifiche successive al template non toccano i tornei già creati.

**Polling di stato**

`GET /api/tournaments/:id/state` restituisce:

```json
{
  "etag": "…",
  "tournament": { "status": "running", "currentPhaseId": "…" },
  "phases": [
    { "id": "…", "position": 1, "status": "open", "deadline": "…", "voted": 7, "voters": 10, "resultVisible": false }
  ],
  "serverTime": "2026-11-09T18:00:00Z"
}
```

`ETag` deriva da `tournaments.updated_at`, stato e `updated_at` delle fasi, conteggi dei voti visibili. Con `If-None-Match` uguale, risponde `304`.

### Forma dei risultati

```json
{
  "phaseId": "…",
  "closedAt": "…",
  "groups": [
    {
      "groupId": "…",
      "ranking": [
        { "elementId": "…", "score": 24, "firstPreferences": 3, "tieBreak": null }
      ]
    }
  ],
  "matches": [
    {
      "matchId": "…",
      "sideA": { "elementId": "…", "weight": 7, "credits": 2, "voters": 3 },
      "sideB": { "elementId": "…", "weight": 5, "credits": 0, "voters": 2 },
      "winnerElementId": "…",
      "resolvedBy": "weight"
    }
  ],
  "qualified": ["…"],
  "repechage": { "enabled": true, "selected": ["…"], "criteria": ["group_points"] },
  "winnerElementId": null
}
```

## Interfaccia

### Schermate

1. **Login**: username, password, gestione errori e disattivazione.
2. **Tornei**: tab "Partecipo" e "Organizzo"; per l'admin anche "Utenti". Card con stato, fase corrente, scadenza.
3. **Dettaglio torneo**: elementi, piano delle fasi, stato, accesso al voto o ai risultati.
4. **Voto**: una schermata per fase.
   - Duello: due card affiancate (verticali su mobile stretto), video YouTube incorporato, selettore crediti, pulsante astensione, indicatore di completamento.
   - Classifica: lista elementi con assegnazione dei punti disponibili; trascinamento per l'ordine; punti residui sempre visibili.
   - Scelta: griglia di card con selezione singola.
5. **Risultati fase**: classifiche, sfide, qualificati, ripescati, stato di segretezza.
6. **Podio**: primi tre, classifica completa, statistiche.
7. **Pannello organizzatore**: overview, elementi, partecipanti, piano, log.
8. **Wizard creazione**: dettagli (incluso `autoAdvance`) → elementi → campi → partecipanti → piano → anteprima → pubblica.
9. **Gestione utenti (admin)**: crea, disattiva, imposta password, copia credenziali.

### Comportamenti mobile

- Layout a colonna singola sotto 640 px, due colonne per i duelli sopra.
- Target touch minimo 44 px.
- Il selettore crediti usa pulsanti `-` e `+` con valore centrale, non uno slider.
- Il video YouTube è un iframe `youtube-nocookie.com`; si carica solo dopo un tap ("Riproduci video") per non rallentare la schermata.
- Nessun autoplay.
- Il polling si ferma quando la scheda è nascosta e riparte al ritorno visibile.

## PWA e offline

- Manifest con nome, colori, icone 192/512/maskable/apple-touch.
- Service worker `autoUpdate`, `navigateFallbackDenylist: /^\/api\//`.
- Precache della shell. Cache runtime per l'ultimo torneo consultato e le sue immagini esterne, con scadenza breve.
- Nessuna coda di mutazioni offline. Votare richiede connessione; l'interfaccia disabilita il voto e mostra "Sei offline".
- Le schermate in cache sono di sola lettura e mostrano l'ora dell'ultimo aggiornamento.
- Nessuna background sync (supporto iOS inaffidabile).

## Non obiettivi (v1)

- Spettatori, tornei pubblici, iscrizione libera.
- Registrazione self-service e reset password via email.
- Notifiche push e reminder via email.
- Vista proiettabile o modalità presentazione.
- Upload di immagini o video: solo URL esterni, immagini referenziate.
- Doppia eliminazione, gironi a più gare di andata e ritorno, round-robin globale.
- Ripescaggio votato: il ripescaggio è calcolato, non votato.
- Modifiche strutturali a una fase già aperta (decisione A2).
- Più lingue, valute, pagamenti, abbonamenti.
- App native iOS/Android.
- WebSocket o aggiornamenti push lato server.
- Generazione di immagini condivisibili del podio.
- Integrazione con Spotify, Apple Music o altri servizi oltre all'embed YouTube.

## Criteri di accettazione

### Autenticazione e utenti

1. L'admin crea un utente; la password è restituita una sola volta e il login con quelle credenziali funziona.
2. Un utente disattivato riceve `403` al login e le sue sessioni sono revocate.
3. L'admin imposta una nuova password; tutte le sessioni attive dell'utente vengono revocate.
4. Il cookie di sessione è `HttpOnly`, `Secure`, `SameSite=Lax`; dopo 30 giorni la sessione scade.
5. Non esiste alcuna rotta di registrazione o reset password pubblica.
6. Dopo 10 tentativi falliti in 15 minuti per username o IP, il login risponde `429` per 15 minuti.

### Tornei e piano

7. Un utente attivo crea un torneo e ne diventa `owner`; il torneo in `draft` non è visibile agli altri.
8. Il piano di esempio "40 elementi, 10 gironi da 4, passano i primi 2, ripescaggio a 32, sedicesimi, ottavi, classifica finale a 8" è valido e l'anteprima mostra 20 qualificati diretti e 12 ripescati.
9. Un piano con ultima fase che qualifica N>1 è rifiutato con un errore che indica la fase.
10. La pubblicazione è bloccata finché il piano non è valido.
11. Dopo la pubblicazione i partecipanti vedono elementi e piano ma non possono votare.
12. L'apertura della prima fase porta il torneo in `running`.
13. La chiusura della fase con `advance.type = "winner"` porta il torneo in `concluded` e registra il vincitore.

### Gironi

14. Con 40 elementi e dimensione 4 vengono creati 10 gironi da 4.
15. Con 38 elementi e `remainder: smaller_groups` vengono creati 8 gironi da 4 e 2 da 3.
16. Con `remainder: byes` vengono creati 9 gironi da 4 e 2 elementi ricevono bye nella fase successiva.
17. In modalità `ranking` ogni votante compila una scheda per girone e passano i primi `top_per_group.n`.
18. In una fase `group` con scheda `duel` ogni girone da 4 produce 6 sfide e la classifica usa i punti 3/1/0.
19. Il ripescaggio seleziona i migliori esclusi secondo i criteri configurati; l'override manuale è tracciato nel log.

### Eliminazione

20. Con 32 elementi la fase produce 16 sfide; con 12 elementi produce 4 sfide e 4 bye.
21. I bye si chiudono automaticamente senza voto e i seed migliori li ricevono.
22. La finale 3°/4° posto, se attiva, non modifica i qualificati della finale.

### Classifica

23. La scala punti `[12,10,8,6,4,2,1]` può essere modificata solo su fasi non aperte.
24. Una scheda parziale è accettata; i punti non assegnati non vengono redistribuiti.
25. Il pareggio sui punti si risolve con il numero di prime preferenze, poi con la scelta manuale se configurata.
26. Una fase `ranking` può eleggere il vincitore oppure qualificare i primi N.

### Crediti

27. Il budget è per partecipante e per fase; il saldo non può essere negativo né superare il budget.
28. Investire 5 crediti in un duello produce peso 6 e il movimento appare in `credit_entries`.
29. Cambiare il lato di un duello rimborsa i crediti del lato precedente e addebita i nuovi.
30. Il reset della fase rimborsa tutte le spese della fase.
31. Alla chiusura i crediti non spesi non si trasferiscono alla fase successiva.
32. Se `maxPerMatch` è 2, un voto con 3 crediti viene rifiutato con `422`.

### Segretezza

33. In `live` il partecipante vede i risultati aggregati durante la fase.
34. In `blind` il partecipante vede solo il proprio voto fino alla chiusura.
35. In `secret` l'organizzatore riceve solo aggregati tramite l'app, anche dopo la chiusura.
36. In nessuna modalità un partecipante riceve l'identità di un altro votante.

### Ciclo della fase

37. Con `closeTriggers: ["all_voted"]` la fase si chiude quando ogni votante ha votato o si è astenuto su ogni target.
38. Con `closeTriggers: ["deadline"]` la fase si chiude alla prima richiesta dopo la scadenza; due richieste concorrenti producono un solo snapshot.
39. Un pareggio irrisolvibile porta la fase in `awaiting_resolution`; la risoluzione manuale richiede una nota e produce una riga di audit.
40. Una fase annullata non produce avanzamento.
41. Nessun voto espresso dopo la chiusura viene accettato: `409`.

### Modificabilità

42. Una fase `pending` può essere modificata durante il torneo; una fase `open` rifiuta le modifiche con `409`.
43. Aggiungere o rimuovere una fase futura ricalcola l'anteprima e mantiene valido il piano.
44. Un elemento che ha partecipato a una fase aperta o chiusa non può essere eliminato.
45. Ogni modifica strutturale produce una riga in `audit_log` con `before` e `after`.

### PWA e aggiornamenti

46. La PWA è installabile e mostra la shell anche offline.
47. Il polling usa `If-None-Match` e riceve `304` quando nulla è cambiato.
48. Il polling si interrompe a scheda nascosta e riprende al ritorno visibile.
49. Il voto offline è disabilitato con un messaggio esplicito; nessuna mutazione viene accodata.

### Export

50. L'export JSON contiene torneo, elementi, fasi, risultati e qualificazioni.
51. L'export CSV produce un file leggibile con una riga per elemento e una per fase, senza dipendenze da Excel.

### Ruoli

52. Un co-organizzatore non può creare utenti né promuovere admin: `403`.
53. Un utente può essere partecipante in più tornei contemporaneamente.
54. L'admin può promuovere un altro utente ad admin; la promozione è tracciata in `audit_log`.
55. Con `selfVoteAllowed: false`, un voto per un elemento collegato al votante viene rifiutato con `422`.

### Limiti di istanza e template

56. La creazione del ventunesimo utente attivo è rifiutata con `409`.
57. Un utente disattivato non conta nel limite; la riattivazione è rifiutata con `409` se ci sono già 20 utenti attivi.
58. La pubblicazione dell'undicesimo torneo attivo è rifiutata con `409`; le bozze non contano.
59. Un torneo con più di 20 partecipanti attivi è rifiutato.
60. Un template creato da un organizzatore è visibile, modificabile ed eliminabile da ogni altro organizzatore.
61. Applicare un template copia il piano nel nuovo torneo; una modifica successiva al template non cambia il torneo già creato.
62. Una fase `closed` non può essere modificata né riaperta: ogni tentativo restituisce `409`.

### Avanzamento automatico

63. Con `autoAdvance: true`, alla chiusura della fase 1 la fase 2 diventa `open` nella stessa richiesta, senza un'altra azione dell'organizzatore.
64. Con `autoAdvance: false`, alla chiusura della fase 1 la fase 2 resta `pending`.
65. Se la fase va in `awaiting_resolution`, `autoAdvance` non apre la successiva; dopo la risoluzione e la chiusura, la apre.
66. Con `autoAdvance: true` e l'ultima fase chiusa, il torneo passa a `concluded` e nessuna fase viene aperta.
67. `autoAdvance` non è modificabile dopo l'apertura della prima fase: la richiesta restituisce `409`.
68. Con `autoAdvance: true`, il ripescaggio usa i criteri automatici e l'override manuale tra fasi non è disponibile.
69. Due richieste concorrenti che chiudono la stessa fase con `autoAdvance` attivo aprono la fase successiva una sola volta.

## Seams e test

- **Motore di dominio puro** in `src/domain/`: `validatePlan`, `buildGroups`, `buildBracket`, `tallyDuel`, `tallyRanking`, `tallyPick`, `computeStandings`, `applyAdvance`, `applyRepechage`, `resolveTie`.
- **Fixture canonica** nei test: 40 elementi, 10 gironi da 4, passano i primi 2, ripescaggio a 32, sedicesimi, ottavi, classifica finale a 8. Deve produrre sempre la stessa struttura.
- **Test di integrazione API** con D1 locale, attraverso le rotte HTTP: creazione utente, login, torneo, piano, apertura, voto, chiusura, avanzamento.
- **Test di segretezza** che verificano i payload delle API per ruolo e modalità, non solo la UI.
- **Test golden** per gli spareggi: stessi voti, stesse regole, stesso vincitore.
- Niente mock dei collaboratori interni: si testa il comportamento osservabile. Per D1 si usa l'istanza locale, non un finto database in memoria.
- Le funzioni di dominio non importano da `worker/` né da `views/`.

## Assunzioni

- Qualsiasi utente attivo può creare un torneo e ne diventa `owner`. L'admin resta l'unico che crea utenti.
- Un solo admin iniziale, creato con `npm run admin:create`.
- Il nome utente è univoco sull'istanza, minuscolo, 3–32 caratteri `[a-z0-9_.-]`.
- La copertina del torneo è un URL esterno opzionale.
- Le immagini degli elementi sono URL esterni; non c'è upload.
- Il video è un URL YouTube; l'embed usa `youtube-nocookie.com`.
- I template sono condivisi e modificabili da tutti gli organizzatori.
- L'istanza è dimensionata per un gruppo stretto: massimo 20 utenti attivi e 10 tornei attivi.
- Una fase chiusa non viene riaperta in v1.
- La modalità `secret` è una garanzia applicativa, non crittografica.
- `settings.autoAdvance` è disattivato per default. Attivarlo comporta l'apertura automatica della fase successiva e rinuncia all'override manuale dei ripescati tra le fasi.

## Decisioni chiuse il 2026-11-10

1. Template condivisi e modificabili da tutti gli organizzatori.
2. Istanza dimensionata per massimo 10 tornei attivi e 20 utenti attivi.
3. Massimo 20 partecipanti per torneo; polling a 4 secondi.
4. L'admin non vede i voti in modalità `secret` tramite l'app; la garanzia è applicativa.
5. UI con token shadcn-vue di default e wordmark "Versus"; logo e palette definitivi sono rimandati.
6. Nessuna riapertura di fase chiusa in v1.
7. Chiusura a scadenza lazy e idempotente.
8. Avanzamento automatico opzionale, impostabile alla creazione e immutabile dopo l'apertura della prima fase.
