import type { PhaseStatus } from '@/domain/phases'
import type { TournamentStatus } from '@/stores/tournaments'

const TOURNAMENT_STATUS_CLASS: Record<TournamentStatus, string> = {
  draft: 'border-border bg-muted text-muted-foreground',
  published:
    'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
  running:
    'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  concluded:
    'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200',
  archived: 'border-border bg-muted text-muted-foreground',
}

const PHASE_STATUS_CLASS: Record<PhaseStatus, string> = {
  pending: 'border-border bg-muted text-muted-foreground',
  open: 'border-primary/30 bg-primary/10 text-primary',
  awaiting_resolution:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  closed:
    'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  cancelled: 'border-border bg-muted text-muted-foreground opacity-70',
}

export function tournamentStatusClass(status: TournamentStatus): string {
  return TOURNAMENT_STATUS_CLASS[status]
}

export function phaseStatusClass(status: PhaseStatus): string {
  return PHASE_STATUS_CLASS[status]
}
