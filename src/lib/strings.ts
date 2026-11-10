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
  home: {
    title: 'Versus',
    signedInAs: (username: string) => `Hai effettuato l'accesso come ${username}.`,
    logout: 'Esci',
    adminUsers: 'Gestione utenti',
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
  errors: {
    invalid_credentials: 'Username o password non validi.',
    account_disabled: 'Account disattivato. Contatta un amministratore.',
    rate_limited: 'Troppi tentativi di accesso. Riprova tra 15 minuti.',
    invalid_request: 'Inserisci username e password validi.',
    invalid_fields: 'Controlla i dati inseriti.',
    forbidden: 'Non hai i permessi per questa operazione.',
    user_limit_reached: 'Limite di 20 utenti attivi raggiunto.',
    username_taken: 'Username già in uso.',
    not_found: 'Utente non trovato.',
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
