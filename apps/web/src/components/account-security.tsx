'use client';

import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import type { Locale } from '@/lib/brand';

const enrollmentSchema = z.object({
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
});

export function AccountSecurity({
  locale,
  enabled,
  staff,
}: {
  readonly locale: Locale;
  readonly enabled: boolean;
  readonly staff: boolean;
}) {
  const ar = locale === 'ar';
  const [enrollment, setEnrollment] = useState<z.infer<
    typeof enrollmentSchema
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    const code = form.get('code');
    try {
      const endpoint = enabled
        ? '/api/v1/staff/verify'
        : enrollment
          ? '/api/auth/two-factor/verify-totp'
          : '/api/auth/two-factor/enable';
      const body = enabled
        ? { password, code }
        : enrollment
          ? { code, trustDevice: false }
          : { password, method: 'totp' };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setNotice(
          response.status === 429
            ? ar
              ? 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.'
              : 'Too many attempts. Wait a minute and try again.'
            : ar
              ? 'تعذر التحقق. راجع كلمة المرور والرمز.'
              : 'Verification failed. Check your password and code.',
        );
        return;
      }
      if (!enabled && !enrollment) {
        const payload: unknown = await response.json();
        setEnrollment(enrollmentSchema.parse(payload));
      } else if (enabled) window.location.assign(`/${locale}/admin`);
      else window.location.reload();
    } catch {
      setNotice(
        ar
          ? 'تعذر إتمام الطلب. تحقق من الاتصال.'
          : 'Unable to complete the request. Check your connection.',
      );
    } finally {
      setBusy(false);
    }
  }
  const secret = enrollment
    ? new URL(enrollment.totpURI).searchParams.get('secret')
    : null;
  if (enabled && !staff)
    return (
      <div className="empty-state">
        <h2>
          {ar
            ? 'المصادقة الثنائية مفعّلة.'
            : 'Two-factor authentication is enabled.'}
        </h2>
        <p>
          {ar
            ? 'ستحتاج رمز تطبيق المصادقة عند تسجيل الدخول.'
            : 'Your authenticator code is required when you sign in.'}
        </p>
        <ResetAuthenticator locale={locale} />
      </div>
    );
  return (
    <>
      <form
        className="auth-form security-form"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <p>
          {enabled
            ? ar
              ? 'أكد كلمة المرور ورمز المصادقة لفتح لوحة الإدارة. التحقق مرتبط بجلسة الدخول الحالية.'
              : 'Confirm your password and authenticator code to unlock administration. Verification applies to this sign-in session.'
            : ar
              ? 'أضف هذا الحساب في تطبيق مصادقة، ثم أكد الرمز المكون من ستة أرقام.'
              : 'Add this account to an authenticator app, then confirm the six-digit code.'}
        </p>
        {enrollment && (
          <div className="enrollment-details">
            <label>
              {ar ? 'مفتاح الإعداد اليدوي' : 'Manual setup key'}
              <input value={secret ?? ''} readOnly dir="ltr" />
            </label>
            <p>
              {ar
                ? 'اختر رمزاً يعتمد على الوقت (TOTP)، ٦ أرقام، كل ٣٠ ثانية.'
                : 'Choose a time-based (TOTP) code, six digits, every 30 seconds.'}
            </p>
            <h3>{ar ? 'احفظ رموز الاستعادة' : 'Save your recovery codes'}</h3>
            <p>
              {ar
                ? 'احفظها في مدير كلمات مرور قبل المتابعة. كل رمز صالح مرة واحدة.'
                : 'Save these in your password manager before continuing. Each code can be used once.'}
            </p>
            <div className="recovery-codes" dir="ltr">
              {enrollment.backupCodes.map((code) => (
                <code key={code}>{code}</code>
              ))}
            </div>
            <label className="confirmation-check">
              <input type="checkbox" required />
              {ar
                ? 'حفظت رموز الاستعادة في مكان آمن.'
                : 'I saved my recovery codes securely.'}
            </label>
          </div>
        )}
        {(!enrollment || enabled) && (
          <label>
            {ar ? 'كلمة المرور الحالية' : 'Current password'}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
        )}
        {(enrollment || enabled) && (
          <label>
            {ar ? 'رمز تطبيق المصادقة' : 'Authenticator code'}
            <input
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </label>
        )}
        {notice && (
          <p role="alert" className="form-notice error">
            {notice}
          </p>
        )}
        <button className="button-primary" type="submit" disabled={busy}>
          {busy
            ? ar
              ? 'جاري التحقق…'
              : 'Verifying…'
            : enabled
              ? ar
                ? 'فتح لوحة الإدارة'
                : 'Unlock administration'
              : enrollment
                ? ar
                  ? 'تأكيد وتفعيل'
                  : 'Verify and enable'
                : ar
                  ? 'إعداد تطبيق المصادقة'
                  : 'Set up authenticator'}
        </button>
      </form>
      {enabled && <ResetAuthenticator locale={locale} />}
    </>
  );
}

function ResetAuthenticator({ locale }: { readonly locale: Locale }) {
  const ar = locale === 'ar';
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function disable(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const value = new FormData(event.currentTarget).get('password');
    if (typeof value !== 'string') {
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/auth/two-factor/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: value }),
      });
      if (response.ok) window.location.reload();
      else
        setNotice(
          ar
            ? 'تعذر الإلغاء. تحقق من كلمة المرور أو سجّل الدخول مجدداً.'
            : 'Unable to disable. Check your password or sign in again.',
        );
    } catch {
      setNotice(ar ? 'تعذر الاتصال.' : 'Connection failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="security-reset">
      <summary>
        {ar
          ? 'استبدال أو إلغاء تطبيق المصادقة'
          : 'Replace or disable authenticator'}
      </summary>
      <p>
        {ar
          ? 'سيتم إلغاء المصادقة الثنائية الحالية وإغلاق صلاحية الإدارة حتى تفعّل تطبيقاً جديداً وتتحقق من الجلسة.'
          : 'This disables the current authenticator and blocks administration until a new authenticator is enrolled and the session is verified.'}
      </p>
      <form
        className="auth-form"
        onSubmit={(event) => {
          void disable(event);
        }}
      >
        <label>
          {ar ? 'كلمة المرور لتأكيد الإلغاء' : 'Password to confirm disabling'}
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="confirmation-check">
          <input type="checkbox" required />
          {ar
            ? 'أفهم أن حماية المصادقة الحالية ستُلغى.'
            : 'I understand that current authenticator protection will be removed.'}
        </label>
        {notice && <p role="alert">{notice}</p>}
        <button className="button-outline" type="submit" disabled={busy}>
          {ar ? 'إلغاء المصادقة الحالية' : 'Disable current authenticator'}
        </button>
      </form>
    </details>
  );
}
