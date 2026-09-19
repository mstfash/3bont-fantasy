import { readStaffDirectory } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { StaffGrantEditor, StaffRevokeEditor } from '@/components/staff-editor';
import { requireLocale } from '@/lib/locale';
import { staffRoleLabels } from '@/lib/staff-roles';
import { getRuntime } from '@/server/runtime';
import { requireStaff } from '@/server/staff';
export default async function StaffPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ q?: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar';
  const context = await requireStaff(locale, 'staff.manage', null);
  const q = (await searchParams).q ?? '';
  const data = await readStaffDirectory(
    getRuntime().db,
    context.principal,
    context.grants,
    q,
  );
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar ? 'فريق التشغيل' : 'THE OPERATING TEAM'}
        </span>
        <h1>{ar ? 'الصلاحية الصحيحة.' : 'THE RIGHT ACCESS.'}</h1>
        <p>
          {ar
            ? 'امنح كل مسؤول دوره ونطاقه. يتطلب الحفظ تحققاً حديثاً، وتُسجّل كل التغييرات.'
            : 'Give each operator a role and scope. Saving requires fresh verification; every change is audited.'}
        </p>
      </div>
      <section className="admin-panel staff-panel">
        <h2>{ar ? 'منح صلاحية' : 'Grant access'}</h2>
        <form className="group-form" method="get">
          <label>
            {ar
              ? 'البحث باسم الحساب أو المعرّف'
              : 'Search display name or account ID'}
            <input
              name="q"
              defaultValue={q}
              minLength={2}
              maxLength={200}
              required
            />
          </label>
          <button className="button-outline" type="submit">
            {ar ? 'بحث' : 'Search'}
          </button>
        </form>
        {q && (
          <>
            <p>
              {data.moreCandidates
                ? ar
                  ? 'أكثر من ٢٠ نتيجة؛ حدّد البحث أكثر.'
                  : 'More than 20 matches; narrow your search.'
                : ar
                  ? `${String(data.candidates.length)} نتيجة`
                  : `${String(data.candidates.length)} matches`}
            </p>
            {data.candidates.length > 0 && (
              <StaffGrantEditor
                locale={locale}
                candidates={data.candidates}
                competitions={data.competitions}
              />
            )}
          </>
        )}
      </section>
      <section className="admin-panel staff-panel">
        <h2>{ar ? 'الصلاحيات الحالية' : 'Current permissions'}</h2>
        <div className="admin-table-scroll">
          <table className="staff-table">
            <thead>
              <tr>
                <th>{ar ? 'الحساب' : 'Account'}</th>
                <th>{ar ? 'الدور' : 'Role'}</th>
                <th>{ar ? 'النطاق' : 'Scope'}</th>
                <th>{ar ? 'التحكم' : 'Controls'}</th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((g) => (
                <tr key={g.id}>
                  <td>
                    {g.displayName}
                    <small>
                      <bdi>{g.accountId}</bdi>
                    </small>
                  </td>
                  <td>{staffRoleLabels[g.role][locale]}</td>
                  <td>
                    {g.competitionId
                      ? data.competitions.find((c) => c.id === g.competitionId)
                          ?.name[locale]
                      : ar
                        ? 'المنصة بالكامل'
                        : 'Entire platform'}
                  </td>
                  <td>
                    <StaffRevokeEditor
                      locale={locale}
                      grant={g}
                      name={g.displayName}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          {ar
            ? 'لا يمكن سحب صلاحية آخر مالك غير موقوف. تغيير الصلاحيات يلغي تحقق جلسات الحساب المستهدف.'
            : 'The last unsuspended owner is protected. Role changes invalidate the target account’s staff verification.'}
        </p>
      </section>
    </AdminShell>
  );
}
