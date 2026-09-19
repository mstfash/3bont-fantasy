'use client';
import { TopicHelp } from './help/page-help';
import { useState, type ReactNode, type SubmitEvent } from 'react';
import { z } from 'zod';
import { commandError } from '@/lib/command-errors';
import type { Locale } from '@/lib/brand';
export function ReviewedCommandForm<Command, Result>({
  locale,
  children,
  makeCommand,
  onSaved,
  label,
  commandSchema,
  resultSchema,
  endpoint,
  successNotice,
}: {
  readonly locale: Locale;
  readonly children: ReactNode;
  readonly makeCommand: (form: FormData) => unknown;
  readonly onSaved: (result: Result, command: Command) => void;
  readonly label: string;
  readonly commandSchema: z.ZodType<Command>;
  readonly resultSchema: z.ZodType<Result>;
  readonly endpoint: string;
  readonly successNotice?: (result: Result) => string;
}) {
  const ar = locale === 'ar';
  const [pending, setPending] = useState<Command | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  function review(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      setPending(
        commandSchema.parse(makeCommand(new FormData(event.currentTarget))),
      );
      setNotice('');
    } catch {
      setNotice(
        ar
          ? 'راجع الحقول والاختيارات المطلوبة.'
          : 'Check the required fields and choices.',
      );
    }
  }
  async function confirm(): Promise<void> {
    if (pending === null || busy) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
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
      const result = resultSchema.parse(
        z.object({ result: z.unknown() }).parse(data).result,
      );
      setNotice(successNotice?.(result) ?? (ar ? 'تم الحفظ.' : 'Saved.'));
      setPending(null);
      onSaved(result, pending);
    } catch {
      setNotice(
        ar
          ? 'تعذّر التأكيد. أعد نفس الطلب.'
          : 'Unable to confirm. Retry the same request.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="group-form"
      onSubmit={review}
      onChange={() => {
        setPending(null);
      }}
    >
      {children}
      <TopicHelp locale={locale} topic="review" />
      <button className="button-outline" type="submit" disabled={busy}>
        {label}
      </button>
      {pending !== null && (
        <div className="group-confirmation">
          <p>
            {ar
              ? 'راجع الاختيارات أعلاه ثم أكّد الطلب.'
              : 'Review your choices above, then confirm.'}
          </p>
          <button
            className="action-button"
            type="button"
            disabled={busy}
            onClick={() => {
              void confirm();
            }}
          >
            {busy
              ? ar
                ? 'جارٍ الحفظ…'
                : 'Saving…'
              : ar
                ? 'تأكيد الطلب'
                : 'Confirm request'}
          </button>
        </div>
      )}
      <p role="status">{notice}</p>
    </form>
  );
}
