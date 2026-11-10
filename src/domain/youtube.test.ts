import { describe, expect, it } from 'vitest'

import { parseYouTubeVideoId, youTubeEmbedUrl } from './youtube'

describe('parseYouTubeVideoId', () => {
  it('riconosce le forme di URL YouTube comuni', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=10')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('rifiuta URL non YouTube o non validi', () => {
    expect(parseYouTubeVideoId('https://vimeo.com/123456')).toBeNull()
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull()
    expect(parseYouTubeVideoId('non-un-url')).toBeNull()
    expect(parseYouTubeVideoId('')).toBeNull()
    expect(parseYouTubeVideoId('ftp://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })
})

describe('youTubeEmbedUrl', () => {
  it('usa il dominio senza cookie', () => {
    expect(youTubeEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    )
  })
})
