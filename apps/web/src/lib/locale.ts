import { notFound } from 'next/navigation';
import type { Locale } from './brand';

export function requireLocale(value: string): Locale {
  if (value !== 'ar' && value !== 'en') notFound();
  return value;
}

export function deadlineLabel(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
