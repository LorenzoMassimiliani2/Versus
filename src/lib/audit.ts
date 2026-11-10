import { strings } from './strings'

type AuditValues = Record<string, unknown>

function isRecord(value: unknown): value is AuditValues {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function truncate(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'string') return value ? truncate(value) : '""'
  if (typeof value === 'object') return truncate(JSON.stringify(value))
  return String(value)
}

function fieldLabel(key: string): string {
  return strings.audit.fields[key as keyof typeof strings.audit.fields] ?? key
}

export function auditActionLabel(action: string): string {
  return strings.audit.actions[action as keyof typeof strings.audit.actions] ?? action
}

export function auditTargetLabel(targetType: string): string {
  return strings.audit.targets[targetType as keyof typeof strings.audit.targets] ?? targetType
}

/** Diff sintetico per la lista: solo le chiavi cambiate, con prima e dopo. */
export function summariseAuditDiff(before: unknown, after: unknown): string {
  if (before === null && after === null) return strings.audit.noChanges

  if (before === null || before === undefined) {
    if (!isRecord(after)) return strings.audit.created
    return Object.entries(after)
      .map(([key, value]) => `${fieldLabel(key)}: ${formatValue(value)}`)
      .join(', ')
  }

  if (after === null || after === undefined) {
    if (!isRecord(before)) return strings.audit.deleted
    return Object.entries(before)
      .map(([key, value]) => `${fieldLabel(key)}: ${formatValue(value)}`)
      .join(', ')
  }

  if (!isRecord(before) || !isRecord(after)) {
    return `${formatValue(before)} → ${formatValue(after)}`
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changes = [...keys]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => `${fieldLabel(key)}: ${formatValue(before[key])} → ${formatValue(after[key])}`)
  return changes.length > 0 ? changes.join(', ') : strings.audit.noChanges
}
