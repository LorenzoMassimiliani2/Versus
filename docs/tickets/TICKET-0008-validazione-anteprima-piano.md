---
id: TICKET-0008
title: Validazione del piano e anteprima
status: needs-triage
category: enhancement
blocked_by: [TICKET-0005, TICKET-0006, TICKET-0007]
blocks: [TICKET-0009]
source: docs/features/FEAT-0004-piano-fasi-validazione-anteprima.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Impedire piani rotti e mostrare all'organizzatore cosa succederà.

**Comportamento richiesto.**
- La validazione applica tutte le regole del piano e restituisce errori che indicano la fase.
- La pubblicazione è bloccata se il piano non è valido.
- L'anteprima calcola gironi, accoppiamenti, bye, qualificati e ripescati.
- Il piano canonico 40 → 10 gironi da 4 → primi 2 → ripescaggio a 32 → sedicesimi → ottavi → classifica finale a 8 è valido.
- Con `autoAdvance` attivo, l'anteprima segnala deadline non successive o già passate come warning.
- Gli errori bloccanti e i warning non bloccanti sono distinti nella UI.

**Fuori scope.** Pubblicazione, apertura della prima fase, calcolo dei risultati.

## Acceptance criteria
- [ ] Il piano canonico è valido e mostra 20 qualificati diretti e 12 ripescati.
- [ ] Un piano con ultima fase che qualifica N>1 viene rifiutato con un errore sulla fase.
- [ ] Una fase `elimination` non finale con avanzamento diverso da `winners` viene rifiutata.
- [ ] L'anteprima mostra gironi, bye, accoppiamenti e ripescati.
- [ ] I warning non bloccano la pubblicazione; gli errori sì.

## Choices

Nessuna scelta registrata.
