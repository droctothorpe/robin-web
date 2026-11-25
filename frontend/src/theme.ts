export type Theme = 'light' | 'dark' | 'system'

const KEY = 'robin.theme'

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
}

export function setTheme(t: Theme): void {
  try {
    if (t === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
  } catch {
    /* storage unavailable */
  }
  applyTheme(t)
}

/** The theme actually showing right now, resolving "system" to what the OS says. */
export function effectiveTheme(t: Theme = getTheme()): 'light' | 'dark' {
  if (t !== 'system') return t
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
