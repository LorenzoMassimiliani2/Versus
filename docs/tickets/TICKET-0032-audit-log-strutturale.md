---
id: TICKET-0032
title: Registrare le modifiche strutturali in audit log
status: done
category: enhancement
blocked_by: [TICKET-0031]
blocks: []
source: docs/features/FEAT-0014-modificabilita-audit.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Rendere tracciabile ogni modifica strutturale del torneo.

**Comportamento richiesto.**
- Ogni modifica a torneo, fasi, elementi, partecipanti e organizzatori produce una riga in `audit_log`.
- La riga contiene attore, azione, tipo e id del target, stato prima e dopo, data.
- L'organizzatore può leggere il log del proprio torneo.
- I partecipanti non possono leggere il log.
- Le modifiche non strutturali, come il voto, non finiscono in `audit_log`.

**Fuori scope.** Audit delle azioni admin, esportazione del log, retention.

## Acceptance criteria
- [ ] Una modifica a una fase pending produce una riga con before e after.
- [ ] La nomina di un co-organizzatore produce una riga.
- [ ] L'organizzatore legge il log del torneo.
- [ ] Un partecipante riceve 403 sul log.
- [ ] Il voto non produce righe in `audit_log`.

## Choices

| decisione | rationale | alternatives_rejected | evidence |
|---|---|---|---|
| Helper unico in `src/worker/db/audit.ts` (`auditStatement`, `writeAudit`, `listAuditEntries`) usato da tutte le aree, incluse le azioni già tracciate | Evita varianti divergenti dell'INSERT e serializza `before`/`after` in un solo punto; le azioni preesistenti (admin, ripescati, target advance, risoluzione) sono state migrate senza cambiare il formato | Lasciare gli INSERT inline e aggiungerne altri per le nuove aree | `src/worker/db/audit.ts`, `src/worker/routes/users.ts`, `src/worker/phase-open.ts`, `src/worker/routes/phase-targets.ts`, `src/worker/routes/phase-close.ts` |
| `auditStatement` supporta una clausola `WHERE` opzionale per legare la riga all'esito della transazione | La risoluzione di fase scrive audit nello stesso batch condizionato a `phase_results`; l'helper resta unico anche per quel caso | Tenere un INSERT condizionale separato solo in `phase-close` | `auditStatement(..., condition)` e test "applica l ordine, chiude la fase e scrive snapshot e audit" |
| Catalogo azioni: `tournament.*`, `phase.create/update/delete/reorder`, `element.*`, `field.*`, `participant.add/remove`, `organizer.nominate/revoke` | Nomi stabili e raggruppati per area, coerenti con le azioni già esistenti (`phase.resolve`, `phase.target_advance`) | Nomi per rotta HTTP o per tabella | `src/worker/routes/*`, `src/lib/strings.ts` |
| La creazione del torneo produce `tournament.create`; la riga owner non produce anche `organizer.nominate` | La nomina dell'owner è parte della creazione e una seconda riga sarebbe una duplicazione dello stesso atto | Due righe alla creazione | test "traccia la modifica del torneo con before e after", route `POST /api/tournaments` |
| Apertura, chiusura e annullamento delle fasi non aggiungono righe strutturali | Sono transizioni di stato già tracciate dal ciclo di vita, non modifiche del piano; le azioni già registrate (ripescaggio, target, risoluzione) restano invariate | Auditare ogni transizione come modifica di fase | test "il voto non produce righe di audit" e suite fasi esistenti |
| `GET /api/tournaments/:id/audit` riservata a `owner` e `co_organizer`, massimo 200 voci dalla più recente, `before`/`after` restituiti come JSON | Il log è visibile a tutti gli organizzatori del torneo (spec A2) e il limite evita risposte illimitate; il client riceve valori già parsati per il diff | Log visibile ai partecipanti o paginazione in v1 | `src/worker/routes/tournaments.ts`, test "l organizzatore legge solo il log del proprio torneo" e "rifiuta il log ai partecipanti e ai non membri" |
| UI: pannello `AuditLogPanel` nel dettaglio torneo per gli organizzatori, con attore, azione, tipo/id target, data e diff sintetico chiave per chiave | Rende leggibile il log senza esporre JSON grezzo; il diff usa le etichette italiane centralizzate in `strings.ts` | Tabella tecnica con JSON espanso o nessun pannello | `src/components/tournament/AuditLogPanel.vue`, `src/lib/audit.ts`, test del componente |
