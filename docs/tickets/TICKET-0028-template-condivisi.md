---
id: TICKET-0028
title: Template condivisi e applicazione a un nuovo torneo
status: needs-triage
category: enhancement
blocked_by: [TICKET-0007]
blocks: []
source: docs/features/FEAT-0012-template-condivisi.md
---

## Brief (AGENT-BRIEF)
**Obiettivo.** Riutilizzare un piano collaudato senza ricostruirlo ogni volta.

**Comportamento richiesto.**
- Ogni organizzatore vede tutti i template dell'istanza.
- Ogni organizzatore può creare, modificare ed eliminare qualsiasi template.
- Il template registra creatore, ultimo editor, data di creazione e di modifica.
- Applicare un template a un nuovo torneo copia il piano.
- Una modifica successiva al template non cambia i tornei già creati.
- La cancellazione è definitiva.

**Fuori scope.** Permessi per template, versioning, condivisione esterna.

## Acceptance criteria
- [ ] Un template creato da un organizzatore è visibile a tutti gli altri.
- [ ] Ogni organizzatore può modificare ed eliminare un template.
- [ ] `updated_by` riflette l'ultimo editor.
- [ ] Applicare un template crea un nuovo torneo con il piano copiato.
- [ ] Modificare il template non cambia il torneo già creato.

## Choices

Nessuna scelta registrata.
