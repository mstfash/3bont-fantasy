'use client';
import { useEffect, useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  accountExportCommandSchema,
  accountExportResultSchema,
  accountExportSchema,
  type AccountExport,
  type AccountExportCommand,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { deadlineLabel } from '@/lib/locale';
import { commandError } from '@/lib/command-errors';
import { CairoDateTime } from './cairo-date-time';
import { formText } from './groups/reviewed-form';
export function AccountExportControls({
  locale,
  initialArchives,
  competitions,
  observedAt,
}: {
  readonly locale: Locale;
  readonly initialArchives: readonly AccountExport[];
  readonly competitions: readonly { id: string; name: string }[];
  readonly observedAt: string;
}) {
  const ar = locale === 'ar';
  const [archives, setArchives] = useState(initialArchives),
    [limited, setLimited] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState<AccountExportCommand | null>(null);
  const queued = archives.some(
    (a) =>
      a.state === 'queued' && Date.parse(a.requestedAt) > Date.now() - 86400000,
  );
  useEffect(() => {
    if (!queued) return;
    const lifecycle = { cancelled: false };
    const isCurrent = () => !lifecycle.cancelled;
    let loading = false,
      attempt = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (!isCurrent() || loading) return;
      loading = true;
      try {
        if (!document.hidden) {
          const response = await fetch('/api/v1/account/exports', {
            cache: 'no-store',
          });
          if (response.ok) {
            const parsed = z
              .object({ archives: z.array(accountExportSchema) })
              .parse(await response.json());
            if (isCurrent()) setArchives(parsed.archives);
          }
        }
      } catch {
        /* Keep the last confirmed state during a transient polling failure. */
      } finally {
        loading = false;
        if (isCurrent()) {
          attempt++;
          timer = setTimeout(
            () => {
              void refresh();
            },
            Math.min(30000, 5000 + attempt * 1000),
          );
        }
      }
    };
    timer = setTimeout(() => {
      void refresh();
    }, 5000);
    return () => {
      lifecycle.cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [queued]);
  async function request(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget),
      parsed = accountExportCommandSchema.safeParse(
        pending ?? {
          commandId: crypto.randomUUID(),
          scope: {
            competitionId: formText(form, 'competitionId') || null,
            historyFrom: limited ? formText(form, 'from') : null,
            historyUntil: limited ? formText(form, 'until') : null,
          },
        },
      );
    if (!parsed.success) {
      setNotice(
        ar
          ? 'راجع نطاق البطولة والتواريخ.'
          : 'Review the competition and date range.',
      );
      return;
    }
    setPending(parsed.data);
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/v1/account/exports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        }),
        body: unknown = await response.json();
      if (!response.ok) {
        const error = z.object({ code: z.string() }).safeParse(body);
        setNotice(
          commandError(
            error.success ? error.data.code : 'request-unconfirmed',
            locale,
          ),
        );
        return;
      }
      const result = accountExportResultSchema.parse(
        z.object({ result: z.unknown() }).parse(body).result,
      );
      setArchives((current) => [
        result.archive,
        ...current.filter((a) => a.id !== result.archive.id),
      ]);
      setPending(null);
      setNotice(
        ar
          ? 'طلبك محفوظ. سيظهر التنزيل بعد تجهيز الأرشيف.'
          : 'Your request is saved. The download appears when the archive is ready.',
      );
    } catch {
      setNotice(commandError('request-unconfirmed', locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="group-card">
      <h2>{ar ? 'نسخة من بيانات لعبك' : 'YOUR GAME-DATA ARCHIVE'}</h2>
      <p>
        {ar
          ? 'أرشيف خاص بتنسيق NDJSON لملفك وفرقك وتاريخها ورسائلك المتاحة وإنجازاتك وجوائزك المسلّمة. لا يحتوي كلمات مرور أو اختيارات الآخرين الخاصة أو أدلة إشراف مقيّدة.'
          : 'A private NDJSON archive of your profile, squads and history, available messages, achievements and fulfilled awards. It excludes passwords, other participants’ private choices and restricted moderation evidence.'}
      </p>
      <p>
        {ar
          ? 'ينتهي التنزيل بعد ٢٤ ساعة. حتى ٣ طلبات يوميًا و١٠٠ ميجابايت لكل أرشيف؛ اختر بطولة أو فترة أقصر للأرشيفات الكبيرة.'
          : 'Downloads expire after 24 hours. Up to 3 requests per day and 100 MB per archive; narrow the competition or dates for larger histories.'}
      </p>
      <form
        className="group-form"
        onSubmit={(event) => {
          void request(event);
        }}
        onChange={() => {
          setPending(null);
        }}
      >
        <label>
          {ar ? 'نطاق البطولة' : 'Competition scope'}
          <select name="competitionId" defaultValue="">
            <option value="">
              {ar ? 'كل بطولاتي' : 'All my competitions'}
            </option>
            {competitions.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="confirmation-check">
          <input
            type="checkbox"
            checked={limited}
            onChange={(event) => {
              setLimited(event.currentTarget.checked);
            }}
          />
          {ar ? 'تحديد فترة للسجل التاريخي' : 'Limit the history date range'}
        </label>
        {limited && (
          <>
            <CairoDateTime
              locale={locale}
              label={ar ? 'السجل من' : 'History from'}
              name="from"
              initialValue={new Date(
                Date.parse(observedAt) - 30 * 86400000,
              ).toISOString()}
            />
            <CairoDateTime
              locale={locale}
              label={ar ? 'السجل حتى' : 'History until'}
              name="until"
              initialValue={observedAt}
            />
          </>
        )}
        <button
          className="button-outline"
          type="submit"
          disabled={busy || queued}
        >
          {ar ? 'طلب أرشيف خاص' : 'Request private archive'}
        </button>
      </form>
      <p role="status">{notice}</p>
      {archives.map((archive) => {
        const expired =
          (archive.expiresAt !== null &&
            Date.parse(archive.expiresAt) <= Date.now()) ||
          (archive.state === 'queued' &&
            Date.parse(archive.requestedAt) <= Date.now() - 86400000);
        return (
          <article key={archive.id}>
            <h3>{deadlineLabel(archive.requestedAt, locale)}</h3>
            <p>
              {expired
                ? ar
                  ? 'انتهت الصلاحية'
                  : 'Expired'
                : archive.state === 'queued'
                  ? ar
                    ? 'جارٍ الانتظار والتجهيز'
                    : 'Queued for preparation'
                  : archive.state === 'ready'
                    ? ar
                      ? 'جاهز للتنزيل'
                      : 'Ready to download'
                    : commandError(
                        archive.errorCode ?? 'archive-build-failed',
                        locale,
                      )}
            </p>
            {archive.state === 'ready' && !expired && (
              <>
                <p>
                  {ar ? 'ينتهي' : 'Expires'}:{' '}
                  {archive.expiresAt
                    ? deadlineLabel(archive.expiresAt, locale)
                    : '—'}{' '}
                  ·{' '}
                  {archive.byteLength === null
                    ? '—'
                    : `${String(Math.ceil(archive.byteLength / 1024))} KB`}
                </p>
                <a
                  className="button-outline"
                  href={`/api/v1/account/exports/${archive.id}`}
                  download
                >
                  {ar ? 'تنزيل بياناتي' : 'Download my data'}
                </a>
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}
