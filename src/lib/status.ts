import type { PhaseStatus } from '@/domain/phases'
import type { TournamentStatus } from '@/stores/tournaments'

const TOURNAMENT_STATUS_CLASS: Record<TournamentStatus, string> = {
  draft: 'border-border bg-muted text-muted-foreground',
  published: 'border-sky-200 bg-sky-50 text-sky-900',
  running: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  concluded: 'border-violet-200 bg-violet-50 text-violet-900',
  archived: 'border-border bg-muted text-muted-foreground',
}

const PHASE_STATUS_CLASS: Record<PhaseStatus, string> = {
  pending: 'border-border bg-muted text-muted-foreground',
  open: 'border-primary/30 bg-primary/10 text-primary',
  awaiting_resolution: 'border-amber-200 bg-amber-50 text-amber-900',
  closed: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  cancelled: 'border-border bg-muted text-muted-foreground opacity-70',
}

export function tournamentStatusClass(status: TournamentStatus): string {
  return TOURNAMENT_STATUS_CLASS[status]
}

export function phaseStatusClass(status: PhaseStatus): string {
  return PHASE_STATUS_CLASS[status]
}
