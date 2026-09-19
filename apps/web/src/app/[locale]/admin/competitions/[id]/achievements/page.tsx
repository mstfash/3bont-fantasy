import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAchievementAdministration } from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { AchievementDefinitionEditor } from '@/components/achievements/definition-editor';
import { AchievementAction } from '@/components/achievements/definition-actions';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
export default async function AchievementAdministration({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params,
    locale = requireLocale(p.locale),
    ar = locale === 'ar';
  if (!idSchema.safeParse(p.id).success) notFound();
  const context = await requireStaff(locale, 'competition.manage', p.id),
    db = getRuntime().db;
  const competition = await db
    .selectFrom('competitions')
    .select('data')
    .where('id', '=', p.id)
    .executeTakeFirst();
  if (!competition) notFound();
  const data = await readAchievementAdministration(
    db,
    context.principal,
    context.grants,
    p.id,
  );
  const locked = Math.max(
    0,
    ...data.rounds
      .filter(
        (r) => r.status !== 'upcoming' || Date.parse(r.deadline) <= Date.now(),
      )
      .map((r) => r.number),
  );
  const next =
    data.rounds.find(
      (r) => r.status === 'upcoming' && Date.parse(r.deadline) > Date.now(),
    )?.number ?? Math.min(200, locked + 1);
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <Link href={`/${locale}/admin/competitions/${p.id}`}>
          {competition.data.name[locale]}
        </Link>
        <h1>{ar ? 'كل إنجاز. له حكاية.' : 'EVERY BADGE. EARNED.'}</h1>
        <p>
          {ar
            ? 'تُمنح الإنجازات وفق النتائج النهائية وتُراجع تلقائياً عند التصحيح. الجولات غير المحسومة لا تُكمل سلسلة.'
            : 'Achievements follow final results and reconcile after corrections. Unresolved rounds cannot complete a streak.'}
        </p>
      </div>
      <section className="group-card">
        <h2>{ar ? 'إنجاز جديد' : 'New achievement'}</h2>
        <AchievementDefinitionEditor
          locale={locale}
          competitionId={p.id}
          definition={null}
          nextRound={next}
        />
      </section>
      <section className="group-card">
        <h2>{ar ? 'مراجعة المنح' : 'Grant reconciliation'}</h2>
        <p>
          {ar
            ? 'تعمل المزامنة آلياً مع عامل النتائج. يمكن تشغيلها الآن مع تسجيل السبب.'
            : 'Reconciliation runs automatically with the results worker. You can run it now with a recorded reason.'}
        </p>
        <AchievementAction
          locale={locale}
          competitionId={p.id}
          definition={null}
          action="reconcile"
          lastLockedRound={locked}
        />
      </section>
      <div className="group-grid">
        {data.definitions.map((d) => (
          <section className="group-card" key={`${d.id}:${String(d.version)}`}>
            <span className="eyebrow">
              v{d.version} ·{' '}
              {d.state === 'draft'
                ? ar
                  ? 'مسودة'
                  : 'DRAFT'
                : ar
                  ? 'منشور'
                  : 'PUBLISHED'}
            </span>
            <h2>{d.name[locale]}</h2>
            <p>{d.description[locale]}</p>
            <p>
              {ar ? 'الجولات' : 'Rounds'} {d.firstRound}–
              {Math.min(d.lastRound, d.activeUntilRound)} ·{' '}
              {ar ? 'منح نشطة' : 'Active grants'}{' '}
              {data.awarded.find(
                (a) =>
                  a.definitionId === d.id &&
                  a.version === d.version &&
                  a.state === 'active',
              )?.count ?? 0}{' '}
              · {ar ? 'منح مسحوبة' : 'Revoked grants'}{' '}
              {data.awarded.find(
                (a) =>
                  a.definitionId === d.id &&
                  a.version === d.version &&
                  a.state === 'revoked',
              )?.count ?? 0}
            </p>
            {!data.definitions.some(
              (other) => other.id === d.id && other.version > d.version,
            ) && (
              <details>
                <summary>
                  {d.state === 'draft'
                    ? ar
                      ? 'تحرير المسودة'
                      : 'Edit draft'
                    : ar
                      ? 'نسخة مستقبلية جديدة'
                      : 'New future version'}
                </summary>
                <AchievementDefinitionEditor
                  locale={locale}
                  competitionId={p.id}
                  definition={d}
                  nextRound={next}
                />
              </details>
            )}
            {(d.state === 'draft' ||
              Math.min(d.lastRound, d.activeUntilRound) > locked) && (
              <AchievementAction
                locale={locale}
                competitionId={p.id}
                definition={d}
                action={d.state === 'draft' ? 'publish' : 'retire'}
                lastLockedRound={locked}
              />
            )}
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
