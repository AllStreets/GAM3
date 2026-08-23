export const COLORWAYS = ['#45d8ff', '#ff5c49', '#ffa14a', '#9a7bff', '#4ade80', '#e6edf3']

export const EMBLEMS: { id: string; label: string }[] = [
  { id: 'crest-rings', label: 'Orbit' },
  { id: 'crest-eye', label: 'Watch' },
  { id: 'crest-delta', label: 'Vector' },
  { id: 'crest-star', label: 'Polaris' },
  { id: 'crest-shield', label: 'Aegis' },
  { id: 'crest-compass', label: 'Azimuth' },
]

/** Procedural SVG crest. Stroke uses the agency colorway; fill stays dark. */
export function Emblem({ id, color, size = 64 }: { id: string; color: string; size?: number }) {
  const common = { fill: 'none', stroke: color, strokeWidth: 3, strokeLinecap: 'round' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={id}>
      <circle cx="50" cy="50" r="46" fill="#030509" stroke={color} strokeWidth="1.5" opacity="0.9" />
      {id === 'crest-rings' && (
        <g {...common}>
          <ellipse cx="50" cy="50" rx="34" ry="14" />
          <ellipse cx="50" cy="50" rx="34" ry="14" transform="rotate(60 50 50)" />
          <ellipse cx="50" cy="50" rx="34" ry="14" transform="rotate(120 50 50)" />
          <circle cx="50" cy="50" r="5" fill={color} />
        </g>
      )}
      {id === 'crest-eye' && (
        <g {...common}>
          <path d="M18 50 Q50 24 82 50 Q50 76 18 50 Z" />
          <circle cx="50" cy="50" r="10" />
          <circle cx="50" cy="50" r="3" fill={color} />
        </g>
      )}
      {id === 'crest-delta' && (
        <g {...common}>
          <path d="M50 20 L78 74 L50 62 L22 74 Z" />
          <line x1="50" y1="20" x2="50" y2="62" />
        </g>
      )}
      {id === 'crest-star' && (
        <g {...common}>
          <path d="M50 18 L58 44 L84 44 L62 60 L70 84 L50 68 L30 84 L38 60 L16 44 L42 44 Z" />
        </g>
      )}
      {id === 'crest-shield' && (
        <g {...common}>
          <path d="M50 20 L78 30 V54 Q78 74 50 82 Q22 74 22 54 V30 Z" />
          <line x1="50" y1="30" x2="50" y2="72" />
          <line x1="32" y1="46" x2="68" y2="46" />
        </g>
      )}
      {id === 'crest-compass' && (
        <g {...common}>
          <circle cx="50" cy="50" r="30" />
          <path d="M50 24 L58 50 L50 76 L42 50 Z" fill={color} />
          <circle cx="50" cy="50" r="4" fill="#030509" />
        </g>
      )}
    </svg>
  )
}
