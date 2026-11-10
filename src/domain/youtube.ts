const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

/**
 * Estrae l'id di un video YouTube da un URL pubblico. Restituisce `null` per
 * URL non YouTube o per id non riconoscibili. Nessuna richiesta di rete.
 */
export function parseYouTubeVideoId(value: string): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  let candidate: string | null = null

  if (host === 'youtu.be') {
    candidate = url.pathname.slice(1).split('/')[0] ?? null
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      candidate = url.searchParams.get('v')
    } else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)
      candidate = match?.[1] ?? null
    }
  }

  if (!candidate || !VIDEO_ID_PATTERN.test(candidate)) return null
  return candidate
}

/** URL di incorporamento senza cookie, usato dalla UI solo dopo un tap. */
export function youTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}
