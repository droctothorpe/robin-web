const BODY = '#7a6657'
const DARK = '#5a4a3e'
const ORANGE = '#f0862b'
const BEAK = '#f2b335'
const EYE = '#1d1f23'
const CREAM = '#f3e7d3'


/** Robin: a fat round bird with an orange belly, facing you. */
export default function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="4 8 56 52" aria-hidden="true">
      <defs>
        <clipPath id="robin-body">
          <circle cx="32" cy="34" r="23" />
        </clipPath>
      </defs>
      <circle cx="32" cy="34" r="23" fill={BODY} />
      <ellipse cx="32" cy="45" rx="15" ry="13" fill={ORANGE} clipPath="url(#robin-body)" />
      <path d="M11 30 Q5 42 14 52 Q19 44 21 36z" fill={DARK} />
      <path d="M53 30 Q59 42 50 52 Q45 44 43 36z" fill={DARK} />
      <circle cx="22" cy="26" r="4" fill={CREAM} />
      <circle cx="42" cy="26" r="4" fill={CREAM} />
      <circle cx="22" cy="26" r="2.6" fill={EYE} />
      <circle cx="42" cy="26" r="2.6" fill={EYE} />
      <polygon points="32,29 36,32 32,37 28,32" fill={BEAK} />
    </svg>
  )
}
