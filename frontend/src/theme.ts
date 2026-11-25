export type Theme = 'light' | 'dark'

const KEY = 'robin.theme'
const DEFAULT: Theme = 'light'

/** The viewer's choice, or light when they have not made one. The OS preference is not consulted. */
export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' ? 'dark' : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute('data-theme', t)
}

export function setTheme(t: Theme): void {
  try {
    if (t === DEFAULT) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
  } catch {
    /* storage unavailable */
  }
  applyTheme(t)
}

/** The theme actually showing right now. */
export function effectiveTheme(t: Theme = getTheme()): Theme {
  return t
}
