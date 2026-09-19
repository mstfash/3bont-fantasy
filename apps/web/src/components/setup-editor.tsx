'use client';

import { useState, type SubmitEvent } from 'react';
import { InitialPriceSuggestions } from './initial-price-suggestions';
import { z } from 'zod';
import {
  setupCommandSchema,
  type Competition,
  type Fixture,
  type Footballer,
  type Gameweek,
  type PoolPlayer,
  type SetupCommand,
  type InitialPriceReview,
} from '@fantasy/contracts';
import { POSITIONS } from '@fantasy/domain';
import type { Locale } from '@/lib/brand';
import { CairoDateTime } from './cairo-date-time';
import { commandError } from '@/lib/command-errors';
import { positionNames } from '@/lib/football-labels';

function useSetupCommand(locale: Locale) {
  const [pending, setPending] = useState<SetupCommand | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const ar = locale === 'ar';
  function review(input: unknown): void {
    const parsed = setupCommandSchema.safeParse(input);
    if (!parsed.success) {
      setNotice(
        ar
          ? 'راجع البيانات والسبب قبل الحفظ.'
          : 'Review the fields and reason before saving.',
      );
      return;
    }
    setNotice('');
    setPending(parsed.data);
  }
  async function confirm(): Promise<void> {
    if (!pending) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/v1/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      const payload: unknown = await response.json();
      const { code } = z.object({ code: z.string() }).parse(payload);
      const errors: Record<string, { ar: string; en: string }> = {
        'competition-changed': {
          ar: 'تغيرت البطولة. حدّث الصفحة قبل المحاولة.',
          en: 'The competition changed. Reload before trying again.',
        },
        'staff-verification-required': {
          ar: 'جدّد التحقق من الجلسة في صفحة الأمان.',
          en: 'Refresh your session verification on the Security page.',
        },
        'price-freeze-window': {
          ar: 'تغييرات الأسعار متوقفة قرب موعد الجولة.',
          en: 'Price changes are frozen near the deadline.',
        },
        'gameweek-locked': {
          ar: 'لا يمكن تعديل جولة مغلقة.',
          en: 'A locked gameweek cannot be edited here.',
        },
        'deadline-must-precede-kickoff': {
          ar: 'موعد الإغلاق يجب أن يسبق كل مباراة في الجولة.',
          en: 'The deadline must precede every fixture in the gameweek.',
        },
        'played-fixture-assignment-frozen': {
          ar: 'لا يمكن نقل مباراة بدأت أو انتهت بهذه العملية.',
          en: 'A started or finished fixture cannot be moved through this action.',
        },
        'new-gameweek-precedes-active-editing': {
          ar: 'لا يمكن إدراج جولة قبل الجولة التي يعدّل المشاركون فرقهم لها.',
          en: 'A new round cannot precede a round participants are already editing.',
        },
        'gameweek-order': {
          ar: 'أرقام الجولات ومواعيدها يجب أن تكون متتابعة.',
          en: 'Gameweek numbers and deadlines must follow chronological order.',
        },
      };
      setNotice(errors[code]?.[locale] ?? commandError(code, locale));
    } catch {
      setNotice(
        ar
          ? 'لم يتم تأكيد الحفظ. أعد المحاولة بنفس الطلب.'
          : 'Save not confirmed. Retry the same request.',
      );
    } finally {
      setBusy(false);
    }
  }
  return { pending, setPending, notice, busy, review, confirm };
}

function Confirmation({
  locale,
  action,
}: {
  readonly locale: Locale;
  readonly action: ReturnType<typeof useSetupCommand>;
}) {
  const ar = locale === 'ar';
  return (
    <>
      {action.notice && (
        <p role="alert" className="editor-notice">
          {action.notice}
        </p>
      )}
      {action.pending && (
        <div className="admin-confirmation">
          <h3>{ar ? 'راجع قبل التأكيد' : 'Review before confirming'}</h3>
          <p>
            {action.pending.kind === 'pool'
              ? ar
                ? `سيتم اعتماد ${String(action.pending.players.length)} سجلاً للاعبين. الأسعار الأصلية للفرق لا تتغير.`
                : `Approve ${String(action.pending.players.length)} player records. Existing squad purchase prices remain unchanged.`
              : ar
                ? `حفظ الجولة ${String(action.pending.number)} مع ${String(action.pending.fixtureIds.length)} مباراة.`
                : `Save gameweek ${String(action.pending.number)} with ${String(action.pending.fixtureIds.length)} fixtures.`}
          </p>
          <button
            type="button"
            className="action-button"
            disabled={action.busy}
            onClick={() => {
              void action.confirm();
            }}
          >
            {ar ? 'تأكيد وحفظ' : 'CONFIRM & SAVE'}
          </button>
        </div>
      )}
    </>
  );
}

