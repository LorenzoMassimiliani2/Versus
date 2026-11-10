import { readonly, ref } from 'vue'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'versus-theme'
const theme = ref<Theme>('light')
let initialized = false

function updateThemeColor(value: Theme): void {
  if (typeof document === 'undefined') return
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', value === 'dark' ? '#0a0a0a' : '#ffffff')
}

function applyTheme(value: Theme): void {
  theme.value = value
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', value === 'dark')
  updateThemeColor(value)
}

export function initTheme(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved)
    return
  }
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  applyTheme(prefersDark ? 'dark' : 'light')
}

export function setTheme(value: Theme): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, value)
  applyTheme(value)
}

export function toggleTheme(): void {
  setTheme(theme.value === 'dark' ? 'light' : 'dark')
}

export function useTheme() {
  return {
    theme: readonly(theme),
    setTheme,
    toggleTheme,
  }
}
