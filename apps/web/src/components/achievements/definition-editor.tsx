'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { points } from '@fantasy/domain';
import {
  achievementCommandSchema,
  achievementCommandResultSchema,
  achievementConditionSchema,
  type AchievementDefinition,
} from '@fantasy/contracts';
import { ReviewedCommandForm } from '../reviewed-command-form';
import { formText } from '../groups/reviewed-form';
import type { Locale } from '@/lib/brand';
import '@/styles/groups.css';
export function AchievementDefinitionEditor({
  locale,
  competitionId,
  definition,
  nextRound,
}: {
  readonly locale: Locale;
  readonly competitionId: string;
  readonly definition: AchievementDefinition | null;
  readonly nextRound: number;
}) {
  const ar = locale === 'ar',
    router = useRouter(),
    revise = definition?.state === 'published';
  const [kind, setKind] = useState(
    definition?.condition.kind ?? 'positive-round',
  );
  const [scope, setScope] = useState<'entry' | 'account'>(
    definition?.scope ?? 'entry',
  );
  const options = {
    activated: ar ? 'تفعيل فريق' : 'Squad activated',
    'positive-round': ar
      ? 'أول جولة نهائية بنقاط موجبة'
      : 'First final positive round',
    points: ar ? 'بلوغ نقاط جولة' : 'Gameweek points threshold',
    'top-rank': ar ? 'أفضل ترتيب في جولة' : 'Top gameweek rank',
    streak: ar ? 'سلسلة جولات نهائية' : 'Finalized gameweek streak',
  };
  return (
    <ReviewedCommandForm
      locale={locale}
      label={ar ? 'مراجعة تعريف الإنجاز' : 'Review achievement definition'}
      endpoint="/api/v1/admin/achievements"
      commandSchema={achievementCommandSchema}
      resultSchema={achievementCommandResultSchema}
      onSaved={() => {
        router.refresh();
      }}
      makeCommand={(form) => {
        const condition = achievementConditionSchema.parse(
          kind === 'points'
            ? { kind, minimum: points(formText(form, 'minimum')) }
            : kind === 'top-rank'
              ? { kind, maximumRank: Number(formText(form, 'rank')) }
              : kind === 'streak'
                ? {
                    kind,
                    length: Number(formText(form, 'length')),
                    minimum: points(formText(form, 'minimum')),
                  }
                : { kind },
        );
        return {
          kind: revise ? 'revise' : definition ? 'update' : 'create',
          commandId: crypto.randomUUID(),
          competitionId,
          ...(definition
            ? revise
              ? {
                  definitionId: definition.id,
                  sourceVersion: definition.version,
                }
              : {
                  definitionId: definition.id,
                  version: definition.version,
                  expectedRevision: definition.revision,
                }
            : {}),
          name: { ar: formText(form, 'ar'), en: formText(form, 'en') },
          description: {
            ar: formText(form, 'descriptionAr'),
            en: formText(form, 'descriptionEn'),
          },
          icon: formText(form, 'icon'),
          scope,
          condition,
          firstRound: Number(formText(form, 'first')),
          lastRound: Number(formText(form, 'last')),
          reason: formText(form, 'reason'),
        };
      }}
    >
      <div className="form-pair">
        <label>
          {ar ? 'الاسم بالعربية' : 'Arabic achievement name'}
          <input
            name="ar"
            defaultValue={definition?.name.ar ?? ''}
            required
            maxLength={200}
          />
        </label>
        <label>
          {ar ? 'الاسم بالإنجليزية' : 'English achievement name'}
          <input
            name="en"
            defaultValue={definition?.name.en ?? ''}
            required
            maxLength={200}
          />
        </label>
      </div>
      <div className="form-pair">
        <label>
          {ar ? 'الوصف بالعربية' : 'Arabic achievement description'}
          <textarea
            name="descriptionAr"
            defaultValue={definition?.description.ar ?? ''}
            required
            maxLength={1000}
          />
        </label>
        <label>
          {ar ? 'الوصف بالإنجليزية' : 'English achievement description'}
          <textarea
            name="descriptionEn"
            defaultValue={definition?.description.en ?? ''}
            required
            maxLength={1000}
          />
        </label>
      </div>
      <label>
        {ar ? 'الشارة' : 'Badge artwork'}
        <select
          name="icon"
          defaultValue={definition?.icon ?? 'star'}
          aria-label={ar ? 'الشارة' : 'Badge artwork'}
        >
          <option value="star">{ar ? 'نجمة' : 'Star'}</option>
          <option value="trophy">{ar ? 'كأس' : 'Trophy'}</option>
          <option value="shield">{ar ? 'درع' : 'Shield'}</option>
          <option value="bolt">{ar ? 'صاعقة' : 'Bolt'}</option>
          <option value="crown">{ar ? 'تاج' : 'Crown'}</option>
        </select>
      </label>
      <label>
        {ar ? 'شرط الإنجاز' : 'Achievement condition'}
        <select
          value={kind}
          aria-label={ar ? 'شرط الإنجاز' : 'Achievement condition'}
          onChange={(e) => {
            const selected = achievementConditionSchema.options.find(
              (o) => o.shape.kind.value === e.target.value,
            )?.shape.kind.value;
            if (selected) {
              setKind(selected);
              if (selected !== 'activated') setScope('entry');
            }
          }}
        >
          {Object.entries(options).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {(kind === 'points' || kind === 'streak') && (
        <label>
          {ar ? 'الحد الأدنى للنقاط الصافية' : 'Minimum net points'}
          <input
            name="minimum"
            inputMode="decimal"
            required
            defaultValue={
              definition &&
              (definition.condition.kind === 'points' ||
                definition.condition.kind === 'streak')
                ? String(definition.condition.minimum / 1000)
                : '1'
            }
          />
        </label>
      )}
      {kind === 'streak' && (
        <label>
          {ar ? 'عدد الجولات المتتالية' : 'Consecutive rounds'}
          <input
            name="length"
            type="number"
            min={2}
            max={100}
            required
            defaultValue={
              definition?.condition.kind === 'streak'
                ? definition.condition.length
                : 3
            }
          />
        </label>
      )}
      {kind === 'top-rank' && (
        <label>
          {ar ? 'أقصى مركز مؤهل' : 'Highest qualifying rank number'}
          <input
            name="rank"
            type="number"
            min={1}
            max={100000}
            required
            defaultValue={
              definition?.condition.kind === 'top-rank'
                ? definition.condition.maximumRank
                : 10
            }
          />
        </label>
      )}
      <label>
        {ar ? 'ينتمي الإنجاز إلى' : 'Achievement belongs to'}
        <select
          value={scope}
          disabled={kind !== 'activated'}
          aria-label={ar ? 'ينتمي الإنجاز إلى' : 'Achievement belongs to'}
          onChange={(e) => {
            setScope(e.target.value === 'account' ? 'account' : 'entry');
          }}
        >
          <option value="entry">{ar ? 'الفريق' : 'Squad'}</option>
          <option value="account">
            {ar ? 'الحساب (إنجاز المشاركة)' : 'Account (participation)'}
          </option>
        </select>
      </label>
      <div className="form-pair">
        <label>
          {ar ? 'أول جولة مؤهلة' : 'First eligible round'}
          <input
            name="first"
            type="number"
            min={1}
            max={200}
            required
            defaultValue={
              revise
                ? Math.max(nextRound, definition.firstRound + 1)
                : (definition?.firstRound ?? nextRound)
            }
          />
        </label>
        <label>
          {ar ? 'آخر جولة مؤهلة' : 'Last eligible round'}
          <input
            name="last"
            type="number"
            min={1}
            max={200}
            required
            defaultValue={
              revise
                ? Math.max(
                    definition.lastRound,
                    nextRound,
                    definition.firstRound + 1,
                  )
                : (definition?.lastRound ?? 200)
            }
          />
        </label>
      </div>
      <p>
        {ar
          ? 'إنجازات تجميلية فقط؛ لا تغيّر النقاط أو الميزانية أو الشرائح أو أهلية الجوائز.'
          : 'Cosmetic only: achievements do not change points, budgets, chips or prize eligibility.'}
      </p>
      <label>
        {ar ? 'سبب التعريف' : 'Definition reason'}
        <textarea name="reason" minLength={5} maxLength={1000} required />
      </label>
    </ReviewedCommandForm>
  );
}
