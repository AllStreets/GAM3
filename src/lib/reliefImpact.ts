/**
 * reliefImpact.ts
 *
 * Returns a deterministic, respectful, concrete one-line acknowledgment of the
 * real-world support value the satellite data delivered to relief responders.
 *
 * Rules:
 *   - Pure and deterministic (same inputs → same output, always).
 *   - No React, Three, Math.random, or Date.now.
 *   - No casualty numbers. Never gamifies the disaster.
 *   - Keyed on lowercased `kind`; falls back to a safe default.
 */

const KIND_LINES: Array<[RegExp, string]> = [
  [
    /quake|seismic/,
    'Imagery relayed to relief teams · affected zones mapped for responders',
  ],
  [
    /flood/,
    'Water-extent data shared with response teams · inundation boundaries charted',
  ],
  [
    /storm|cyclone|typhoon|hurricane/,
    'Track data relayed to shelter coordinators · path refined for responders',
  ],
  [
    /fire|wildfire/,
    'Thermal mapping shared with fire crews · hot-spots flagged for ground teams',
  ],
]

const DEFAULT_LINE = 'Data relayed to response teams · situational picture improved'

/**
 * Returns a respectful, concrete impact line for a completed RELIEF contract.
 *
 * @param kind  - the contract's kind string (e.g. "earthquake", "wildfire")
 * @param title - the contract's display title (unused in current mapping but
 *                kept for future keyword disambiguation)
 */
export function reliefImpactLine(kind: string, _title: string): string {
  const lower = kind.toLowerCase()
  for (const [pattern, line] of KIND_LINES) {
    if (pattern.test(lower)) return line
  }
  return DEFAULT_LINE
}
