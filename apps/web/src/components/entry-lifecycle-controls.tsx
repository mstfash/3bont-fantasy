'use client';
import { useRouter } from 'next/navigation';
import {
  entryLifecycleCommandSchema,
  entryLifecycleResultSchema,
  type Entry,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { ReviewedCommandForm } from './reviewed-command-form';
import { formText } from './groups/reviewed-form';
import '@/styles/groups.css';

export function EntryLifecycleControls({
  entry,
  locale,
}: {
  readonly entry: Entry;
  readonly locale: Locale;
}) {
  const ar = locale === 'ar',
    router = useRouter();
  const shared = {
    locale,
    endpoint: '/api/v1/entries/lifecycle',
    commandSchema: entryLifecycleCommandSchema,
    resultSchema: entryLifecycleResultSchema,
  };
  const command = {
    competitionId: entry.competitionId,
    entryId: entry.id,
    expectedRevision: entry.revision,
  };
  return (
    <section
      className="group-card"
      aria-label={ar ? 'إدارة الفريق' : 'Squad settings'}
    >
      <h2>{ar ? 'إدارة الفريق' : 'SQUAD SETTINGS'}</h2>
      <details>
        <summary>{ar ? 'تغيير اسم الفريق' : 'Rename squad'}</summary>
        <ReviewedCommandForm
          {...shared}
          label={ar ? 'مراجعة الاسم' : 'Review name'}
          makeCommand={(form) => ({
            ...command,
            commandId: crypto.randomUUID(),
            kind: 'rename',
            name: formText(form, 'name'),
          })}
          onSaved={() => {
            router.refresh();
          }}
        >
          <label>
            {ar ? 'اسم الفريق' : 'Squad name'}
            <input
              name="name"
              defaultValue={entry.name}
              minLength={2}
              maxLength={60}
              required
            />
          </label>
        </ReviewedCommandForm>
      </details>
      {entry.status !== 'retired' && (
        <details>
          <summary>
            {entry.status === 'draft'
              ? ar
                ? 'حذف المسودة'
                : 'Discard draft'
              : ar
                ? 'إنهاء مشاركة الفريق'
                : 'Retire squad'}
          </summary>
          <ReviewedCommandForm
            {...shared}
            label={
              entry.status === 'draft'
                ? ar
                  ? 'مراجعة حذف المسودة'
                  : 'Review draft removal'
                : ar
                  ? 'مراجعة إنهاء المشاركة'
                  : 'Review retirement'
            }
            makeCommand={() => ({
              ...command,
              commandId: crypto.randomUUID(),
              kind: entry.status === 'draft' ? 'discard-draft' : 'retire',
            })}
            onSaved={(result) => {
              if (result.discarded) router.push(`/${locale}/dashboard`);
              router.refresh();
            }}
          >
            <p>
              {entry.status === 'draft'
                ? ar
                  ? 'تُحذف المسودة غير المفعّلة فقط إذا لم يكن لها سجل مشاركة. يصبح مكانها متاحاً لإنشاء فريق آخر.'
                  : 'An unactivated draft can be discarded only when it has no participation history. Its entry slot becomes available again.'
                : ar
                  ? 'إنهاء المشاركة نهائي ولا يتيح مكاناً لفريق بديل. تحتفظ الجولات التي انتهى موعدها بتشكيلتها ونقاطها، ولا يشارك الفريق في الجولات التالية. تُحسب مواجهات الرأس بالرأس القادمة انسحاباً. تبقى عضوية المجموعات.'
                  : 'Retirement is permanent and does not free an entry slot. Rounds whose deadlines have passed retain their lineups and points; the squad stops entering future rounds. Future head-to-head matches are forfeited. Group membership remains.'}
            </p>
            {entry.status === 'active' && (
              <p>
                {ar
                  ? 'لا يتأهل الفريق لجوائز تشمل جولة موعدها بعد إنهاء المشاركة. تبقى أهلية الجوائز عن الجولات السابقة وفق شروطها.'
                  : 'The squad is ineligible for prize windows containing a round whose deadline is after retirement. Earlier prize windows retain eligibility under their terms.'}
              </p>
            )}
            <label className="confirmation-check">
              <input type="checkbox" required />
              {ar
                ? 'فهمت النتيجة وأريد المتابعة.'
                : 'I understand the consequences and want to continue.'}
            </label>
          </ReviewedCommandForm>
        </details>
      )}
    </section>
  );
}
