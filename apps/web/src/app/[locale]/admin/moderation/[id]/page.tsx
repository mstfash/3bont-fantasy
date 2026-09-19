import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readChatModeration } from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { ChatModerationPanel } from '@/components/chat/moderation-panel';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function StaffGroupModeration({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params,
    locale = requireLocale(p.locale),
    db = getRuntime().db;
  if (!idSchema.safeParse(p.id).success) notFound();
  const group = await db
    .selectFrom('league_groups')
    .select('competition_id')
    .where('id', '=', p.id)
    .executeTakeFirst();
  if (!group) notFound();
  const context = await requireStaff(
    locale,
    'moderation.manage',
    group.competition_id,
  );
  const data = await readChatModeration(
    db,
    context.principal,
    context.grants,
    group.competition_id,
    p.id,
  );
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <Link href={`/${locale}/admin/moderation`}>
          {locale === 'ar' ? 'المراجعة' : 'Moderation'} ↗
        </Link>
        <h1>{data.group.name}</h1>
      </div>
      <ChatModerationPanel locale={locale} data={data} staff />
    </AdminShell>
  );
}
