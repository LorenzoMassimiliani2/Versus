export const strings = {
  appName: 'Versus',
  login: {
    title: 'Accedi',
    subtitle: 'Inserisci le credenziali assegnate dall\'amministratore.',
    username: 'Username',
    password: 'Password',
    submit: 'Accedi',
    submitting: 'Accesso in corso…',
  },
  adminUsers: {
    title: 'Gestione utenti',
    subtitle: 'Crea utenze, gestisci accessi e ruoli amministratore.',
    back: 'Torna alla home',
    searchLabel: 'Cerca per username',
    searchPlaceholder: 'es. mario',
    search: 'Cerca',
    createTitle: 'Nuovo utente',
    username: 'Username',
    password: 'Password iniziale',
    create: 'Crea utente',
    creating: 'Creazione…',
    initialPasswordTitle: (username: string) => `Password iniziale di ${username}`,
    initialPasswordHint: 'Copiala ora: non sarà più visualizzabile.',
    dismiss: 'Ho copiato la password',
    empty: 'Nessun utente trovato.',
    loading: 'Caricamento…',
    inactive: 'Disattivato',
    admin: 'Admin',
    you: 'tu',
    deactivate: 'Disattiva',
    reactivate: 'Riattiva',
    resetPassword: 'Reset password',
    newPassword: 'Nuova password',
    savePassword: 'Imposta password',
    resetDone: 'Password aggiornata. Tutte le sessioni dell\'utente sono state revocate.',
    cancel: 'Annulla',
    promote: 'Promuovi ad admin',
    demote: 'Revoca admin',
  },
  tournaments: {
    title: 'Tornei',
    subtitle: 'I tornei che organizzi e quelli a cui partecipi.',
    tabParticipating: 'Partecipo',
    tabOrganizing: 'Organizzo',
    tabUsers: 'Utenti',
    logout: 'Esci',
    createTitle: 'Nuovo torneo',
    name: 'Nome',
    namePlaceholder: 'es. Torneo di primavera',
    description: 'Descrizione',
    coverUrl: 'URL copertina',
    optional: 'facoltativo',
    create: 'Crea torneo',
    creating: 'Creazione…',
    loading: 'Caricamento…',
    emptyParticipating: 'Nessun torneo a cui partecipi.',
    emptyOrganizing: 'Non stai organizzando nessun torneo.',
    open: 'Apri',
    status: {
      draft: 'Bozza',
      published: 'Pubblicato',
      running: 'In corso',
      concluded: 'Concluso',
      archived: 'Archiviato',
    },
    role: {
      owner: 'Owner',
      co_organizer: 'Co-organizzatore',
      participant: 'Partecipante',
    },
  },
  tournamentDetail: {
    back: 'Torna ai tornei',
    draftNotice: 'Questo torneo è in bozza: è visibile solo agli organizzatori.',
    slug: 'Slug',
    status: 'Stato',
    description: 'Descrizione',
    cover: 'Copertina',
    noDescription: 'Nessuna descrizione.',
    organizers: 'Organizzatori',
    editTitle: 'Dettagli del torneo',
    name: 'Nome',
    coverUrl: 'URL copertina',
    save: 'Salva modifiche',
    saving: 'Salvataggio…',
    saved: 'Modifiche salvate.',
    settingsTitle: 'Impostazioni del torneo',
    selfVoteAllowed: 'Consenti il voto sul proprio elemento',
    autoAdvance: 'Avanzamento automatico alla chiusura della fase',
  },
  participants: {
    title: 'Partecipanti',
    subtitle: 'Fino a 20 partecipanti attivi. La lista si gestisce mentre il torneo è in bozza.',
    count: (active: number, maximum: number) => `${active}/${maximum} partecipanti attivi`,
    empty: 'Nessun partecipante.',
    addLabel: 'Aggiungi partecipante',
    add: 'Aggiungi',
    adding: 'Aggiunta…',
    remove: 'Rimuovi',
    select: 'Seleziona un utente',
    noCandidates: 'Tutti gli utenti attivi partecipano già.',
    limit: 'Limite di 20 partecipanti attivi raggiunto.',
    locked: 'I partecipanti si possono aggiungere o rimuovere solo mentre il torneo è in bozza.',
    status: {
      active: 'Attivo',
      removed: 'Rimosso',
    },
  },
  organizers: {
    title: 'Organizzatori',
    subtitle: 'Il proprietario del torneo nomina e revoca i co-organizzatori.',
    nominateLabel: 'Nomina co-organizzatore',
    nominate: 'Nomina',
    nominating: 'Nomina…',
    revoke: 'Revoca',
    select: 'Seleziona un utente',
    noCandidates: 'Nessun utente da nominare.',
  },
  elements: {
    title: 'Elementi',
    subtitle: 'Cosa si vota: nome, immagine obbligatoria e video opzionale.',
    addTitle: 'Nuovo elemento',
    editTitle: 'Modifica elemento',
    empty: 'Nessun elemento ancora. Aggiungi il primo.',
    name: 'Nome',
    namePlaceholder: 'es. La canzone di Mario',
    description: 'Descrizione',
    imageUrl: 'URL immagine',
    videoUrl: 'URL video YouTube',
    videoHint: 'Il video si carica solo quando lo apri.',
    customValues: 'Valori dei campi',
    userId: 'Utente collegato',
    userIdHint: 'Facoltativo: serve al controllo dell\'auto-voto.',
    create: 'Aggiungi elemento',
    update: 'Salva elemento',
    cancel: 'Annulla modifica',
    edit: 'Modifica',
    delete: 'Elimina',
    moveUp: 'Sposta su',
    moveDown: 'Sposta giù',
    playVideo: 'Riproduci video',
    videoTitle: 'Video dell\'elemento',
  },
  phases: {
    title: 'Piano di fasi',
    subtitle: 'La sequenza delle fasi del torneo. Le fasi non ancora avviate si modificano e si riordinano.',
    empty: 'Nessuna fase ancora. Aggiungi la prima.',
    locked: 'Le fasi si modificano e si riordinano solo prima dell avvio, mentre il torneo è in bozza.',
    addTitle: 'Nuova fase',
    editTitle: 'Modifica fase',
    name: 'Nome',
    namePlaceholder: 'es. Gironi',
    formula: 'Formula',
    voteType: 'Scheda',
    advance: 'Avanzamento',
    advanceCount: 'Quanti passano',
    deadline: 'Scadenza',
    secrecy: 'Segretezza',
    votingMode: 'Modalità di voto',
    creditsPerVoter: 'Crediti per votante',
    maxPerMatch: 'Massimo per sfida',
    optional: 'facoltativo',
    create: 'Aggiungi fase',
    update: 'Salva fase',
    cancel: 'Annulla modifica',
    edit: 'Modifica',
    delete: 'Elimina',
    moveUp: 'Sposta su',
    moveDown: 'Sposta giù',
    previewTitle: 'Anteprima struttura',
    previewEmpty: 'L anteprima appare quando aggiungi almeno una fase.',
    formulaLabels: {
      group: 'Gironi',
      elimination: 'Eliminazione diretta',
      ranking: 'Classifica',
    },
    voteTypeLabels: {
      duel: 'Duello',
      ranking: 'Classifica',
      pick: 'Pick',
    },
    advanceLabels: {
      all: 'Tutti gli elementi',
      winners: 'Tutti i vincitori',
      top_global: 'I migliori N globali',
      top_per_group: 'I migliori N per girone',
      winner: 'Il vincitore',
    },
    statusLabels: {
      pending: 'In attesa',
      open: 'Aperta',
      awaiting_resolution: 'Da risolvere',
      closed: 'Chiusa',
      cancelled: 'Annullata',
    },
    secrecyLabels: {
      live: 'Dal vivo',
      blind: 'Cieca fino alla chiusura',
      secret: 'Segreta',
    },
    votingModeLabels: {
      simultaneous: 'Simultanea',
      sequential: 'Sequenziale',
    },
  },
  fields: {
    title: 'Campi personalizzati',
    subtitle: 'Fino a 10 campi per torneo. La chiave identifica il valore, l\'etichetta è ciò che vedono gli utenti.',
    empty: 'Nessun campo definito.',
    limit: 'Hai raggiunto il limite di 10 campi personalizzati.',
    key: 'Chiave',
    keyPlaceholder: 'es. genere',
    label: 'Etichetta',
    labelPlaceholder: 'es. Genere',
    type: 'Tipo',
    add: 'Aggiungi campo',
    adding: 'Aggiunta…',
    delete: 'Elimina campo',
    types: {
      text: 'Testo',
      number: 'Numero',
      url: 'URL',
      date: 'Data',
    },
  },
  errors: {
    invalid_credentials: 'Username o password non validi.',
    invalid_values: 'I valori dei campi non rispettano il tipo dichiarato.',
    unknown_field: 'Un valore usa un campo che non esiste nel torneo.',
    field_limit_reached: 'Hai raggiunto il limite di 10 campi personalizzati.',
    duplicate_field_key: 'Esiste già un campo con questa chiave.',
    element_not_found: 'Elemento o campo non trovato.',
    account_disabled: 'Account disattivato. Contatta un amministratore.',
    rate_limited: 'Troppi tentativi di accesso. Riprova tra 15 minuti.',
    invalid_request: 'Inserisci username e password validi.',
    invalid_fields: 'Controlla i dati inseriti.',
    forbidden: 'Non hai i permessi per questa operazione.',
    user_limit_reached: 'Limite di 20 utenti attivi raggiunto.',
    username_taken: 'Username già in uso.',
    not_found: 'Utente non trovato.',
    tournament_not_found: 'Torneo non trovato.',
    participant_limit_reached: 'Limite di 20 partecipanti attivi raggiunto.',
    tournament_not_editable: 'Il torneo non è più in bozza: questa modifica non è più possibile.',
    phase_not_editable: 'La fase è già avviata e non può essere modificata.',
    invalid_phase: 'Formula, scheda o avanzamento non sono compatibili.',
    phase_not_found: 'Fase o torneo non trovato.',
    already_organizer: 'L utente è già organizzatore del torneo.',
    cannot_remove_owner: 'L owner non può essere revocato.',
    network: 'Impossibile contattare il server. Riprova.',
    unknown: 'Errore imprevisto. Riprova.',
  },
} as const

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: strings.errors.invalid_credentials,
  account_disabled: strings.errors.account_disabled,
  rate_limited: strings.errors.rate_limited,
  invalid_request: strings.errors.invalid_request,
}

