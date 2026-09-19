import Link from 'next/link';
import { z } from 'zod';
import { readProviderIdentityAdministration } from '@fantasy/application';
import { idSchema } from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import {
  ProviderIdentityControls,
  RetireProviderIdentity,
} from '@/components/providers/identity-controls';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
import { requireLocale, deadlineLabel } from '@/lib/locale';
import { commandError } from '@/lib/command-errors';
import '@/styles/groups.css';
export default async function ProviderIdentitiesPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{
    binding?: string;
    evidence?: string;
    kind?: string;
    page?: string;
  }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar',
    query = await searchParams,
    context = await requireStaff(locale, 'facts.manage', null);
  const info = await readProviderIdentityAdministration(
    getRuntime().db,
    context.principal,
    context.grants,
    {
      bindingId: idSchema.safeParse(query.binding).data ?? null,
      evidenceId: idSchema.safeParse(query.evidence).data ?? null,
      kind:
        z.enum(['club', 'footballer', 'fixture']).safeParse(query.kind).data ??
        'club',
    },
  );
  const page = Math.min(
    Math.max(1, Math.ceil(info.mappings.length / 50)),
    Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1),
  );
  const pageLink = (value: number) =>
    `?binding=${info.binding?.id ?? ''}&kind=${info.kind}&evidence=${info.selectedEvidenceId ?? ''}&page=${String(value)}`;
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <Link className="eyebrow" href={`/${locale}/admin/providers`}>
          API-FOOTBALL ↗
        </Link>
        <h1>
          {ar
            ? 'هوية ثابتة. دليل محفوظ.'
            : 'STABLE IDENTITIES. SAVED EVIDENCE.'}
        </h1>
        <p>
          {ar
            ? 'اربط معرّفات المصدر بالسجلات الموجودة بعد المراجعة. تحديد الهوية مستقل عن إثبات تغطية الموسم وعن نشر نتائج المباريات.'
            : 'Review provider IDs against existing app records. Identity mapping is separate from season coverage validation and publishing match results.'}
        </p>
      </div>
      <form className="group-form" method="get">
        <label>
          {ar ? 'ربط الموسم' : 'Season binding'}
          <select name="binding" defaultValue={info.binding?.id ?? ''}>
            <option value="">
              {ar ? 'إنشاء ربط موسم' : 'New season binding'}
            </option>
            {info.bindings.map((b) => (
              <option key={b.id} value={b.id}>
                {info.seasons.find((s) => s.id === b.seasonId)?.name[locale] ??
                  b.seasonId}{' '}
                · {b.leagueId}/{b.seasonYear}
              </option>
            ))}
          </select>
        </label>
        <label>
          {ar ? 'نوع السجل بعد ربط الموسم' : 'Entity type after season binding'}
          <select name="kind" defaultValue={info.kind}>
            <option value="club">{ar ? 'نادٍ' : 'Club'}</option>
            <option value="footballer">{ar ? 'لاعب' : 'Footballer'}</option>
            <option value="fixture">{ar ? 'مباراة' : 'Fixture'}</option>
          </select>
        </label>
        <button className="button-outline">
          {ar ? 'عرض المصادر' : 'Load sources'}
        </button>
      </form>
      <section className="group-card">
        <h2>{ar ? 'دليل المصدر' : 'SOURCE EVIDENCE'}</h2>
        <p>
          {ar
            ? 'آخر ٥٠ استجابة ناجحة للمورد المحدد. تُجلب صفحات المزود عبر عامل التشغيل ضمن الميزانية.'
            : 'Latest 50 successful responses for this resource. Provider pages are fetched through the budgeted worker.'}
        </p>
        {info.evidence.length > 0 ? (
          <form className="group-form" method="get">
            <input
              type="hidden"
              name="binding"
              value={info.binding?.id ?? ''}
            />
            <input type="hidden" name="kind" value={info.kind} />
            <label>
              {ar ? 'الاستجابة المحفوظة' : 'Stored response'}
              <select
                name="evidence"
                defaultValue={info.selectedEvidenceId ?? ''}
              >
                {info.evidence.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.request.resource}{' '}
                    {'page' in e.request ? `p${String(e.request.page)}` : ''} ·{' '}
                    {deadlineLabel(e.receivedAt, locale)} · {e.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <button className="button-outline">
              {ar ? 'مراجعة الدليل' : 'Review evidence'}
            </button>
          </form>
        ) : (
          <p>
            {ar
              ? 'لا توجد استجابة ناجحة لهذا النطاق بعد.'
              : 'No successful response for this scope has been recorded yet.'}
          </p>
        )}
        {info.evidenceIssue && (
          <p role="status">{commandError(info.evidenceIssue, locale)}</p>
        )}
        <ProviderIdentityControls
          key={`${info.binding?.id ?? 'new'}-${info.kind}-${info.selectedEvidenceId ?? 'none'}`}
          locale={locale}
          info={info}
        />
      </section>
      {info.binding && (
        <section className="admin-panel">
          <h2>
            {ar
              ? 'الروابط والإصدارات الحالية'
              : 'CURRENT MAPPINGS AND VERSIONS'}
          </h2>
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{ar ? 'معرّف المصدر' : 'Source ID'}</th>
                  <th>{ar ? 'السجل المحلي' : 'App record'}</th>
                  <th>{ar ? 'الإصدار والحالة' : 'Version / state'}</th>
                  <th>{ar ? 'مراجعة' : 'Review'}</th>
                </tr>
              </thead>
              <tbody>
                {info.mappings.slice((page - 1) * 50, page * 50).map((m) => (
                  <tr key={m.id}>
                    <td>{m.externalId}</td>
                    <td>
                      {info.targets.find((t) => t.id === m.entityId)?.name[
                        locale
                      ] ?? m.entityId}
                    </td>
                    <td>
                      {m.revision} ·{' '}
                      {m.state === 'active'
                        ? ar
                          ? 'فعّال'
                          : 'Active'
                        : ar
                          ? 'متقاعد'
                          : 'Retired'}
                    </td>
                    <td>
                      {m.state === 'active' && (
                        <RetireProviderIdentity locale={locale} mapping={m} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="group-pagination">
            {page > 1 && (
              <Link href={pageLink(page - 1)}>
                {ar ? 'السابق' : 'Previous'}
              </Link>
            )}
            <span>{page}</span>
            {page * 50 < info.mappings.length && (
              <Link href={pageLink(page + 1)}>{ar ? 'التالي' : 'Next'}</Link>
            )}
          </nav>
        </section>
      )}
    </AdminShell>
  );
}
