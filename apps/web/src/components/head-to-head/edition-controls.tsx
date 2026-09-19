'use client';
import { useRouter } from 'next/navigation';
import {
  headToHeadCommandSchema,
  headToHeadCommandResultSchema,
  type HeadToHeadEdition,
  type Gameweek,
  type LeagueGroup,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { ReviewedCommandForm } from '../reviewed-command-form';
import { formText, type OwnedGroupEntry } from '../groups/reviewed-form';
const schemas = {
  commandSchema: headToHeadCommandSchema,
  resultSchema: headToHeadCommandResultSchema,
  endpoint: '/api/v1/head-to-head',
};
export function EditionCreate({
  locale,
  group,
  rounds,
}: {
  readonly locale: Locale;
  readonly group: LeagueGroup;
  readonly rounds: readonly Gameweek[];
}) {
  const ar = locale === 'ar',
    router = useRouter();
  return (
    <ReviewedCommandForm
      {...schemas}
      locale={locale}
      label={ar ? 'مراجعة نسخة المواجهات' : 'REVIEW H2H EDITION'}
      makeCommand={(form) => ({
        kind: 'create',
        commandId: crypto.randomUUID(),
        competitionId: group.competitionId,
        groupId: group.id,
        name: formText(form, 'name'),
        gameweekIds: form.getAll('round'),
        tieBreak: formText(form, 'tieBreak'),
        tablePoints: {
          win: Number(formText(form, 'win')),
          draw: Number(formText(form, 'draw')),
          loss: Number(formText(form, 'loss')),
        },
      })}
      onSaved={(result) => {
        router.push(`/${locale}/head-to-head/${result.editionId}`);
        router.refresh();
      }}
    >
      <label>
        {ar ? 'اسم النسخة' : 'Edition name'}
        <input name="name" required minLength={2} maxLength={80} />
      </label>
      <fieldset className="h2h-round-choices">
        <legend>
          {ar ? 'الجولات المتاحة للجدول' : 'Available schedule window'}
        </legend>
        {rounds.map((g) => (
          <label className="confirmation-check" key={g.id}>
            <input name="round" value={g.id} type="checkbox" />
            {g.name[locale]}
          </label>
        ))}
      </fieldset>
      <p>
        {ar
          ? 'ننشر دورات كاملة فقط حتى يواجه الجميع نفس عدد المنافسين. ستراجع الجدول قبل النشر.'
          : 'Only complete round-robin cycles are published, giving everyone the same number of opponents. Review the schedule before publication.'}
      </p>
      <div className="form-pair">
        <label>
          {ar ? 'نقاط الفوز' : 'Win points'}
          <input
            name="win"
            type="number"
            min={1}
            max={100}
            defaultValue={3}
            required
          />
        </label>
        <label>
          {ar ? 'نقاط التعادل' : 'Draw points'}
          <input
            name="draw"
            type="number"
            min={0}
            max={100}
            defaultValue={1}
            required
          />
        </label>
      </div>
      <label>
        {ar ? 'نقاط الخسارة' : 'Loss points'}
        <input
          name="loss"
          type="number"
          min={0}
          max={100}
          defaultValue={0}
          required
        />
      </label>
      <label>
        {ar ? 'التساوي في نقاط المواجهات' : 'Equal H2H table points'}
        <select name="tieBreak" defaultValue="shared">
          <option value="shared">{ar ? 'مراكز مشتركة' : 'Shared ranks'}</option>
          <option value="fantasy-points">
            {ar
              ? 'مجموع نقاط الفانتازي ثم مراكز مشتركة'
              : 'Net fantasy points, then shared ranks'}
          </option>
        </select>
      </label>
    </ReviewedCommandForm>
  );
}
export function EditionControl({
  locale,
  edition,
  kind,
  entries = [],
  roster = [],
}: {
  readonly locale: Locale;
  readonly edition: HeadToHeadEdition;
  readonly kind: 'open-registration' | 'register' | 'withdraw' | 'publish';
  readonly entries?: readonly OwnedGroupEntry[];
  readonly roster?: readonly string[];
}) {
  const ar = locale === 'ar',
    router = useRouter();
  const labels = {
    'open-registration': ar ? 'فتح التسجيل' : 'OPEN REGISTRATION',
    register: ar ? 'مراجعة التسجيل' : 'REVIEW REGISTRATION',
    withdraw: ar ? 'مراجعة الانسحاب' : 'REVIEW WITHDRAWAL',
    publish: ar ? 'مراجعة نشر الجدول' : 'REVIEW SCHEDULE PUBLICATION',
  };
  return (
    <ReviewedCommandForm
      {...schemas}
      locale={locale}
      label={labels[kind]}
      makeCommand={(form) => {
        const base = {
          kind,
          commandId: crypto.randomUUID(),
          competitionId: edition.competitionId,
          groupId: edition.groupId,
          editionId: edition.id,
        };
        if (kind === 'register' || kind === 'withdraw')
          return { ...base, entryId: formText(form, 'entry') };
        return kind === 'publish'
          ? {
              ...base,
              expectedRevision: edition.revision,
              expectedRoster: roster,
            }
          : { ...base, expectedRevision: edition.revision };
      }}
      onSaved={() => {
        router.refresh();
      }}
    >
      {(kind === 'register' || kind === 'withdraw') && (
        <label>
          {ar ? 'الفريق' : 'Squad'}
          <select name="entry" required aria-label={ar ? 'الفريق' : 'Squad'}>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === 'publish' && (
        <label className="confirmation-check">
          <input type="checkbox" required />
          {ar
            ? 'راجعت قائمة الفرق والجدول أدناه. نشره يثبت المنافسين.'
            : 'I reviewed the roster and schedule below. Publishing freezes opponents.'}
        </label>
      )}
      {kind === 'withdraw' && (
        <p>
          {ar
            ? 'الانسحاب بعد النشر يحتفظ بالمواجهات المقفلة ويحتسب المباريات ذات المواعيد النهائية القادمة خسارة بالانسحاب. إعادة الانضمام للمجموعة لا تلغي الانسحاب.'
            : 'After publication, locked matchups remain; future unlocked matches are forfeited. Rejoining the group does not reverse withdrawal.'}
        </p>
      )}
    </ReviewedCommandForm>
  );
}