const TOURNAMENT_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: strings.errors.invalid_fields,
  forbidden: strings.errors.forbidden,
  not_found: strings.errors.tournament_not_found,
}

export function tournamentErrorMessage(code: string | undefined): string {
  return (code && TOURNAMENT_ERROR_MESSAGES[code]) || strings.errors.unknown
}

export function tournamentStatusLabel(status: string): string {
  return (
    strings.tournaments.status[status as keyof typeof strings.tournaments.status] ??
    status
  )
}

export function tournamentRoleLabel(role: string): string {
  return (
    strings.tournaments.role[role as keyof typeof strings.tournaments.role] ?? role
  )
}

const ADMIN_USERS_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: strings.errors.invalid_fields,
  forbidden: strings.errors.forbidden,
  user_limit_reached: strings.errors.user_limit_reached,
  username_taken: strings.errors.username_taken,
  not_found: strings.errors.not_found,
}

export function authErrorMessage(code: string | undefined): string {
  return (code && ERROR_MESSAGES[code]) || strings.errors.unknown
}

export function adminUsersErrorMessage(code: string | undefined): string {
  return (code && ADMIN_USERS_ERROR_MESSAGES[code]) || strings.errors.unknown
}

const ELEMENT_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: strings.errors.invalid_fields,
  invalid_values: strings.errors.invalid_values,
  unknown_field: strings.errors.unknown_field,
  field_limit_reached: strings.errors.field_limit_reached,
  duplicate_field_key: strings.errors.duplicate_field_key,
  forbidden: strings.errors.forbidden,
  not_found: strings.errors.element_not_found,
}

const PARTICIPANTS_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: strings.errors.invalid_fields,
  forbidden: strings.errors.forbidden,
  not_found: strings.errors.tournament_not_found,
  participant_limit_reached: strings.errors.participant_limit_reached,
  tournament_not_editable: strings.errors.tournament_not_editable,
  already_organizer: strings.errors.already_organizer,
  cannot_remove_owner: strings.errors.cannot_remove_owner,
}

export function participantsErrorMessage(code: string | undefined): string {
  return (code && PARTICIPANTS_ERROR_MESSAGES[code]) || strings.errors.unknown
}

export function elementsErrorMessage(code: string | undefined): string {
  return (code && ELEMENT_ERROR_MESSAGES[code]) || strings.errors.unknown
}

const PHASES_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: strings.errors.invalid_fields,
  invalid_phase: strings.errors.invalid_phase,
  forbidden: strings.errors.forbidden,
  not_found: strings.errors.phase_not_found,
  phase_not_editable: strings.errors.phase_not_editable,
  tournament_not_editable: strings.errors.tournament_not_editable,
}

export function phasesErrorMessage(code: string | undefined): string {
  return (code && PHASES_ERROR_MESSAGES[code]) || strings.errors.unknown
}
