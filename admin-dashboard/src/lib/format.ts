export const AMSTERDAM_TIME_ZONE = 'Europe/Amsterdam';

export const euro = (value: number | null | undefined) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value ?? 0);

export function dateKeyInTimeZone(value: Date, timeZone = AMSTERDAM_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function startOfDayInTimeZone(value: Date, timeZone = AMSTERDAM_TIME_ZONE) {
  const [year, month, day] = dateKeyInTimeZone(value, timeZone).split('-').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day);
  let result = targetUtc;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = formatter.formatToParts(new Date(result));
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
    const localAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    result += targetUtc - localAsUtc;
  }

  return new Date(result);
}

export const dateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: AMSTERDAM_TIME_ZONE,
  }).format(new Date(value));
};

export const shortId = (value: string) => value.replaceAll('-', '').slice(0, 8).toUpperCase();