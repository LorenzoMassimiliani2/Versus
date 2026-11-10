const SLUG_MAX_LENGTH = 60
export const FALLBACK_SLUG = 'torneo'

/** Converte un nome in uno slug stabile: minuscolo ASCII, parole separate da trattini. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '')

  return slug || FALLBACK_SLUG
}
