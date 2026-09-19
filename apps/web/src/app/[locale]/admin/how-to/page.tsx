import Link from 'next/link';
import { capabilityScopes } from '@fantasy/application';
import { competitionSchema, gameweekSchema } from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { InfoTip } from '@/components/help/info-tip';
import { requireLocale } from '@/lib/locale';
import { competitionFacts, guideGameweek } from '@/lib/help/guide-rules';
import { helpCopy } from '@/lib/help/topics';
import { adminWorkflows } from '@/lib/help/admin-workflows';
import { requireStaffSession } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function AdminHandbook({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar';
  const context = await requireStaffSession(locale);
  const scopes = [
    ...capabilityScopes(context.grants, 'competition.manage'),
    ...capabilityScopes(context.grants, 'operations.read'),
  ];
  const ids = scopes.filter((id) => id !== null);
  const db = getRuntime().db;
  const rows = scopes.includes(null)
    ? await db
        .selectFrom('competitions')
        .select('data')
        .orderBy('slug')
        .execute()
    : ids.length
      ? await db
          .selectFrom('competitions')
          .select('data')
          .where('id', 'in', ids)
          .orderBy('slug')
          .execute()
      : [];
  const competitions = rows.map((row) => competitionSchema.parse(row.data));
  const rounds = competitions.length
    ? (
        await db
          .selectFrom('gameweeks')
          .select('data')
          .where(
            'competition_id',
            'in',
            competitions.map((item) => item.id),
          )
          .orderBy('number')
          .execute()
      ).map((row) => gameweekSchema.parse(row.data))
    : [];
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <p className="eyebrow">
          {ar ? 'مرجع فريق التشغيل' : 'THE OPERATOR’S REFERENCE'}
        </p>
        <h1>{ar ? 'دليل الإدارة' : 'ADMIN HANDBOOK'}</h1>
        <p>
          {ar
            ? 'خطوات تشغيل مرتبطة بأدواتك وصلاحياتك الحالية. القيم أدناه مقروءة من البطولات المحفوظة؛ المسودات غير منشورة للاعبين.'
            : 'Operating steps linked to your tools and current permissions. Values below come from saved competitions; drafts are not published to players.'}
        </p>
      </div>
      <nav className="guide-links">
        <Link href={`/${locale}/how-to-play`}>
          {ar ? 'كيف يرى اللاعب خطوات اللعب' : 'Player how-to'}
        </Link>
        <Link href={`/${locale}/playbook`}>
          {ar ? 'دليل اللاعب' : 'Player playbook'}
        </Link>
      </nav>
      <section className="guide-section">
        <h2>{ar ? 'قائمة مراجعة يوم المباراة' : 'Matchday checklist'}</h2>
        <ol>
          <li>
            {ar
              ? 'قبل الإغلاق: راجع مواعيد المباريات والجولات ونسخ القواعد وقائمة اللاعبين.'
              : 'Before the cutoff: review fixtures, gameweek deadlines, rule versions and the player pool.'}
          </li>
          <li>
            {ar
              ? 'بعد الإغلاق: تحقق من حفظ التشكيلات وتشغيل المهام. لا تعدّل الجولة المغلقة بتغيير إعداداتها العادية.'
              : 'After the cutoff: verify lineup snapshots and worker activity. Ordinary settings edits must not rewrite locked rounds.'}
          </li>
          <li>
            {ar
              ? 'بعد المباريات: راجع نقص البيانات والتعارضات ومعاينة النقاط قبل النشر والاعتماد.'
              : 'After matches: review missing data, conflicts and point previews before publication and finalization.'}
          </li>
          <li>
            {ar
              ? 'قبل الجوائز: افحص الأهلية والنتائج النهائية وأي حالات تصحيح مفتوحة والموافقة المستقلة.'
              : 'Before awards: check eligibility, final results, open correction cases and independent approval.'}
          </li>
        </ol>
      </section>
      <div className="guide-grid">
        {adminWorkflows
          .filter((workflow) =>
            ['facts.manage', 'staff.manage'].includes(workflow.capability)
              ? capabilityScopes(context.grants, workflow.capability).includes(
                  null,
                )
              : capabilityScopes(context.grants, workflow.capability).length >
                0,
          )
          .map((workflow) => {
            const copy = helpCopy(workflow.topic, locale);
            return (
              <section
                className="guide-card"
                key={workflow.capability + workflow.topic}
              >
                <h2>
                  {copy.title}{' '}
                  <InfoTip
                    locale={locale}
                    label={copy.title}
                    text={copy.text}
                  />
                </h2>
                <ol>
                  {workflow[locale].map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <Link href={`/${locale}${workflow.path}`}>
                  {ar ? 'افتح أداة الإدارة' : 'Open management tool'} ↗
                </Link>
              </section>
            );
          })}
      </div>
      <section className="guide-section">
        <h2>
          {ar ? 'إعدادات بطولاتك المحفوظة' : 'Your saved competition settings'}
        </h2>
        <p>
          {ar
            ? 'تُعرض أول جولة قادمة غير مغلقة، أو آخر جولة عند عدم وجودها. احتفظت الجولات المغلقة بنسخها؛ افتح معاينة الإعدادات لمعرفة الموعد الفعلي لأي تغيير.'
            : 'The first upcoming unlocked gameweek is shown, or the last round when none remains. Locked rounds retain their versions; open configuration review to see exactly when a change takes effect.'}
        </p>
        <div className="guide-grid">
          {competitions.map((competition) => {
            const round = guideGameweek(
              rounds.filter((item) => item.competitionId === competition.id),
              undefined,
              Date.now(),
            );
            const rules = round?.rules ?? competition.rules;
            return (
              <article className="guide-card" key={competition.id}>
                <h3>{competition.name[locale]}</h3>
                <p>
                  {round?.name[locale]} · {ar ? 'نسخة' : 'Version'}{' '}
                  {rules.version} ·{' '}
                  {competition.status === 'draft'
                    ? ar
                      ? 'مسودة غير منشورة'
                      : 'Unpublished draft'
                    : ar
                      ? 'إعدادات محفوظة'
                      : 'Saved settings'}
                </p>
                <dl>
                  {competitionFacts(competition, rules, locale).map(
                    ([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ),
                  )}
                </dl>
                {['published', 'running', 'completed'].includes(
                  competition.status,
                ) && (
                  <Link
                    href={`/${locale}/playbook?competition=${competition.slug}${round ? `&gameweek=${round.id}` : ''}`}
                  >
                    {ar
                      ? 'افتح الدليل العام لهذه الجولة'
                      : 'Open this round’s public playbook'}
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </AdminShell>
  );
}
