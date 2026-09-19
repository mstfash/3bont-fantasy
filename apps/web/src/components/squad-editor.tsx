'use client';
import Link from 'next/link';
import { InfoTip } from './help/info-tip';
import { playingSteps } from '@/lib/help/guide-rules';

import { useRef, useState } from 'react';
import { z } from 'zod';
import {
  entryCommandSchema,
  entrySchema,
  type Competition,
  type Entry,
  type Gameweek,
} from '@fantasy/contracts';
import {
  POSITIONS,
  activateChip,
  buildEntry,
  cancelChip,
  transferBatch,
  transferDeduction,
  validateRoster,
  type Chip,
  type EditingEntry,
} from '@fantasy/domain';
import type { Locale } from '@/lib/brand';
import { deadlineLabel } from '@/lib/locale';
import type { MarketPlayer } from '@/lib/market';
import { positionNames } from '@/lib/football-labels';
import { PlayerMarket } from './player-market';

const responseSchema = z.object({
  entry: entrySchema.optional(),
  code: z.string().optional(),
});
const chipNames: Record<Chip, { ar: string; en: string }> = {
  wildcard: { ar: 'وايلد كارد', en: 'Wildcard' },
  'free-hit': { ar: 'فري هيت', en: 'Free Hit' },
  'bench-boost': { ar: 'دكة البدلاء', en: 'Bench Boost' },
  'triple-captain': { ar: 'تريبل كابتن', en: 'Triple Captain' },
};

