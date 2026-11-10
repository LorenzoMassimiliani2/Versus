---
id: TICKET-0005
title: Elementi con media e campi personalizzati
status: needs-triage
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
- [ ] Il torneo rifiuta l'undicesimo campo personalizzato.
- [ ] Un elemento senza immagine viene rifiutato.
- [ ] I valori dei campi rispettano il tipo dichiarato.
- [ ] Il riordino degli elementi persiste e cambia il seeding iniziale.
- [ ] Il video YouTube è mostrato solo dopo un tap e usa `youtube-nocookie.com`.

## Choices

Nessuna scelta registrata.
