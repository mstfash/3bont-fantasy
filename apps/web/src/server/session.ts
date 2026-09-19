import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getRuntime } from './runtime';
import type { Locale } from '@/lib/brand';

export async function currentSession() {
  const { auth, db } = getRuntime();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !session.user.emailVerified) return null;
  const account = await db
    .selectFrom('accounts')
    .selectAll()
    .where('id', '=', session.user.id)
    .executeTakeFirst();
  if (
    !account ||
    account.closed_at !== null ||
    (account.suspended_until && account.suspended_until > new Date())
  )
    return null;
  return session;
}

export async function requireSession(locale: Locale) {
  const session = await currentSession();
  if (!session) redirect(`/${locale}/login`);
  return session;
}
