type P = { size?: number; className?: string }

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** Three connected nodes: the conventional "share" glyph. */
export function ShareIcon({ size = 18, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="18" cy="5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <path d="M8.3 10.7l7.4-4.3M8.3 13.3l7.4 4.3" />
    </svg>
  )
}

export function UserIcon({ size = 18, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c1.4-3.6 4.3-5.5 8-5.5s6.6 1.9 8 5.5" />
    </svg>
  )
}

export function SunIcon({ size = 18, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

export function MoonIcon({ size = 18, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  )
}

export function GripIcon({ size = 16, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

export function CloseIcon({ size = 16, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function ChevronIcon({ size = 16, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function CheckIcon({ size = 16, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.2}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  )
}

export function TrashIcon({ size = 18, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.2A1.5 1.5 0 0 0 8.8 20.6h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 11v6M14 11v6" />
    </svg>
  )
}

