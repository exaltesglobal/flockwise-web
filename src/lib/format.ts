import type { Currency } from '@/api/types';

export function formatMoney(minor: number, currency: Currency, locale = 'en-IN') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}

/** Short form for charts and KPI tiles: ₹4.2L, ₹1.3Cr in India, $12.5K elsewhere. */
export function formatMoneyShort(minor: number, currency: Currency) {
  const major = minor / 100;
  const symbol = new Intl.NumberFormat('en-IN', { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '';
  if (currency === 'INR') {
    if (major >= 1e7) return `${symbol}${trim(major / 1e7)}Cr`;
    if (major >= 1e5) return `${symbol}${trim(major / 1e5)}L`;
  }
  if (major >= 1e6) return `${symbol}${trim(major / 1e6)}M`;
  if (major >= 1e3) return `${symbol}${trim(major / 1e3)}K`;
  return `${symbol}${Math.round(major)}`;
}
const trim = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ''));

export const formatNumber = (n: number, locale = 'en-IN') => new Intl.NumberFormat(locale).format(n);

export function formatDay(iso: string, locale = 'en-IN') {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDate(iso: string, locale = 'en-IN') {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(iso: string, locale = 'en-IN') {
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

export function formatRelative(iso: string, locale = 'en-IN') {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDate(iso, locale);
}

export function greetingKey(date = new Date()): 'goodMorning' | 'goodAfternoon' | 'goodEvening' {
  const h = date.getHours();
  return h < 12 ? 'goodMorning' : h < 17 ? 'goodAfternoon' : 'goodEvening';
}

/** For <input type="datetime-local"> which wants local time without a zone. */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
