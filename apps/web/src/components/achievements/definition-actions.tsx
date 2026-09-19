'use client';
import { useRouter } from 'next/navigation';
import {
  achievementCommandSchema,
  achievementCommandResultSchema,
  type AchievementDefinition,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { ReviewedCommandForm } from '../reviewed-command-form';
import { formText } from '../groups/reviewed-form';
export function AchievementAction({
  locale,
  competitionId,
  definition,
  action,
  lastLockedRound,
}: {
  readonly locale: Locale;
  readonly competitionId: string;
  readonly definition: AchievementDefinition | null;
  readonly action: 'publish' | 'retire' | 'reconcile';
  readonly lastLockedRound: number;
}) {
  const ar = locale === 'ar',
    router = useRouter();
  const label =
    action === 'publish'
      ? ar
        ? 'نشر الإنجاز'
        : 'Publish achievement'
      : action === 'retire'
        ? ar
          ? 'إيقاف المنح مستقبلاً'
          : 'Retire future grants'
        : ar
          ? 'مزامنة الإنجازات مع النتائج'
          : 'Reconcile earned achievements';
  return (
    <ReviewedCommandForm
      locale={locale}
      label={label}
      endpoint="/api/v1/admin/achievements"
      commandSchema={achievementCommandSchema}
      resultSchema={achievementCommandResultSchema}
      onSaved={() => {
        router.refresh();
      }}
      makeCommand={(form) => ({
        kind: action,
        commandId: crypto.randomUUID(),
        competitionId,
        ...(action !== 'reconcile'
          ? {
              definitionId: definition?.id,
              version: definition?.version,
              expectedRevision: definition?.revision,
            }
          : {}),
        ...(action === 'publish'
          ? { allowHistorical: form.get('historical') === 'on' }
          : {}),
        ...(action === 'retire'
          ? { afterRound: Number(formText(form, 'afterRound')) }
          : {}),
        reason: formText(form, 'reason'),
      })}
    >
      {action === 'publish' && (
        <label className="confirmation-check">
          <input name="historical" type="checkbox" />
          {ar
            ? 'راجعت منح النسخة الأولى بأثر رجعي. النسخ اللاحقة تبدأ مستقبلاً فقط.'
            : 'I reviewed retrospective awards for the first version. Later versions start in the future only.'}
        </label>
      )}
      {action === 'retire' && (
        <label>
          {ar
            ? 'الإبقاء على الأهلية حتى الجولة'
            : 'Keep eligibility through round'}
          <input
            name="afterRound"
            type="number"
            min={lastLockedRound}
            max={199}
            defaultValue={lastLockedRound}
            required
          />
        </label>
      )}
      <label>
        {ar ? 'سبب الإجراء' : 'Action reason'}
        <textarea name="reason" required minLength={5} maxLength={1000} />
      </label>
    </ReviewedCommandForm>
  );
}
