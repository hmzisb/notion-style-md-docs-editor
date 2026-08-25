/**
 * "2 min ago" / "in 30 sec", in the reader's locale and without an i18n dependency (D-07).
 * Shared by the palette's Recent group (docs/06 section 8) and the save status (section 9).
 */
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' });

const STEPS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

export function relativeTime(at: number, now: number = Date.now()): string {
  const elapsed = at - now;
  for (const [unit, ms] of STEPS) {
    if (Math.abs(elapsed) >= ms) return RELATIVE.format(Math.round(elapsed / ms), unit);
  }
  return RELATIVE.format(0, 'minute');
}
