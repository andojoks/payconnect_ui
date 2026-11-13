export function formatMoney(amount?: number, currency = 'XAF') {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '—';
  const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
  return `${value} ${currency}`;
}

export function formatDate(value?: string, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

export function formatShortDate(value?: string) {
  return formatDate(value, { year: undefined });
}

export function relativeTime(value?: string) {
  if (!value) return 'never';
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return 'never';
  const delta = Math.round((date - Date.now()) / 1000);
  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, seconds] of ranges) {
    if (Math.abs(delta) >= seconds || unit === 'second') {
      return formatter.format(Math.round(delta / seconds), unit);
    }
  }
  return 'just now';
}

export function initials(value: string) {
  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function providerLabel(provider: string) {
  return provider === 'mtn_momo' ? 'MTN MoMo' : provider.replaceAll('_', ' ');
}

export function statusTone(status: string) {
  switch (status) {
    case 'active':
    case 'delivered':
    case 'matched':
    case 'idle':
    case 'success':
      return 'ok';
    case 'running':
    case 'pending':
    case 'retrying':
    case 'draft':
      return 'warn';
    case 'error':
    case 'failed':
    case 'reauthentication_required':
    case 'cancelled':
    case 'expired':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function phoneTail(phone: string) {
  return phone.length > 6 ? `…${phone.slice(-6)}` : phone;
}
