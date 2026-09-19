'use client';
import { useRouter } from 'next/navigation';
import { CHIPS } from '@fantasy/domain';
import {
  chipGrantCommandSchema,
  chipGrantSchema,
  type Competition,
  type Gameweek,
  type ChipGrant,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { ReviewedCommandForm } from './reviewed-command-form';
import { formText } from './groups/reviewed-form';
import '@/styles/groups.css';
export function ChipGrantEditor({
  locale,
  competition,
  rounds,
  grants,
}: {
  readonly locale: Locale;
  readonly competition: Competition;
  readonly rounds: readonly Gameweek[];
  readonly grants: readonly ChipGrant[];
}) {
  const ar = locale === 'ar',
    router = useRouter();
  const names = {
    wildcard: ar ? 'وايلد كارد' : 'Wildcard',
    'free-hit': ar ? 'فري هيت' : 'Free Hit',
    'bench-boost': ar ? 'دكة البدلاء' : 'Bench Boost',
    'triple-captain': ar ? 'تريبل كابتن' : 'Triple Captain',
  };
  return (
    <section className="admin-panel">
      <h2>{ar ? 'منحة شرائح متساوية' : 'Equal chip grant'}</h2>
      <p>
        {ar
          ? 'تُضاف المنحة لكل فريق مؤهل للجولة عند فتح تعديلها، بما في ذلك الفرق الجديدة التي تبدأ بتلك الجولة. لا تُمنح بأثر رجعي لمن يبدأ بعدها. الإعلان يحتاج ٤٨ ساعة قبل فتح التعديل ولا يُلغى بعد نشره.'
          : 'The grant reaches every squad eligible for that round when editing opens, including new squads starting that round. Later entrants receive no historical grants. Announce at least 48 hours before editing opens; publication is irrevocable.'}
      </p>
      {grants.length > 0 && (
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{ar ? 'الجولة' : 'Round'}</th>
                <th>{ar ? 'الإعلان' : 'Announcement'}</th>
                <th>{ar ? 'الإضافات' : 'Added uses'}</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id}>
                  <td>
                    {rounds.find((r) => r.id === g.gameweekId)?.name[locale]}
                  </td>
                  <td>{g.announcement[locale]}</td>
                  <td>
                    {CHIPS.filter((c) => g.amounts[c] > 0)
                      .map((c) => `${names[c]} +${String(g.amounts[c])}`)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="admin-form">
        <ReviewedCommandForm
          locale={locale}
          label={ar ? 'مراجعة المنحة المتساوية' : 'REVIEW EQUAL GRANT'}
          endpoint="/api/v1/admin/chip-grants"
          commandSchema={chipGrantCommandSchema}
          resultSchema={chipGrantSchema}
          makeCommand={(form) => ({
            commandId: crypto.randomUUID(),
            competitionId: competition.id,
            expectedRevision: competition.revision,
            gameweekId: formText(form, 'round'),
            amounts: Object.fromEntries(
              CHIPS.map((c) => [c, Number(formText(form, c))]),
            ),
            announcement: {
              ar: formText(form, 'ar'),
              en: formText(form, 'en'),
            },
            reason: formText(form, 'reason'),
          })}
          onSaved={() => {
            router.refresh();
          }}
        >
          <label>
            {ar ? 'جولة المنحة' : 'Grant gameweek'}
            <select
              name="round"
              required
              aria-label={ar ? 'جولة المنحة' : 'Grant gameweek'}
            >
              {rounds
                .filter((r) => r.status === 'upcoming')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name[locale]}
                  </option>
                ))}
            </select>
          </label>
          <div className="form-pair">
            {CHIPS.map((c) => (
              <label key={c}>
                {names[c]}
                <input
                  name={c}
                  type="number"
                  min={0}
                  max={25}
                  defaultValue={0}
                  required
                />
              </label>
            ))}
          </div>
          <p>
            {ar
              ? 'حد الإصدار الحالي: ٢٥ استخداماً إجمالياً لكل نوع لكل فريق، بين الرصيد الابتدائي والمنح المعلنة.'
              : 'Current release limit: 25 allocated uses per chip type per squad, counting initial inventory and announced grants.'}
          </p>
          <label>
            {ar ? 'الإعلان بالعربية' : 'Arabic announcement'}
            <textarea name="ar" required maxLength={1000} />
          </label>
          <label>
            {ar ? 'الإعلان بالإنجليزية' : 'English announcement'}
            <textarea name="en" required maxLength={1000} />
          </label>
          <label>
            {ar ? 'سبب المنحة في سجل العمليات' : 'Grant audit reason'}
            <textarea name="reason" required minLength={5} maxLength={1000} />
          </label>
          <label className="confirmation-check">
            <input type="checkbox" required />
            {ar
              ? 'راجعت المنحة المتساوية وموعدها وإعلانها الملزم.'
              : 'I reviewed the equal allocation, timing and binding announcement.'}
          </label>
        </ReviewedCommandForm>
      </div>
    </section>
  );
}
