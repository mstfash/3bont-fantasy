import { redirect, notFound } from 'next/navigation';
import {
  AccessDenied,
  loadStaffContext,
  requireCapability,
  type Capability,
} from '@fantasy/application';
import type { Locale } from '@/lib/brand';
import { requireSession } from './session';
import { getRuntime } from './runtime';

export async function requireStaffSession(locale: Locale, recent = false) {
  const session = await requireSession(locale);
  const context = await loadStaffContext(getRuntime().db, session);
  if (context.grants.length === 0) notFound();
  const age = context.principal.mfaVerifiedAt
    ? Date.now() - context.principal.mfaVerifiedAt.getTime()
    : Infinity;
  const passwordAge = Date.now() - context.principal.authenticatedAt.getTime();
  if (
    age < 0 ||
    age > (recent ? 15 * 60_000 : 8 * 60 * 60_000) ||
    (recent && (passwordAge < 0 || passwordAge > 15 * 60_000))
  )
    redirect(`/${locale}/security`);
  return context;
}

export async function requireStaff(
  locale: Locale,
  capability: Capability,
  competitionId: string | null,
  recent = false,
) {
  const context = await requireStaffSession(locale, recent);
  try {
    requireCapability(
      context.principal,
      context.grants,
      capability,
      competitionId,
      new Date(),
      recent,
    );
  } catch (error) {
    if (error instanceof AccessDenied) notFound();
    throw error;
  }
  return context;
}
