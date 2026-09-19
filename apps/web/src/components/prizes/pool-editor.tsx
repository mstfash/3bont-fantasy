'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  prizeCommandSchema,
  prizeCommandResultSchema,
  type PrizePool,
  type Gameweek,
  type LeagueGroup,
} from '@fantasy/contracts';
import { currencyAmountToMinor, currencyMinorToDecimal } from '@fantasy/domain';
import type { Locale } from '@/lib/brand';
import { ReviewedCommandForm } from '../reviewed-command-form';
import { formText } from '../groups/reviewed-form';
import { CairoDateTime } from '../cairo-date-time';
import '@/styles/groups.css';
interface RewardDraft {
  id: string;
  kind: 'cash' | 'goods';
  amount: string;
  ar: string;
  en: string;
  equivalent: string;
}
export function PrizePoolEditor({
  locale,
  competitionId,
  rounds,
  groups,
  pool,
}: {
  readonly locale: Locale;
  readonly competitionId: string;
  readonly rounds: readonly Gameweek[];
  readonly groups: readonly LeagueGroup[];
  readonly pool: PrizePool | null;
}) {
  const ar = locale === 'ar',
    router = useRouter();
  const [currency, setCurrency] = useState(pool?.currency ?? 'EGP');
  const [rewards, setRewards] = useState<RewardDraft[]>(
    pool
      ? pool.places.map((p, i) => ({
          id: String(i),
          kind: p.kind,
          amount:
            p.kind === 'cash'
              ? currencyMinorToDecimal(p.amountMinor, pool.currency)
              : '',
          ar: p.kind === 'goods' ? p.name.ar : '',
          en: p.kind === 'goods' ? p.name.en : '',
          equivalent:
            p.kind === 'goods' && p.cashEquivalentMinor !== null
              ? currencyMinorToDecimal(p.cashEquivalentMinor, pool.currency)
              : '',
        }))
      : [
          {
            id: 'first',
            kind: 'cash',
            amount: '',
            ar: '',
            en: '',
            equivalent: '',
          },
        ],
  );
  function update(id: string, change: Partial<RewardDraft>): void {
    setRewards((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...change } : r)),
    );
  }
  const first =
    pool?.firstGameweekId ??
    rounds.find((r) => r.status === 'upcoming')?.id ??
    '';
  return (
    <ReviewedCommandForm
      locale={locale}
      label={ar ? 'مراجعة شروط الجائزة' : 'Review prize terms'}
      endpoint="/api/v1/admin/prizes"
      commandSchema={prizeCommandSchema}
      resultSchema={prizeCommandResultSchema}
      onSaved={(result) => {
        router.push(`/${locale}/admin/prizes/${result.poolId}`);
        router.refresh();
      }}
      makeCommand={(form) => ({
        kind: pool ? 'update' : 'create',
        commandId: crypto.randomUUID(),
        competitionId,
        ...(pool ? { poolId: pool.id, expectedRevision: pool.revision } : {}),
        name: { ar: formText(form, 'ar'), en: formText(form, 'en') },
        description: {
          ar: formText(form, 'termsAr'),
          en: formText(form, 'termsEn'),
        },
        firstGameweekId: formText(form, 'first'),
        lastGameweekId: formText(form, 'last'),
        groupId: formText(form, 'group') || null,
        eligibilityCutoff: formText(form, 'cutoff'),
        currency,
        places: rewards.map((r) =>
          r.kind === 'cash'
            ? {
                kind: 'cash',
                amountMinor: currencyAmountToMinor(r.amount, currency),
              }
            : {
                kind: 'goods',
                name: { ar: r.ar, en: r.en },
                cashEquivalentMinor: r.equivalent
                  ? currencyAmountToMinor(r.equivalent, currency)
                  : null,
              },
        ),
        oneAwardPerAccount: form.get('one') === 'on',
        reason: formText(form, 'reason'),
      })}
    >
      <div className="form-pair">
        <label>
          {ar ? 'اسم الجائزة بالعربية' : 'Arabic prize name'}
          <input
            name="ar"
            required
            maxLength={200}
            defaultValue={pool?.name.ar ?? ''}
          />
        </label>
        <label>
          {ar ? 'اسم الجائزة بالإنجليزية' : 'English prize name'}
          <input
            name="en"
            required
            maxLength={200}
            defaultValue={pool?.name.en ?? ''}
          />
        </label>
      </div>
      <div className="form-pair">
        <label>
          {ar ? 'الشروط بالعربية' : 'Arabic prize terms'}
          <textarea
            name="termsAr"
            required
            maxLength={5000}
            defaultValue={pool?.description.ar ?? ''}
          />
        </label>
        <label>
          {ar ? 'الشروط بالإنجليزية' : 'English prize terms'}
          <textarea
            name="termsEn"
            required
            maxLength={5000}
            defaultValue={pool?.description.en ?? ''}
          />
        </label>
      </div>
      <label>
        {ar ? 'نطاق المنافسة' : 'Contest scope'}
        <select
          name="group"
          defaultValue={pool?.groupId ?? ''}
          aria-label={ar ? 'نطاق المنافسة' : 'Contest scope'}
        >
          <option value="">
            {ar ? 'كل فرق البطولة المؤهلة' : 'All eligible competition squads'}
          </option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-pair">
        <label>
          {ar ? 'الجولة الأولى' : 'First scoring round'}
          <select
            name="first"
            defaultValue={first}
            required
            aria-label={ar ? 'الجولة الأولى' : 'First scoring round'}
          >
            {rounds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name[locale]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {ar ? 'الجولة الأخيرة' : 'Last scoring round'}
          <select
            name="last"
            defaultValue={pool?.lastGameweekId ?? first}
            required
            aria-label={ar ? 'الجولة الأخيرة' : 'Last scoring round'}
          >
            {rounds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name[locale]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <CairoDateTime
        locale={locale}
        label={ar ? 'موعد إغلاق الأهلية' : 'Eligibility cutoff'}
        name="cutoff"
        initialValue={
          pool?.eligibilityCutoff ??
          rounds.find((r) => r.id === first)?.deadline ??
          ''
        }
      />
      <label className="confirmation-check">
        <input
          name="one"
          type="checkbox"
          defaultChecked={pool?.oneAwardPerAccount ?? true}
        />
        {ar
          ? 'جائزة واحدة لكل حساب، باستخدام أفضل فريق مؤهل'
          : 'One award per account, using its best eligible squad'}
      </label>
      <label>
        {ar ? 'العملة' : 'Currency'}
        <input
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value.toUpperCase());
          }}
          pattern="[A-Z]{3}"
          maxLength={3}
          required
          dir="ltr"
        />
      </label>
      {rewards.map((r, index) => (
        <fieldset key={r.id} className="prize-reward">
          <legend>
            {ar ? `المركز ${String(index + 1)}` : `Place ${String(index + 1)}`}
          </legend>
          <label>
            {ar ? 'نوع الجائزة' : 'Reward type'}
            <select
              value={r.kind}
              aria-label={`${ar ? 'نوع الجائزة' : 'Reward type'} ${String(index + 1)}`}
              onChange={(e) => {
                update(r.id, {
                  kind: e.target.value === 'goods' ? 'goods' : 'cash',
                });
              }}
            >
              <option value="cash">{ar ? 'نقدية' : 'Cash'}</option>
              <option value="goods">{ar ? 'عينية' : 'Goods'}</option>
            </select>
          </label>
          {r.kind === 'cash' ? (
            <label>
              {ar ? 'المبلغ' : 'Amount'}
              <input
                value={r.amount}
                onChange={(e) => {
                  update(r.id, { amount: e.target.value });
                }}
                inputMode="decimal"
                required
                aria-label={`${ar ? 'المبلغ' : 'Amount'} ${String(index + 1)}`}
              />
            </label>
          ) : (
            <>
              <label>
                {ar ? 'وصف الجائزة بالعربية' : 'Arabic item name'}
                <input
                  value={r.ar}
                  onChange={(e) => {
                    update(r.id, { ar: e.target.value });
                  }}
                  required
                />
              </label>
              <label>
                {ar ? 'وصف الجائزة بالإنجليزية' : 'English item name'}
                <input
                  value={r.en}
                  onChange={(e) => {
                    update(r.id, { en: e.target.value });
                  }}
                  required
                />
              </label>
              <label>
                {ar
                  ? 'بديل نقدي عند التعادل (اختياري)'
                  : 'Cash equivalent for ties (optional)'}
                <input
                  value={r.equivalent}
                  onChange={(e) => {
                    update(r.id, { equivalent: e.target.value });
                  }}
                  inputMode="decimal"
                />
              </label>
              <p>
                {ar
                  ? 'بدون بديل معلن، التعادل يمنع الاعتماد حتى يُحل وفق الشروط.'
                  : 'Without a published equivalent, a tie blocks approval until resolved under the terms.'}
              </p>
            </>
          )}
          {rewards.length > 1 && (
            <button
              className="button-outline"
              type="button"
              onClick={() => {
                setRewards((rows) => rows.filter((row) => row.id !== r.id));
              }}
            >
              {ar ? 'حذف المركز' : 'Remove place'}
            </button>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="button-outline"
        disabled={rewards.length >= 100}
        onClick={() => {
          setRewards((rows) => [
            ...rows,
            {
              id: crypto.randomUUID(),
              kind: 'cash',
              amount: '',
              ar: '',
              en: '',
              equivalent: '',
            },
          ]);
        }}
      >
        {ar ? 'إضافة مركز' : 'Add place'}
      </button>
      <p>
        {ar
          ? 'تُجمع جوائز مراكز التعادل وتُقسّم بالتساوي مع حفظ الباقي. أهلية المجموعات تُحتسب عند الموعد المحدد، وتظل النتائج خاضعة للتحقق من الحساب والبيانات.'
          : 'Tied places pool their prizes and split equally, retaining any residue. Group membership is assessed at the cutoff; awards remain subject to account and result verification.'}
      </p>
      <label>
        {ar ? 'سبب الحفظ' : 'Reason for saving'}
        <textarea name="reason" required minLength={5} maxLength={1000} />
      </label>
    </ReviewedCommandForm>
  );
}