export function PlayerPoolEditor({
  sourceAsOf,
  locale,
  competition,
  footballers,
  pool,
}: {
  readonly locale: Locale;
  readonly competition: Competition;
  readonly sourceAsOf: string;
  readonly footballers: readonly Footballer[];
  readonly pool: readonly PoolPlayer[];
}) {
  const ar = locale === 'ar';
  const action = useSetupCommand(locale);
  const [initialPriceReview, setInitialPriceReview] = useState<
    InitialPriceReview | undefined
  >(undefined);
  const [reason, setReason] = useState('');
  const [items, setItems] = useState(
    footballers.map((footballer) => {
      const current = pool.find((p) => p.footballerId === footballer.id);
      return {
        footballerId: footballer.id,
        position: current?.position ?? footballer.defaultPosition,
        price:
          current?.price ??
          Math.max(
            competition.rules.pricing.minimum,
            Math.min(50, competition.rules.pricing.maximum),
          ),
        selectable: current?.selectable ?? true,
        manuallyPinned: current?.manuallyPinned ?? false,
      };
    }),
  );
  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason');
    action.review({
      kind: 'pool',
      commandId: crypto.randomUUID(),
      competitionId: competition.id,
      expectedRevision: competition.revision,
      players: items,
      ...(initialPriceReview ? { initialPriceReview } : {}),
      reason,
    });
  }
  return (
    <>
      {competition.status === 'draft' && (
        <InitialPriceSuggestions
          sourceAsOf={sourceAsOf}
          locale={locale}
          competition={competition}
          footballers={footballers}
          items={items}
          onStage={(prices, review) => {
            setItems(
              items.map((p) => ({
                ...p,
                price: prices.get(p.footballerId) ?? p.price,
              })),
            );
            setInitialPriceReview(review);
            setReason(
              `Reviewed valuation-midrank-v1 starting prices (${review.policy.currency}); manual adjustments reviewed before publication.`,
            );
            action.setPending(null);
          }}
        />
      )}
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <h2>
            {ar ? 'مجموعة اللاعبين والأسعار' : 'Player pool & fantasy prices'}
          </h2>
        </div>
        <form
          className="admin-form"
          onSubmit={submit}
          onChange={() => {
            action.setPending(null);
          }}
        >
          <p>
            {ar
              ? 'كل لاعب من الموسم المحدد. راجع أسعار الاختيار قبل اعتمادها. تثبيت السعر يمنع التحديث التلقائي.'
              : 'Footballers belong to the selected season. Review selection prices before approving. A price pin prevents automatic updates.'}
          </p>
          <div className="admin-table-scroll pool-scroll">
            <table>
              <thead>
                <tr>
                  <th>{ar ? 'اللاعب' : 'Footballer'}</th>
                  <th>{ar ? 'المركز' : 'Position'}</th>
                  <th>{ar ? 'السعر' : 'Price'}</th>
                  <th>{ar ? 'متاح' : 'Selectable'}</th>
                  <th>{ar ? 'تثبيت' : 'Pin'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const footballer = footballers.find(
                    (p) => p.id === item.footballerId,
                  );
                  return (
                    <tr key={item.footballerId}>
                      <td>{footballer?.name[locale]}</td>
                      <td>
                        <select
                          aria-label={`${ar ? 'مركز' : 'Position'} ${footballer?.name[locale] ?? ''}`}
                          value={item.position}
                          disabled={
                            competition.firstLockedAt !== null &&
                            pool.some(
                              (p) => p.footballerId === item.footballerId,
                            )
                          }
                          onChange={(event) => {
                            const position = POSITIONS.find(
                              (p) => p === event.target.value,
                            );
                            if (position) {
                              setItems(
                                items.map((p) =>
                                  p.footballerId === item.footballerId
                                    ? { ...p, position }
                                    : p,
                                ),
                              );
                            }
                          }}
                        >
                          {POSITIONS.map((p) => (
                            <option key={p} value={p}>
                              {positionNames[p][locale]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`${ar ? 'سعر' : 'Price'} ${footballer?.name[locale] ?? ''}`}
                          type="number"
                          min={competition.rules.pricing.minimum / 10}
                          max={competition.rules.pricing.maximum / 10}
                          step={0.1}
                          value={item.price / 10}
                          required
                          onChange={(event) => {
                            setItems(
                              items.map((p) =>
                                p.footballerId === item.footballerId
                                  ? {
                                      ...p,
                                      price: Math.round(
                                        Number(event.target.value) * 10,
                                      ),
                                    }
                                  : p,
                              ),
                            );
                          }}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${ar ? 'متاح' : 'Selectable'} ${footballer?.name[locale] ?? ''}`}
                          type="checkbox"
                          checked={item.selectable}
                          onChange={(event) => {
                            setItems(
                              items.map((p) =>
                                p.footballerId === item.footballerId
                                  ? { ...p, selectable: event.target.checked }
                                  : p,
                              ),
                            );
                          }}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${ar ? 'تثبيت السعر' : 'Pin price'} ${footballer?.name[locale] ?? ''}`}
                          type="checkbox"
                          checked={item.manuallyPinned}
                          onChange={(event) => {
                            setItems(
                              items.map((p) =>
                                p.footballerId === item.footballerId
                                  ? {
                                      ...p,
                                      manuallyPinned: event.target.checked,
                                    }
                                  : p,
                              ),
                            );
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <label>
            {ar ? 'سبب التغيير' : 'Reason for change'}
            <textarea
              aria-label={ar ? 'سبب التغيير' : 'Reason for change'}
              name="reason"
              value={reason}
              onChange={(event) => {
                setReason(event.currentTarget.value);
              }}
              required
              minLength={5}
              maxLength={1000}
            />
          </label>
          <button
            type="submit"
            className="action-button"
            disabled={action.busy || items.length === 0}
          >
            {ar ? 'مراجعة مجموعة اللاعبين' : 'REVIEW PLAYER POOL'}
          </button>
        </form>
        <Confirmation locale={locale} action={action} />
      </section>
    </>
  );
}

export function GameweekEditor({
  locale,
  competition,
  gameweeks,
  fixtures,
  assignments,
  clubNames,
}: {
  readonly locale: Locale;
  readonly competition: Competition;
  readonly gameweeks: readonly Gameweek[];
  readonly fixtures: readonly Fixture[];
  readonly assignments: readonly { fixtureId: string; gameweekId: string }[];
  readonly clubNames: Readonly<Record<string, string>>;
}) {
  const ar = locale === 'ar';
  const action = useSetupCommand(locale);
  const [editing, setEditing] = useState('new');
  const current = gameweeks.find((g) => g.id === editing);
  const [selected, setSelected] = useState<string[]>([]);
  const [deadline, setDeadline] = useState('');
  const [dateVersion, setDateVersion] = useState(0);
  function choose(id: string): void {
    setEditing(id);
    const round = gameweeks.find((g) => g.id === id);
    setSelected(
      assignments.filter((a) => a.gameweekId === id).map((a) => a.fixtureId),
    );
    setDeadline(round?.deadline ?? '');
    setDateVersion((v) => v + 1);
    action.setPending(null);
  }
  function suggest(): void {
    setDateVersion((v) => v + 1);
    const kickoffs = fixtures
      .filter((f) => selected.includes(f.id))
      .map((f) => Date.parse(f.kickoff));
    if (kickoffs.length > 0)
      setDeadline(
        new Date(
          Math.min(...kickoffs) -
            competition.rules.deadlineOffsetMinutes * 60_000,
        ).toISOString(),
      );
    action.setPending(null);
  }
  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    action.review({
      kind: 'round',
      commandId: crypto.randomUUID(),
      competitionId: competition.id,
      expectedRevision: competition.revision,
      gameweekId: current?.id ?? crypto.randomUUID(),
      number: Number(form.get('number')),
      name: { ar: form.get('nameAr'), en: form.get('nameEn') },
      deadline,
      fixtureIds: selected,
      reason: form.get('reason'),
    });
  }
  const nextNumber = Math.max(0, ...gameweeks.map((g) => g.number)) + 1;
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h2>{ar ? 'الجولات والمباريات' : 'Gameweeks & fixtures'}</h2>
      </div>
      <div className="admin-form">
        <label>
          {ar ? 'الجولة' : 'Gameweek'}
          <select
            value={editing}
            onChange={(event) => {
              choose(event.target.value);
            }}
          >
            <option value="new">{ar ? 'جولة جديدة' : 'New gameweek'}</option>
            {gameweeks.map((g) => (
              <option
                key={g.id}
                value={g.id}
                disabled={
                  g.status !== 'upcoming' ||
                  Date.parse(g.deadline) <= Date.now()
                }
              >
                {g.name[locale]} — {g.status}
              </option>
            ))}
          </select>
        </label>
      </div>
      <form
        key={editing}
        className="admin-form"
        onSubmit={submit}
        onChange={() => {
          action.setPending(null);
        }}
      >
        <div className="form-pair">
          <label>
            {ar ? 'رقم الجولة' : 'Gameweek number'}
            <input
              name="number"
              type="number"
              min={1}
              max={200}
              required
              defaultValue={current?.number ?? nextNumber}
            />
          </label>
          <CairoDateTime
            key={`${editing}:${String(dateVersion)}`}
            locale={locale}
            label={ar ? 'موعد الإغلاق' : 'Deadline'}
            name="deadline"
            initialValue={deadline}
            onChange={setDeadline}
          />
        </div>
        <div className="form-pair">
          <label>
            {ar ? 'الاسم بالعربية' : 'Arabic gameweek name'}
            <input
              name="nameAr"
              dir="rtl"
              required
              defaultValue={current?.name.ar ?? `الجولة ${String(nextNumber)}`}
            />
          </label>
          <label>
            {ar ? 'الاسم بالإنجليزية' : 'English gameweek name'}
            <input
              name="nameEn"
              dir="ltr"
              required
              defaultValue={
                current?.name.en ?? `Gameweek ${String(nextNumber)}`
              }
            />
          </label>
        </div>
        <fieldset className="fixture-choices">
          <legend>
            {ar ? 'المباريات المسندة للجولة' : 'Assigned fixtures'}
          </legend>
          {fixtures.map((f) => (
            <label key={f.id}>
              <input
                type="checkbox"
                disabled={
                  ['live', 'suspended', 'finished', 'void'].includes(
                    f.status,
                  ) ||
                  (f.status !== 'postponed' &&
                    Date.parse(f.kickoff) <= Date.now())
                }
                checked={selected.includes(f.id)}
                onChange={(event) => {
                  setSelected(
                    event.target.checked
                      ? [...selected, f.id]
                      : selected.filter((id) => id !== f.id),
                  );
                }}
              />
              <span>
                {clubNames[f.homeClubId]} — {clubNames[f.awayClubId]}
              </span>
              <time>
                {new Date(f.kickoff).toLocaleString(ar ? 'ar-EG' : 'en-GB', {
                  timeZone: 'Africa/Cairo',
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </time>
              <small>
                {assignments.find((a) => a.fixtureId === f.id)
                  ? gameweeks.find(
                      (g) =>
                        g.id ===
                        assignments.find((a) => a.fixtureId === f.id)
                          ?.gameweekId,
                    )?.name[locale]
                  : ar
                    ? 'غير مسندة'
                    : 'Unassigned'}
              </small>
            </label>
          ))}
        </fieldset>
        <button type="button" className="button-outline" onClick={suggest}>
          {ar
            ? `اقتراح الموعد: قبل أول مباراة بـ ${String(competition.rules.deadlineOffsetMinutes)} دقيقة`
            : `Suggest deadline: ${String(competition.rules.deadlineOffsetMinutes)} minutes before first kickoff`}
        </button>
        <label>
          {ar
            ? 'سبب التغيير أو إعادة الإسناد'
            : 'Reason for change or reassignment'}
          <textarea name="reason" required minLength={5} maxLength={1000} />
        </label>
        <button type="submit" className="action-button" disabled={action.busy}>
          {ar ? 'مراجعة الجولة' : 'REVIEW GAMEWEEK'}
        </button>
      </form>
      <Confirmation locale={locale} action={action} />
    </section>
  );
}
