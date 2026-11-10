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
  },
  errors: {
    invalid_credentials: 'Username o password non validi.',
    account_disabled: 'Account disattivato. Contatta un amministratore.',
    rate_limited: 'Troppi tentativi di accesso. Riprova tra 15 minuti.',
    invalid_request: 'Inserisci username e password validi.',
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

export function authErrorMessage(code: string | undefined): string {
  return (code && ERROR_MESSAGES[code]) || strings.errors.unknown
}
