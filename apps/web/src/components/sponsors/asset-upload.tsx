'use client';
import { useRef, useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { sponsorAssetMetadataSchema } from '@fantasy/contracts';
import { commandError } from '@/lib/command-errors';
import type { Locale } from '@/lib/brand';
export function SponsorAssetUpload({
  locale,
  competitionId,
}: {
  readonly locale: Locale;
  readonly competitionId: string | null;
}) {
  const ar = locale === 'ar',
    router = useRouter(),
    key = useRef<string | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice('');
    const form = new FormData(event.currentTarget);
    key.current ??= crypto.randomUUID();
    form.set('commandId', key.current);
    try {
      const response = await fetch(
        `/api/v1/admin/sponsors/assets${competitionId ? `?competitionId=${competitionId}` : ''}`,
        { method: 'POST', body: form },
      );
      const json: unknown = await response.json();
      if (!response.ok) {
        const error = z.object({ code: z.string() }).safeParse(json);
        setNotice(
          commandError(
            error.success ? error.data.code : 'request-unconfirmed',
            locale,
          ),
        );
        return;
      }
      z.object({ result: sponsorAssetMetadataSchema }).parse(json);
      setNotice(ar ? 'تم حفظ الصورة المعتمدة.' : 'Approved artwork saved.');
      key.current = null;
      router.refresh();
    } catch {
      setNotice(
        ar
          ? 'تعذّر تأكيد الرفع. أعد نفس الطلب.'
          : 'Upload not confirmed. Retry the same request.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="group-form"
      onSubmit={(e) => {
        void submit(e);
      }}
      onChange={() => {
        key.current = null;
      }}
    >
      <label>
        {ar ? 'اسم الصورة' : 'Artwork label'}
        <input name="label" minLength={2} maxLength={150} required />
      </label>
      <label>
        {ar ? 'الصورة' : 'Artwork file'}
        <input
          name="file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
        />
      </label>
      <label>
        {ar ? 'مرجع إذن استخدام الصورة' : 'Artwork authorization reference'}
        <input
          name="authorizationReference"
          minLength={5}
          maxLength={1000}
          required
        />
      </label>
      <p>
        {ar
          ? 'PNG أو JPEG أو WebP ثابتة، حتى ٤ ميجابايت؛ العرض ١٢٨–٤٠٩٦ والارتفاع ٦٤–٤٠٩٦. تُحذف البيانات الوصفية وتُجهز الصورة للعرض.'
          : 'Static PNG, JPEG or WebP, up to 4 MB; width 128–4096 and height 64–4096. Metadata is removed and artwork is prepared for display.'}
      </p>
      <button className="button-outline" disabled={busy}>
        {busy
          ? ar
            ? 'جارٍ الرفع…'
            : 'Uploading…'
          : ar
            ? 'حفظ الصورة المعتمدة'
            : 'Save approved artwork'}
      </button>
      <p role="status">{notice}</p>
    </form>
  );
}
