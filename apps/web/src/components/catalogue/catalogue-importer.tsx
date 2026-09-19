'use client';
import { useState } from 'react';
import { z } from 'zod';
import {
  catalogueManifestSchema,
  catalogueImportResponseSchema,
  type CatalogueManifest,
  type CatalogueImportPreview,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { commandError } from '@/lib/command-errors';
function fields(value: unknown, prefix = ''): Record<string, string> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value))
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        Object.entries(fields(item, prefix ? `${prefix}.${key}` : key)),
      ),
    );
  return {
    [prefix]:
      value === null
        ? '—'
        : typeof value === 'string'
          ? value
          : JSON.stringify(value),
  };
}
const labels: Record<string, { en: string; ar: string }> = {
  'name.en': { en: 'English name', ar: 'الاسم الإنجليزي' },
  'name.ar': { en: 'Arabic name', ar: 'الاسم العربي' },
  startsAt: { en: 'Season starts', ar: 'بداية الموسم' },
  endsAt: { en: 'Season ends', ar: 'نهاية الموسم' },
  synthetic: { en: 'Fictional data', ar: 'بيانات تجريبية' },
  shortName: { en: 'Short name', ar: 'الاختصار' },
  color: { en: 'Club colour', ar: 'لون النادي' },
  seasonId: { en: 'Season reference', ar: 'مرجع الموسم' },
  clubId: { en: 'Club reference', ar: 'مرجع النادي' },
  defaultPosition: { en: 'Position', ar: 'المركز' },
  shirtNumber: { en: 'Shirt number', ar: 'رقم القميص' },
  status: { en: 'Availability', ar: 'الإتاحة' },
  valuation: { en: 'Market valuation', ar: 'القيمة السوقية' },
  'valuation.amountMinor': {
    en: 'Valuation in currency minor units',
    ar: 'التقييم بالوحدة النقدية الصغرى',
  },
  'valuation.currency': { en: 'Currency', ar: 'العملة' },
  'valuation.asOf': { en: 'Valuation date', ar: 'تاريخ التقييم' },
  'valuation.sourceName': { en: 'Valuation source', ar: 'مصدر التقييم' },
  'valuation.sourceUrl': { en: 'Source link', ar: 'رابط المصدر' },
  'valuation.licensedForDisplay': {
    en: 'Display rights verified',
    ar: 'حق العرض مؤكد',
  },
};
export function CatalogueImporter({ locale }: { readonly locale: Locale }) {
  const ar = locale === 'ar';
  const [manifest, setManifest] = useState<CatalogueManifest | null>(null),
    [preview, setPreview] = useState<CatalogueImportPreview | null>(null),
    [batchId, setBatchId] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [visible, setVisible] = useState(50),
    [done, setDone] = useState(false);
  async function load(file: File | undefined) {
    setManifest(null);
    setPreview(null);
    setConfirmed(false);
    setDone(false);
    setNotice('');
    setVisible(50);
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 2_000_000) throw new Error('size');
      const value: unknown = JSON.parse(await file.text());
      setManifest(catalogueManifestSchema.parse(value));
      setBatchId(crypto.randomUUID());
    } catch {
      setNotice(
        ar
          ? 'اختر ملف JSON صالحًا حتى ٢ ميجابايت و١٠٠٠ سجل. استخدم النموذج أو تصدير الموسم.'
          : 'Choose a valid JSON manifest up to 2 MB and 1,000 records. Start from the template or a season export.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(apply: boolean) {
    if (!manifest || busy || (apply && (!preview || !confirmed))) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/v1/admin/catalogue/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          apply
            ? {
                kind: 'apply',
                commandId: batchId,
                expectedFingerprint: preview?.fingerprint,
                manifest,
              }
            : { kind: 'preview', manifest },
        ),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const error = z.object({ code: z.string() }).safeParse(data);
        setNotice(
          commandError(
            error.success ? error.data.code : 'request-unconfirmed',
            locale,
          ),
        );
        return;
      }
      const result = catalogueImportResponseSchema.parse(
        z.object({ result: z.unknown() }).parse(data).result,
      );
      if (result.kind === 'invalid') {
        setPreview(null);
        setConfirmed(false);
        setNotice(
          `${ar ? 'السجل' : 'Record'} ${String(result.itemIndex + 1)}: ${commandError(result.code, locale)} ${ar ? 'لم تُطبّق الدفعة.' : 'The batch was not applied.'}`,
        );
        return;
      }
      if (result.kind === 'preview') {
        setPreview(result);
        setConfirmed(false);
        setBatchId(crypto.randomUUID());
        return;
      }
      setDone(true);
      setPreview(null);
      setNotice(
        ar
          ? `تم قبول ${String(result.acceptedRows)} سجلًا معًا.`
          : `Accepted ${String(result.acceptedRows)} records together.`,
      );
    } catch {
      setNotice(
        ar
          ? 'تعذّر التأكيد. أعد نفس الطلب للتحقق من النتيجة.'
          : 'Unable to confirm. Retry the same request to verify the outcome.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="group-card">
        <h2>{ar ? '١. اختر سجلات الموسم' : '1. CHOOSE THE SEASON RECORDS'}</h2>
        <p>
          {ar
            ? 'احتفظ بمعرّفات السجلات عند تعديل تصدير موجود. لا تضف بيانات حقيقية إلى الموسم التجريبي. القيم السوقية لا تغيّر أسعار الفانتازي.'
            : 'Keep record identifiers when editing an existing export. Use a separate season for real data. Market valuations do not change fantasy prices.'}
        </p>
        <p>
          <a href="/templates/catalogue-example.json" download>
            {ar ? 'تنزيل نموذج تجريبي' : 'Download fictional example'}
          </a>
        </p>
        <label>
          {ar ? 'ملف الاستيراد' : 'Import file'}
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(event) => {
              void load(event.currentTarget.files?.[0]);
            }}
          />
        </label>
        {manifest && (
          <>
            <p>
              <strong>{manifest.sourceName}</strong> · {manifest.items.length}{' '}
              {ar ? 'سجل' : 'records'}
            </p>
            <p className="import-evidence">
              {manifest.sourceEvidenceReference}
            </p>
            <button
              className="button-outline"
              type="button"
              disabled={busy || done}
              onClick={() => {
                void submit(false);
              }}
            >
              {ar ? 'مراجعة الدفعة' : 'Preview batch'}
            </button>
          </>
        )}
      </section>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {preview && (
        <section className="admin-panel">
          <h2>{ar ? '٢. راجع التغييرات' : '2. REVIEW THE CHANGES'}</h2>
          <p>
            {(['create', 'update', 'unchanged'] as const)
              .map(
                (action) =>
                  `${ar ? { create: 'إضافة', update: 'تعديل', unchanged: 'بلا تغيير' }[action] : action}: ${String(preview.changes.filter((c) => c.action === action).length)}`,
              )
              .join(' · ')}
          </p>
          {preview.changes.slice(0, visible).map((change) => {
            const before = fields(change.before),
              after = fields(change.after);
            const keys = [
              ...new Set([...Object.keys(before), ...Object.keys(after)]),
            ].filter(
              (key) => key && key !== 'id' && before[key] !== after[key],
            );
            return (
              <details
                key={`${change.kind}:${change.id}`}
                className="import-record"
              >
                <summary>
                  {change.after.name[locale]} ·{' '}
                  {ar
                    ? {
                        create: 'إضافة',
                        update: 'تعديل',
                        unchanged: 'بلا تغيير',
                      }[change.action]
                    : change.action}
                </summary>
                <div className="admin-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{ar ? 'الحقل' : 'Field'}</th>
                        <th>{ar ? 'قبل' : 'Before'}</th>
                        <th>{ar ? 'بعد' : 'After'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => (
                        <tr key={key}>
                          <th>{labels[key]?.[locale] ?? key}</th>
                          <td>{before[key] ?? '—'}</td>
                          <td>{after[key] ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
          {visible < preview.changes.length && (
            <button
              className="button-outline"
              onClick={() => {
                setVisible(visible + 50);
              }}
            >
              {ar ? 'عرض ٥٠ سجلًا آخر' : 'Show 50 more records'}
            </button>
          )}
          <p>
            {ar
              ? 'إذا تغيّرت السجلات بعد هذه المراجعة، يلزم رفع نسخة محدّثة ومراجعتها. أي سجل مرفوض يلغي الدفعة كاملة.'
              : 'If records change after this review, upload and review an updated file. A rejected record cancels the entire batch.'}
          </p>
          <label className="confirmation-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => {
                setConfirmed(event.currentTarget.checked);
              }}
            />
            {ar
              ? 'راجعت السجلات والمصادر وحقوق عرض القيم السوقية.'
              : 'I reviewed the records, sources and valuation display rights.'}
          </label>
          <button
            className="button"
            disabled={busy || !confirmed}
            onClick={() => {
              void submit(true);
            }}
          >
            {busy
              ? ar
                ? 'جارٍ التحقق…'
                : 'Checking…'
              : ar
                ? 'تأكيد استيراد الدفعة'
                : 'Confirm batch import'}
          </button>
        </section>
      )}
    </>
  );
}
