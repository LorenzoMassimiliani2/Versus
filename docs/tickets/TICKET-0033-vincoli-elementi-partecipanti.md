---
id: TICKET-0033
title: Applicare i vincoli su elementi e partecipanti durante il torneo
status: ready-for-agent
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

Nessuna scelta registrata.
