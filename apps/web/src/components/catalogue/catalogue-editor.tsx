'use client';
import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  catalogueCommandSchema,
  type CatalogueCommand,
  type Club,
} from '@fantasy/contracts';
import { currencyAmountToMinor, POSITIONS } from '@fantasy/domain';
import { commandError } from '@/lib/command-errors';
import type { Locale } from '@/lib/brand';
import { positionNames } from '@/lib/football-labels';
import { CairoDateTime } from '../cairo-date-time';
import { ValuationFields } from './valuation-fields';
export function CatalogueEditor({
  locale,
  initial,
  clubs,
}: {
  readonly locale: Locale;
  readonly initial: CatalogueCommand;
  readonly clubs: readonly Club[];
}) {
  const ar = locale === 'ar';
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<CatalogueCommand | null>(null);
  const entity =
    initial.kind === 'season'
      ? initial.season
      : initial.kind === 'club'
        ? initial.club
        : initial.footballer;
  function review(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const str = (name: string): string => {
      const value = form.get(name);
      return typeof value === 'string' ? value : '';
    };
    const name = { ar: str('nameAr'), en: str('nameEn') };
    try {
      const common = {
        ...initial,
        commandId: crypto.randomUUID(),
        reason: str('reason'),
      };
      const input =
        initial.kind === 'season'
          ? {
              ...common,
              kind: 'season',
              season: {
                ...initial.season,
                name,
                startsAt: str('startsAt'),
                endsAt: str('endsAt'),
                synthetic: form.has('synthetic'),
              },
            }
          : initial.kind === 'club'
            ? {
                ...common,
                kind: 'club',
                club: {
                  ...initial.club,
                  name,
                  shortName: str('shortName'),
                  color: str('color'),
                },
              }
            : {
                ...common,
                kind: 'footballer',
                footballer: {
                  ...initial.footballer,
                  name,
                  clubId: str('clubId'),
                  defaultPosition: str('position'),
                  status: str('status'),
                  valuation: form.has('hasValuation')
                    ? {
                        amountMinor: currencyAmountToMinor(
                          str('amount'),
                          str('currency'),
                        ),
                        currency: str('currency'),
                        asOf: str('asOf'),
                        sourceName: str('sourceName'),
                        sourceUrl: str('sourceUrl'),
                        licensedForDisplay: form.has('licensedForDisplay'),
                      }
                    : null,
                },
              };
      setPending(catalogueCommandSchema.parse(input));
      setNotice('');
    } catch (error) {
      setNotice(
        error instanceof RangeError
          ? ar
            ? 'راجع المبلغ وعدد المنازل العشرية للعملة.'
            : error.message
          : ar
            ? 'راجع الحقول المطلوبة وصحة التواريخ والروابط.'
            : 'Check required fields, dates and source links.',
      );
    }
  }
  async function save(): Promise<void> {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/catalogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const code = z.object({ code: z.string() }).safeParse(body);
        setNotice(
          commandError(
            code.success ? code.data.code : 'request-unconfirmed',
            locale,
          ),
        );
        return;
      }
      const result = z
        .object({ entity: z.object({ id: z.uuid() }) })
        .parse(body);
      router.push(
        `/${locale}/admin/catalogue?season=${initial.kind === 'season' ? result.entity.id : initial.kind === 'club' ? initial.club.seasonId : initial.footballer.seasonId}`,
      );
      router.refresh();
    } catch {
      setNotice(
        ar
          ? 'تعذّر تأكيد الحفظ. أعد المحاولة بنفس الطلب.'
          : 'Save was not confirmed. Retry the same request.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="admin-form"
      onSubmit={review}
      onChange={() => {
        setPending(null);
      }}
    >
      <div className="form-pair">
        <label>
          {ar ? 'الاسم بالعربية' : 'Arabic name'}
          <input
            name="nameAr"
            required
            maxLength={160}
            defaultValue={entity.name.ar}
            dir="rtl"
          />
        </label>
        <label>
          {ar ? 'الاسم بالإنجليزية' : 'English name'}
          <input
            name="nameEn"
            required
            maxLength={160}
            defaultValue={entity.name.en}
            dir="ltr"
          />
        </label>
      </div>
      {initial.kind === 'season' && (
        <>
          <div className="form-pair">
            <CairoDateTime
              locale={locale}
              name="startsAt"
              label={ar ? 'بداية الموسم' : 'Season starts'}
              initialValue={initial.season.startsAt}
            />
            <CairoDateTime
              locale={locale}
              name="endsAt"
              label={ar ? 'نهاية الموسم' : 'Season ends'}
              initialValue={initial.season.endsAt}
            />
          </div>
          <label className="confirmation-check">
            <input
              type="checkbox"
              name="synthetic"
              defaultChecked={initial.season.synthetic}
              disabled={initial.expectedFingerprint !== null}
            />
            {ar
              ? 'موسم تجريبي ببيانات خيالية'
              : 'Demonstration season with fictional data'}
          </label>
          {initial.expectedFingerprint !== null && initial.season.synthetic && (
            <input name="synthetic" type="hidden" value="true" />
          )}
        </>
      )}
      {initial.kind === 'club' && (
        <div className="form-pair">
          <label>
            {ar ? 'اختصار النادي' : 'Club abbreviation'}
            <input
              name="shortName"
              required
              minLength={2}
              maxLength={5}
              defaultValue={initial.club.shortName}
            />
          </label>
          <label>
            {ar ? 'لون النادي' : 'Club color'}
            <input
              name="color"
              type="color"
              required
              defaultValue={initial.club.color}
            />
          </label>
        </div>
      )}
      {initial.kind === 'footballer' && (
        <>
          <label>
            {ar ? 'النادي الحالي' : 'Current club'}
            <select
              name="clubId"
              required
              defaultValue={initial.footballer.clubId}
            >
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name[locale]}
                </option>
              ))}
            </select>
          </label>
          <p>
            {ar
              ? 'تغيير النادي لا يعدّل مشاركات المباريات السابقة. المركز الافتراضي يُستخدم عند الإضافة إلى بطولة؛ مراكز البطولات الحالية مستقلة.'
              : 'Changing club preserves historical match participation. Default position is used when adding to a competition; existing competition positions remain separate.'}
          </p>
          <div className="form-pair">
            <label>
              {ar ? 'المركز الافتراضي' : 'Default position'}
              <select
                name="position"
                defaultValue={initial.footballer.defaultPosition}
              >
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {positionNames[p][locale]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {ar ? 'حالة اللاعب' : 'Player status'}
              <select name="status" defaultValue={initial.footballer.status}>
                <option value="available">{ar ? 'متاح' : 'Available'}</option>
                <option value="injured">{ar ? 'مصاب' : 'Injured'}</option>
                <option value="suspended">{ar ? 'موقوف' : 'Suspended'}</option>
                <option value="unavailable">
                  {ar ? 'غير متاح' : 'Unavailable'}
                </option>
              </select>
            </label>
          </div>
          <ValuationFields
            locale={locale}
            valuation={initial.footballer.valuation}
          />
        </>
      )}
      <label>
        {ar ? 'سبب التغيير ودليله' : 'Reason and evidence for this change'}
        <textarea name="reason" required minLength={5} maxLength={1000} />
      </label>
      <button className="button-outline" type="submit" disabled={busy}>
        {ar ? 'مراجعة التغيير' : 'Review change'}
      </button>
      {pending && (
        <div className="catalogue-confirmation">
          <p>
            {ar
              ? 'سيتم حفظ هذا السجل في دليل الموسم مع سبب التغيير. تحقّق من الأسماء والمصدر والتاريخ أعلاه.'
              : 'This season catalogue record will be saved with your reason. Check the names, source and dates above.'}
          </p>
          <button
            className="button-primary"
            type="button"
            disabled={busy}
            onClick={() => {
              void save();
            }}
          >
            {busy
              ? ar
                ? 'جارٍ الحفظ…'
                : 'Saving…'
              : ar
                ? 'تأكيد الحفظ'
                : 'Confirm save'}
          </button>
        </div>
      )}
      <p role="status">{notice}</p>
    </form>
  );
}
