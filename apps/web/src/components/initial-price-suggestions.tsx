'use client';
import { useState, type SubmitEvent } from 'react';
import {
  initialPricePolicySchema,
  initialPriceSourceText,
  type Competition,
  type Footballer,
  type InitialPriceReview,
} from '@fantasy/contracts';
import {
  POSITIONS,
  assessPlayerPool,
  fantasyPrice,
  fantasyTicks,
  suggestInitialPrices,
  type Position,
  type InitialPriceSuggestion,
} from '@fantasy/domain';
import type { Locale } from '@/lib/brand';
import { formText } from './groups/reviewed-form';
import { positionNames } from '@/lib/football-labels';
type PoolItem = {
  readonly footballerId: string;
  readonly position: Position;
  readonly price: number;
  readonly selectable: boolean;
  readonly manuallyPinned: boolean;
};
export function InitialPriceSuggestions({
  sourceAsOf,
  locale,
  competition,
  footballers,
  items,
  onStage,
}: {
  readonly sourceAsOf: string;
  readonly locale: Locale;
  readonly competition: Competition;
  readonly footballers: readonly Footballer[];
  readonly items: readonly PoolItem[];
  readonly onStage: (
    prices: ReadonlyMap<string, number>,
    review: InitialPriceReview,
  ) => void;
}) {
  const ar = locale === 'ar';
  const [clockOrigin] = useState(() => ({
    at: Date.parse(sourceAsOf),
    tick: performance.now(),
  }));
  const [report, setReport] = useState<{
      review: InitialPriceReview;
      suggestions: readonly InitialPriceSuggestion[];
      signature: string;
    } | null>(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const signature = JSON.stringify(items),
    validReport = report?.signature === signature ? report : null;
  async function generate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice('');
    setReport(null);
    try {
      if (items.some((p) => !Number.isSafeInteger(p.price) || p.price < 0))
        throw new Error('invalid-draft-price');
      const bound = (position: Position) => ({
        minimum: fantasyPrice(formText(form, `${position}-min`)),
        maximum: fantasyPrice(formText(form, `${position}-max`)),
      });
      const policy = initialPricePolicySchema.parse({
        currency: form.get('currency'),
        staleDays: Number(form.get('staleDays')),
        bounds: {
          GK: bound('GK'),
          DEF: bound('DEF'),
          MID: bound('MID'),
          FWD: bound('FWD'),
        },
      });
      if (
        Object.values(policy.bounds).some(
          (b) =>
            b.minimum < competition.rules.pricing.minimum ||
            b.maximum > competition.rules.pricing.maximum,
        )
      )
        throw new Error('bounds');
      const now = new Date(
          clockOrigin.at + performance.now() - clockOrigin.tick,
        ),
        byId = new Map(footballers.map((p) => [p.id, p])),
        suggestions = suggestInitialPrices(
          items.map((p) => ({
            footballerId: p.footballerId,
            position: p.position,
            valuation: byId.get(p.footballerId)?.valuation ?? null,
          })),
          policy,
          now,
        );
      const bytes = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(initialPriceSourceText(footballers)),
        ),
        sourceFingerprint = Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
      setReport({
        review: {
          policy,
          positions: items.map((p) => ({
            footballerId: p.footballerId,
            position: p.position,
          })),
          asOf: now.toISOString(),
          sourceFingerprint,
        },
        suggestions,
        signature,
      });
    } catch {
      setNotice(
        ar
          ? 'راجع العملة وحدود الأسعار؛ يجب أن تبقى ضمن حدود البطولة.'
          : 'Check the currency and price bounds; they must stay within competition limits.',
      );
    } finally {
      setBusy(false);
    }
  }
  const suggestions = new Map(
    validReport?.suggestions.map((p) => [p.footballerId, p.price]),
  );
  const staged = items.map((p) => ({
    ...p,
    price: p.manuallyPinned
      ? p.price
      : (suggestions.get(p.footballerId) ?? p.price),
  }));
  const byId = new Map(footballers.map((p) => [p.id, p]));
  const readiness = validReport
    ? assessPlayerPool(
        staged
          .filter((p) => p.selectable)
          .map((p) => ({
            footballerId: p.footballerId,
            clubId: byId.get(p.footballerId)?.clubId ?? '',
            position: p.position,
            price: fantasyTicks(p.price),
          })),
        competition.rules.squad,
      )
    : null;
  const reasons: Record<InitialPriceSuggestion['reason'], string> = {
    suggested: ar ? 'اقتراح' : 'Suggested',
    'missing-valuation': ar ? 'لا يوجد تقييم' : 'No valuation',
    'display-rights-unverified': ar
      ? 'حق العرض غير مؤكد'
      : 'Display rights unverified',
    'different-currency': ar ? 'عملة مختلفة' : 'Different currency',
    'stale-valuation': ar ? 'تقييم قديم' : 'Stale valuation',
    'future-valuation': ar ? 'تاريخ مستقبلي' : 'Future valuation',
    'invalid-valuation': ar ? 'تقييم غير صالح' : 'Invalid valuation',
  };
  return (
    <section className="admin-panel">
      <h2>{ar ? 'اقتراح أسعار البداية' : 'SUGGEST STARTING PRICES'}</h2>
      <p>
        {ar
          ? 'للبطولات المسودة فقط. نقارن التقييمات الحديثة بنفس العملة داخل كل مركز. الأسعار المثبّتة والقيم غير المتاحة تبقى كما هي، ويمكن تعديل كل اقتراح قبل النشر.'
          : 'Draft competitions only. Compare recent valuations in the same currency within each position. Pinned prices and players without usable valuations keep their draft prices. Every suggestion can be adjusted before publication.'}
      </p>
      <form
        className="admin-form"
        onSubmit={(event) => {
          void generate(event);
        }}
        onChange={() => {
          setReport(null);
        }}
      >
        <div className="form-pair">
          <label>
            {ar ? 'عملة التقييم' : 'Valuation currency'}
            <input
              name="currency"
              defaultValue="EUR"
              pattern="[A-Z]{3}"
              maxLength={3}
              required
            />
          </label>
          <label>
            {ar ? 'أقصى عمر للتقييم بالأيام' : 'Maximum valuation age in days'}
            <input
              name="staleDays"
              type="number"
              min={1}
              max={3650}
              defaultValue={90}
              required
            />
          </label>
        </div>
        {POSITIONS.map((position) => (
          <div className="form-pair" key={position}>
            <label>
              {`${positionNames[position][locale]} · ${ar ? 'أقل سعر' : 'Minimum price'}`}
              <input
                name={`${position}-min`}
                type="number"
                step="0.1"
                min={competition.rules.pricing.minimum / 10}
                max={competition.rules.pricing.maximum / 10}
                defaultValue={competition.rules.pricing.minimum / 10}
                required
              />
            </label>
            <label>
              {`${positionNames[position][locale]} · ${ar ? 'أعلى سعر' : 'Maximum price'}`}
              <input
                name={`${position}-max`}
                type="number"
                step="0.1"
                min={competition.rules.pricing.minimum / 10}
                max={competition.rules.pricing.maximum / 10}
                defaultValue={competition.rules.pricing.maximum / 10}
                required
              />
            </label>
          </div>
        ))}
        <button
          type="submit"
          className="button-outline"
          disabled={busy || items.length === 0}
        >
          {ar ? 'حساب الاقتراحات' : 'Calculate suggestions'}
        </button>
      </form>
      <p role="status">{notice}</p>
      {validReport && (
        <>
          <p>
            {readiness?.ready
              ? ar
                ? `يوجد فريق قانوني بتكلفة ${String(Number(readiness.minimumCost) / 10)}.`
                : `A legal squad exists at a cost of ${String(Number(readiness.minimumCost) / 10)}.`
              : ar
                ? 'الأسعار المقترحة لا تثبت وجود فريق قانوني ضمن الميزانية. راجع المجموعة والحدود.'
                : 'These prices do not establish an affordable legal squad. Review the pool and bounds.'}
          </p>
          <p>
            {ar
              ? 'هذا فحص إمكانية واحد، وليس شهادة توازن اقتصادي أو موافقة على التسعير التلقائي.'
              : 'This is one feasibility check, not a balance assessment or approval for automatic pricing.'}
          </p>
          <div className="admin-table-scroll pool-scroll">
            <table>
              <thead>
                <tr>
                  <th>{ar ? 'اللاعب' : 'Footballer'}</th>
                  <th>{ar ? 'السعر الحالي' : 'Draft price'}</th>
                  <th>{ar ? 'الاقتراح' : 'Suggestion'}</th>
                  <th>{ar ? 'السبب' : 'Reason'}</th>
                </tr>
              </thead>
              <tbody>
                {validReport.suggestions.map((p) => {
                  const item = items.find(
                    (i) => i.footballerId === p.footballerId,
                  );
                  return (
                    <tr key={p.footballerId}>
                      <td>{byId.get(p.footballerId)?.name[locale]}</td>
                      <td>{item ? item.price / 10 : '—'}</td>
                      <td>{p.price === null ? '—' : p.price / 10}</td>
                      <td>
                        {item?.manuallyPinned
                          ? ar
                            ? 'مثبّت — لن يتغيّر'
                            : 'Pinned — retained'
                          : reasons[p.reason]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="button-outline"
            onClick={() => {
              onStage(
                new Map(staged.map((p) => [p.footballerId, p.price])),
                validReport.review,
              );
              setReport(null);
              setNotice(
                ar
                  ? 'نُقلت الاقتراحات إلى المحرر. راجع الأسعار والسبب ثم اعتمد المجموعة.'
                  : 'Suggestions moved to the editor. Review the prices and reason, then approve the pool.',
              );
            }}
          >
            {ar ? 'نقل الاقتراحات للمراجعة' : 'Stage suggestions for review'}
          </button>
        </>
      )}
    </section>
  );
}