export function SquadEditor({
  locale,
  competition,
  gameweek,
  players,
  entry,
}: {
  readonly locale: Locale;
  readonly competition: Competition;
  readonly gameweek: Gameweek;
  readonly players: readonly MarketPlayer[];
  readonly entry: Entry | null;
}) {
  const ar = locale === 'ar';
  const rules = gameweek.rules;
  const captainMultiplier =
    entry?.state.chip === 'triple-captain'
      ? rules.gameweek.tripleCaptainMultiplier
      : rules.gameweek.captainMultiplier;
  const [starters, setStarters] = useState(
    entry?.state.roster.starterIds ?? [],
  );
  const [reserves, setReserves] = useState(
    entry?.state.roster.reserveIds ?? [],
  );
  const selected = [...starters, ...reserves];
  const [captain, setCaptain] = useState(
    entry?.state.roster.captaincy?.captainId ?? '',
  );
  const [vice, setVice] = useState(
    entry?.state.roster.captaincy?.viceCaptainId ?? '',
  );
  const [name, setName] = useState(entry?.name ?? '');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    command: Record<string, unknown>;
    state: EditingEntry;
    transfers: number;
  } | null>(null);
  const lastRequest = useRef<{ fingerprint: string; commandId: string } | null>(
    null,
  );
  const locked =
    gameweek.status !== 'upcoming' ||
    Date.parse(gameweek.deadline) <= Date.now();
  const pool = players.map((p) => ({
    footballerId: p.footballer.id,
    clubId: p.club.id,
    position: p.pool.position,
    price: p.pool.price,
  }));
  const selectedPlayers = pool.filter((p) => selected.includes(p.footballerId));
  const spent = selectedPlayers.reduce((sum, p) => sum + p.price, 0);
  const lineup = {
    starterIds: starters,
    reserveIds: reserves,
    captaincy: rules.squad.captaincyEnabled
      ? { captainId: captain, viceCaptainId: vice }
      : null,
  };
  const common = { competitionId: competition.id, gameweekId: gameweek.id };
  const existing = entry
    ? { ...common, entryId: entry.id, expectedRevision: entry.revision }
    : null;
  function player(id: string) {
    return players.find((p) => p.footballer.id === id);
  }
  function describeError(code: string): string {
    if (code === 'deadline-passed')
      return ar
        ? 'انتهى موعد الجولة. حدّث الصفحة للاطلاع على الجولة التالية.'
        : 'This gameweek has closed. Reload to see the next gameweek.';
    if (code === 'entry-changed' || code === 'price-changed')
      return ar
        ? 'تغير الفريق أو السعر. حدّث الصفحة وراجع التغييرات قبل التأكيد.'
        : 'Your squad or a price changed. Reload and review before confirming.';
    if (code === 'entry-limit')
      return ar
        ? 'وصلت للحد الأقصى للفرق في هذه البطولة.'
        : 'You have reached this competition’s squad limit.';
    if (code === 'registration-closed')
      return ar
        ? 'التسجيل غير مفتوح حالياً.'
        : 'Registration is not open right now.';
    if (code === 'sign-in-required' || code === 'access-denied')
      return ar
        ? 'سجّل الدخول بحسابك المؤكد للمتابعة.'
        : 'Sign in with your verified account to continue.';
    if (code === 'request-unconfirmed')
      return ar
        ? 'لم يتم تأكيد الطلب. أعد المحاولة بنفس الاختيارات؛ لن يُنفّذ الطلب مرتين.'
        : 'The request was not confirmed. Retry with the same choices; it will not be applied twice.';
    if (code.includes('chip'))
      return ar
        ? 'البطاقة غير متاحة لهذه الجولة أو هذا الفريق.'
        : 'That chip is not available for this squad or gameweek.';
    return ar
      ? 'راجع العدد والمراكز والميزانية وحد النادي والتشكيل والكابتن. لم تُحفظ التغييرات.'
      : 'Check squad size, positions, budget, club limit, lineup and captain. Changes have not been saved.';
  }
  function changeSelection(id: string): void {
    setPreview(null);
    setNotice('');
    if (selected.includes(id)) {
      setStarters(starters.filter((x) => x !== id));
      setReserves(reserves.filter((x) => x !== id));
    } else if (selected.length < rules.squad.squadSize) {
      setReserves([...reserves, id]);
    }
  }
  function arrange(): void {
    const formation = rules.squad.formations[0];
    if (!formation) return;
    const ids = POSITIONS.flatMap((p) =>
      selectedPlayers
        .filter((s) => s.position === p)
        .slice(0, formation[p])
        .map((s) => s.footballerId),
    );
    setStarters(ids);
    setReserves(selected.filter((id) => !ids.includes(id)));
    setCaptain(ids[0] ?? '');
    setVice(ids[1] ?? '');
    setPreview(null);
  }
  function review(): void {
    setNotice('');
    try {
      if (!entry) {
        const state = buildEntry(
          { players: selectedPlayers, ...lineup },
          rules.squad,
          rules.chipInventory,
        );
        setPreview({
          command: {
            ...common,
            kind: 'create',
            name,
            lineup,
            players: selected.map((id) => ({
              footballerId: id,
              priceRevision: player(id)?.pool.priceRevision,
            })),
          },
          state,
          transfers: 0,
        });
        return;
      }
      const previous = entry.state.roster.holdings.map((h) => h.footballerId);
      const outs = previous.filter((id) => !selected.includes(id));
      const ins = selected.filter((id) => !previous.includes(id));
      if (ins.length !== outs.length) throw new Error('squad-size');
      if (outs.length === 0) {
        const roster = { ...entry.state.roster, ...lineup };
        validateRoster(roster, pool, {
          ...rules.squad,
          clubCap: rules.squad.squadSize,
        });
        setPreview({
          command: { ...existing, kind: 'lineup', lineup },
          state: { ...entry.state, roster },
          transfers: 0,
        });
      } else {
        const transfers = outs.map((out, index) => {
          const incoming = ins[index];
          if (!incoming) throw new Error('squad-size');
          return { out, in: incoming };
        });
        const state = transferBatch(
          entry.state,
          transfers,
          lineup,
          pool,
          rules.squad,
          rules.transfer,
        );
        setPreview({
          command: {
            ...existing,
            kind: 'transfer',
            lineup,
            transfers,
            quotes: [...outs, ...ins].map((id) => ({
              footballerId: id,
              priceRevision: player(id)?.pool.priceRevision,
            })),
          },
          state,
          transfers: transfers.length,
        });
      }
    } catch {
      setNotice(describeError('invalid-squad'));
    }
  }
  async function confirm(): Promise<void> {
    if (!preview) return;
    setBusy(true);
    setNotice('');
    try {
      const fingerprint = JSON.stringify(preview.command);
      if (lastRequest.current?.fingerprint !== fingerprint)
        lastRequest.current = { fingerprint, commandId: crypto.randomUUID() };
      const command = entryCommandSchema.parse({
        ...preview.command,
        commandId: lastRequest.current.commandId,
      });
      const response = await fetch('/api/v1/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      const payload: unknown = await response.json();
      const result = responseSchema.parse(payload);
      if (!response.ok || !result.entry) {
        setNotice(describeError(result.code ?? 'request-unconfirmed'));
        return;
      }
      window.location.assign(`/${locale}/entries/${result.entry.id}`);
    } catch (error) {
      setNotice(
        describeError(
          error instanceof z.ZodError ? 'invalid-squad' : 'request-unconfirmed',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  function reviewChip(chip: Chip | null): void {
    if (!entry) return;
    try {
      setPreview({
        command: { ...existing, kind: 'chip', chip },
        state:
          chip === null
            ? cancelChip(entry.state)
            : activateChip(entry.state, chip, rules.enabledChips),
        transfers: 0,
      });
      setNotice('');
    } catch {
      setNotice(describeError('chip-unavailable'));
    }
  }
  return (
    <div className="squad-editor">
      <nav className="guide-links">
        <Link
          href={`/${locale}/how-to-play?competition=${competition.slug}&gameweek=${gameweek.id}`}
        >
          {ar ? 'طريقة اللعب لهذه الجولة' : 'How to play this gameweek'}
        </Link>
        <Link
          href={`/${locale}/playbook?competition=${competition.slug}&gameweek=${gameweek.id}`}
        >
          {ar ? 'دليل الجولة' : 'Gameweek playbook'}
        </Link>
        <InfoTip
          locale={locale}
          label={ar ? 'قواعد الفريق' : 'Squad rules'}
          text={playingSteps(rules, locale).slice(0, 3).join(' ')}
        />
      </nav>
      <div className="squad-deadline">
        <strong>{gameweek.name[locale]}</strong>
        <span>
          {deadlineLabel(gameweek.deadline, locale)} ·{' '}
          {ar ? 'القاهرة' : 'Cairo'}
        </span>
        <span>
          {locked
            ? ar
              ? 'مغلقة'
              : 'Locked'
            : ar
              ? 'موعد إغلاق الجولة'
              : 'Gameweek deadline'}
        </span>
      </div>
      {notice && (
        <p role="alert" className="editor-notice">
          {notice}
        </p>
      )}
      <div className="editor-grid">
        <section
          className="squad-board"
          aria-label={ar ? 'تشكيل الفريق' : 'Your squad'}
        >
          {!entry && (
            <label className="squad-name">
              {ar ? 'اسم الفريق' : 'Squad name'}
              <input
                value={name}
                minLength={2}
                maxLength={60}
                onChange={(e) => {
                  setName(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
          )}
          <div className="squad-metrics">
            <div>
              <strong>
                {selected.length}/{rules.squad.squadSize}
              </strong>
              <span>{ar ? 'اللاعبون' : 'Players'}</span>
            </div>
            <div>
              <strong>
                {(
                  (entry
                    ? entry.state.roster.bank
                    : rules.squad.startingBudget - spent) / 10
                ).toFixed(1)}
              </strong>
              <span>
                {entry
                  ? ar
                    ? 'الرصيد المحفوظ'
                    : 'Saved bank'
                  : ar
                    ? 'المتبقي'
                    : 'Remaining'}
              </span>
            </div>
            <div>
              <strong>
                {entry?.state.permanentBaseline
                  ? entry.state.freeTransfers
                  : '∞'}
              </strong>
              <span>{ar ? 'انتقالات مجانية' : 'Free transfers'}</span>
            </div>
          </div>
          <div className="squad-pitch">
            {[...POSITIONS].reverse().map((p) => (
              <div className="squad-pitch-row" key={p}>
                {starters
                  .filter((id) => player(id)?.pool.position === p)
                  .map((id) => (
                    <div className="pitch-player" key={id}>
                      <span
                        className="shirt"
                        style={{ color: player(id)?.club.color }}
                        aria-hidden="true"
                      >
                        ▰
                      </span>
                      <strong>{player(id)?.footballer.name[locale]}</strong>
                      <span>
                        {captain === id
                          ? ar
                            ? `كابتن ×${String(captainMultiplier)}`
                            : `Captain ×${String(captainMultiplier)}`
                          : vice === id
                            ? ar
                              ? 'نائب الكابتن'
                              : 'Vice captain'
                            : player(id)?.club.shortName}
                      </span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
          <button
            className="button-outline"
            type="button"
            disabled={locked || busy}
            onClick={arrange}
          >
            {ar ? 'ترتيب التشكيل مبدئياً' : 'Arrange an initial lineup'}
          </button>
          <p className="editor-hint">
            {ar
              ? 'اختر الأساسيين أدناه، ورتّب الدكة بأزرار التقديم والتأخير.'
              : 'Choose starters below. Use the arrows to set your bench priority.'}
          </p>
          <fieldset disabled={locked || busy}>
            <legend>{ar ? 'الأساسيون والبدلاء' : 'Starters & bench'}</legend>
            {selected.map((id) => (
              <label className="lineup-player" key={id}>
                <input
                  type="checkbox"
                  checked={starters.includes(id)}
                  onChange={() => {
                    setPreview(null);
                    if (starters.includes(id)) {
                      setStarters(starters.filter((x) => x !== id));
                      setReserves([...reserves, id]);
                    } else {
                      setStarters([...starters, id]);
                      setReserves(reserves.filter((x) => x !== id));
                    }
                  }}
                />
                <span>{player(id)?.footballer.name[locale]}</span>
                <small>
                  {positionNames[player(id)?.pool.position ?? 'GK'][locale]}
                </small>
              </label>
            ))}
            {reserves.length > 0 && (
              <ol className="bench-order">
                {reserves.map((id, index) => (
                  <li key={id}>
                    <span>{player(id)?.footballer.name[locale]}</span>
                    {([-1, 1] as const).map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        aria-label={`${ar ? 'تحريك' : 'Move'} ${player(id)?.footballer.name[locale] ?? ''} ${delta < 0 ? (ar ? 'لأعلى' : 'up') : ar ? 'لأسفل' : 'down'}`}
                        disabled={
                          index + delta < 0 || index + delta >= reserves.length
                        }
                        onClick={() => {
                          const reordered = [...reserves];
                          const other = reordered[index + delta];
                          if (!other) return;
                          reordered[index] = other;
                          reordered[index + delta] = id;
                          setReserves(reordered);
                          setPreview(null);
                        }}
                      >
                        {delta < 0 ? '↑' : '↓'}
                      </button>
                    ))}
                  </li>
                ))}
              </ol>
            )}
            {rules.squad.captaincyEnabled && (
              <div className="captain-selects">
                {(['captain', 'vice'] as const).map((role) => (
                  <label key={role}>
                    {role === 'captain'
                      ? ar
                        ? 'الكابتن'
                        : 'Captain'
                      : ar
                        ? 'نائب الكابتن'
                        : 'Vice captain'}
                    <select
                      value={role === 'captain' ? captain : vice}
                      onChange={(e) => {
                        if (role === 'captain') setCaptain(e.target.value);
                        else setVice(e.target.value);
                        setPreview(null);
                      }}
                    >
                      <option value="">
                        {ar ? 'اختر لاعباً' : 'Select a player'}
                      </option>
                      {starters.map((id) => (
                        <option key={id} value={id}>
                          {player(id)?.footballer.name[locale]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <button
            type="button"
            className="action-button"
            disabled={
              locked || busy || selected.length !== rules.squad.squadSize
            }
            onClick={review}
          >
            {ar ? 'مراجعة الاختيارات' : 'REVIEW CHANGES'}
            <span>↗</span>
          </button>
        </section>
        <PlayerMarket
          locale={locale}
          players={players}
          selected={selected}
          rules={rules.squad}
          disabled={locked || busy}
          onToggle={changeSelection}
        />
      </div>
      {entry && (
        <section className="chips-panel">
          <h2>{ar ? 'بطاقاتك' : 'YOUR CHIPS'}</h2>
          <p>
            {ar
              ? 'تسري على الاختيارات المحفوظة. يتم استهلاك البطاقة عند إغلاق الجولة.'
              : 'Applies to your saved squad. A chip is consumed when the gameweek locks.'}
          </p>
          <div className="chip-grid">
            {rules.enabledChips.map((chip) => (
              <button
                className={
                  entry.state.chip === chip ? 'chip-card active' : 'chip-card'
                }
                key={chip}
                type="button"
                disabled={
                  locked ||
                  busy ||
                  (entry.state.chip !== chip &&
                    (entry.state.chip !== null ||
                      entry.state.inventory[chip] === 0))
                }
                onClick={() => {
                  reviewChip(entry.state.chip === chip ? null : chip);
                }}
              >
                <strong>{chipNames[chip][locale]}</strong>
                <span>
                  {entry.state.chip === chip
                    ? ar
                      ? 'إلغاء — مراجعة الأثر'
                      : 'Cancel — review impact'
                    : `${String(entry.state.inventory[chip])} ${ar ? 'متاح' : 'available'}`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {preview && (
        <section
          className="change-preview"
          aria-label={ar ? 'مراجعة التغييرات' : 'Review changes'}
        >
          <h2>{ar ? 'أكد قرارك.' : 'CONFIRM YOUR CALL.'}</h2>
          <dl>
            <div>
              <dt>
                {ar ? 'الانتقالات في هذه العملية' : 'Transfers in this change'}
              </dt>
              <dd>{preview.transfers}</dd>
            </div>
            <div>
              <dt>{ar ? 'الرصيد بعد التنفيذ' : 'Bank after this change'}</dt>
              <dd>{(preview.state.roster.bank / 10).toFixed(1)}</dd>
            </div>
            <div>
              <dt>
                {ar
                  ? 'إجمالي خصم نقاط الجولة'
                  : 'Total gameweek point deduction'}
              </dt>
              <dd>
                −{transferDeduction(preview.state, rules.transfer) / 1000}
              </dd>
            </div>
            <div>
              <dt>{ar ? 'البطاقة النشطة' : 'Active chip'}</dt>
              <dd>
                {preview.state.chip
                  ? chipNames[preview.state.chip][locale]
                  : ar
                    ? 'لا توجد'
                    : 'None'}
              </dd>
            </div>
          </dl>
          <p>
            {ar
              ? 'الأسعار والموعد النهائي يُراجعان عند التأكيد. لم يتم الحفظ بعد.'
              : 'Prices and deadline are checked again when you confirm. Nothing has been saved yet.'}
          </p>
          <div>
            <button
              type="button"
              className="action-button"
              disabled={busy || locked}
              onClick={() => {
                void confirm();
              }}
            >
              {busy
                ? ar
                  ? 'جاري التأكيد…'
                  : 'Confirming…'
                : ar
                  ? 'تأكيد وحفظ'
                  : 'CONFIRM & SAVE'}
            </button>
            <button
              type="button"
              className="button-outline"
              disabled={busy}
              onClick={() => {
                setPreview(null);
              }}
            >
              {ar ? 'عودة للتعديل' : 'Keep editing'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
