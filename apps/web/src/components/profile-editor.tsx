'use client';
import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  profileCommandSchema,
  profileResultSchema,
  type ProfileCommand,
} from '@fantasy/contracts';
import { commandError } from '@/lib/command-errors';
import type { Locale } from '@/lib/brand';
export function ProfileEditor({
  locale,
  displayName,
}: {
  readonly locale: Locale;
  readonly displayName: string;
}) {
  const ar = locale === 'ar',
    router = useRouter();
  const [name, setName] = useState(displayName),
    [pending, setPending] = useState<ProfileCommand | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = profileCommandSchema.safeParse(
      pending ?? {
        commandId: crypto.randomUUID(),
        expectedDisplayName: displayName,
        displayName: name,
      },
    );
    if (!parsed.success) {
      setNotice(
        ar
          ? 'استخدم اسمًا ظاهرًا من حرفين إلى ٦٠ حرفًا.'
          : 'Use a display name between 2 and 60 characters.',
      );
      return;
    }
    const command = parsed.data;
    setPending(command);
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/v1/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        }),
        data: unknown = await response.json();
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
      profileResultSchema.parse(
        z.object({ result: z.unknown() }).parse(data).result,
      );
      setPending(null);
      setNotice(ar ? 'تم حفظ الاسم.' : 'Display name saved.');
      router.refresh();
    } catch {
      setNotice(commandError('request-unconfirmed', locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="group-form"
      onSubmit={(event) => {
        void save(event);
      }}
    >
      <label>
        {ar ? 'الاسم الظاهر' : 'Display name'}
        <input
          name="displayName"
          value={name}
          minLength={2}
          maxLength={60}
          required
          autoComplete="nickname"
          disabled={busy}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setPending(null);
            setNotice('');
          }}
        />
      </label>
      <p>
        {ar
          ? 'يظهر هذا الاسم في المجتمعات ومتابعة حسابك. أسماء الفرق تُعدّل من صفحاتها.'
          : 'This name identifies you in communities and account views. Squad names are edited on their own pages.'}
      </p>
      <button type="submit" className="button-outline" disabled={busy}>
        {ar ? 'حفظ الاسم' : 'Save display name'}
      </button>
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </form>
  );
}
