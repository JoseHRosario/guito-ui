/** Expense occurrence wall clock is always Europe/Lisbon, never the browser zone. */
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function lisbonFields(instant: Date): { date: string; time: string } {
  const parts = Object.fromEntries(clock.formatToParts(instant).map(part => [part.type, part.value]));
  return { date: `${parts['year']}-${parts['month']}-${parts['day']}`, time: `${parts['hour']}:${parts['minute']}` };
}

function offsetMinutes(instant: Date): number {
  const parts = Object.fromEntries(clock.formatToParts(instant).map(part => [part.type, part.value]));
  const wall = Date.parse(`${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}:${parts['second']}Z`);
  return Math.round((wall - instant.getTime()) / 60000);
}

function offsetText(minutes: number): string {
  const absolute = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

/** Captures one known instant, preserving seconds while editing exposes minute precision. */
export function lisbonNow(instant = new Date()): { date: string; time: string; occurredAt: string } {
  const { date, time } = lisbonFields(instant);
  const seconds = String(instant.getUTCSeconds()).padStart(2, '0');
  return { date, time, occurredAt: `${date}T${time}:${seconds}${offsetText(offsetMinutes(instant))}` };
}

export function knownOccurrence(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const wall = `${value.slice(0, 19)}Z`;
  const parsedWall = Date.parse(wall);
  if (!Number.isFinite(parsedWall) || new Date(parsedWall).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/** Reject gaps and folds unless a supplied known instant disambiguates the unchanged fields. */
export function resolveOccurrence(date: string, time: string, known: string | null): { occurredAt: string | null; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { occurredAt: null, error: 'Enter a valid time' };
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== `${date}T${time}`) return { occurredAt: null, error: 'Enter a valid date and time' };
  if (knownOccurrence(known)) {
    const fields = lisbonFields(new Date(known!));
    if (fields.date === date && fields.time === time) return { occurredAt: known, error: '' };
  }
  const offsets = new Set<number>();
  for (let hour = -36; hour <= 36; hour += 6) offsets.add(offsetMinutes(new Date(wall + hour * 3600000)));
  const candidates = [...offsets].filter(offset => {
    const fields = lisbonFields(new Date(wall - offset * 60000));
    return fields.date === date && fields.time === time;
  });
  if (candidates.length === 0) return { occurredAt: null, error: 'This time does not exist in Lisbon — choose another time' };
  if (candidates.length !== 1) return { occurredAt: null, error: 'This time occurs twice in Lisbon — choose an unambiguous time' };
  return { occurredAt: `${date}T${time}:00${offsetText(candidates[0])}`, error: '' };
}

/** Legacy date-only/unzoned values retain their expense day until the API cutover. */
export function occurrenceDay(value: string): string {
  const known = knownOccurrence(value);
  return known ? lisbonFields(new Date(known)).date : value.slice(0, 10);
}
