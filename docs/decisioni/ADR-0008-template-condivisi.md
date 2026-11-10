---
id: ADR-0008
title: Template condivisi e modificabili
status: accepted
date: 2026-11-10
---

# Template condivisi e modificabili

## Contesto

La specifica iniziale prevedeva template personali. Il progetto è pensato per un gruppo chiuso di amici, con pochi organizzatori che si scambiano formati di torneo. Un template contiene solo la sequenza e la configurazione delle fasi: non contiene elementi, partecipanti né dati personali. La condivisione quindi non espone informazioni sensibili.

## Decisione

- Ogni organizzatore vede tutti i template dell'istanza.
- Ogni organizzatore può creare, modificare ed eliminare qualsiasi template.
- `templates` registra `created_by`, `updated_by`, `created_at` e `updated_at`.
- Applicare un template a un nuovo torneo copia il piano. Una modifica successiva al template non cambia i tornei già creati.
- Non esiste un modello di permessi per template: la fiducia nel gruppo chiuso è sufficiente.

## Conseguenze

- Si evitano duplicazioni e formati divergenti tra organizzatori.
- Un organizzatore può sovrascrivere o eliminare il template di un altro: è accettato, ma `updated_by` rende tracciabile l'ultima modifica.
- La cancellazione è definitiva; non serve un cestino in v1.
- Se in futuro la condivisione diventa un problema, si potrà introdurre la proprietà del template senza cambiare il formato del piano.
