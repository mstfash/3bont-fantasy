'use client';
import { TopicHelp } from './help/page-help';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import type { Locale } from '@/lib/brand';

const authResponse = z.object({
  twoFactorRedirect: z.boolean().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
});
type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

export function AuthForm({
  locale,
  mode,
  token,
}: {
  readonly locale: Locale;
  readonly mode: AuthMode;
  readonly token?: string;
}) {
  const ar = locale === 'ar';
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [backupCode, setBackupCode] = useState(false);
  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    setFailed(false);
    const form = new FormData(event.currentTarget);
    const field = (name: string): string => {
      const value = form.get(name);
      return typeof value === 'string' ? value : '';
    };
    const email = field('email');
    const password = field('password');
    let endpoint: string;
    let body: Record<string, string | boolean>;
    const callbackURL = `/${locale}/dashboard`;
    if (twoFactor) {
      endpoint = backupCode
        ? 'two-factor/verify-backup-code'
        : 'two-factor/verify-totp';
      body = backupCode
        ? { code: field('code'), disableSession: false, trustDevice: false }
        : { code: field('code'), trustDevice: false };
    } else if (mode === 'register') {
      endpoint = 'sign-up/email';
      body = {
        email,
        password,
        name: field('name'),
        callbackURL,
      };
    } else if (mode === 'verify') {
      endpoint = 'send-verification-email';
      body = { email, callbackURL };
    } else if (mode === 'forgot') {
      endpoint = 'request-password-reset';
      body = { email, redirectTo: `/${locale}/reset-password` };
    } else if (mode === 'reset') {
      endpoint = 'reset-password';
      body = { newPassword: password, token: token ?? '' };
    } else {
      endpoint = 'sign-in/email';
      body = { email, password, callbackURL };
    }
    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json();
      const data = authResponse.parse(payload);
      if (
        mode === 'verify' &&
        (response.ok || [400, 401, 403, 404].includes(response.status))
      ) {
        setNotice(
          ar
            ? 'إذا كان البريد يحتاج إلى تأكيد، ستصلك رسالة جديدة. راجع البريد غير المرغوب فيه أيضاً.'
            : 'If this address needs verification, a fresh email is on its way. Check your spam folder too.',
        );
        return;
      }
      if (!response.ok) {
        setFailed(true);
        if (data.code === 'EMAIL_NOT_VERIFIED')
          setNotice(
            ar
              ? 'أكد بريدك الإلكتروني أولاً من رسالة التسجيل.'
              : 'Verify your email using your signup message first.',
          );
        else if (data.code === 'ACCOUNT_SUSPENDED')
          setNotice(
            ar
              ? 'هذا الحساب موقوف مؤقتاً. راجع فريق الدعم إذا كنت تعتقد أن القرار غير صحيح.'
              : 'This account is temporarily suspended. Contact support if you believe the decision is incorrect.',
          );
        else if (response.status === 429)
          setNotice(
            ar
              ? 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.'
              : 'Too many attempts. Wait a moment and try again.',
          );
        else
          setNotice(
            ar
              ? 'تعذر إتمام الطلب. تحقق من البيانات وحاول مرة أخرى.'
              : 'Unable to complete the request. Check your details and try again.',
          );
        return;
      }
      if (data.twoFactorRedirect) {
        setTwoFactor(true);
        return;
      }
      if (mode === 'register')
        setNotice(
          ar
            ? 'تم إنشاء حسابك. افتح رسالة التأكيد في بريدك الإلكتروني لتفعيل الحساب.'
            : 'Account created. Open your verification email to activate it.',
        );
      else if (mode === 'forgot')
        setNotice(
          ar
            ? 'إذا كان البريد مسجلاً، ستصلك رسالة لإعادة تعيين كلمة المرور.'
            : 'If the address is registered, a password reset email is on its way.',
        );
      else if (mode === 'reset')
        setNotice(
          ar
            ? 'تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن.'
            : 'Password changed. You can sign in now.',
        );
      else window.location.assign(callbackURL);
    } catch {
      setFailed(true);
      setNotice(
        ar
          ? 'تعذر الاتصال. لم يتم تأكيد نجاح الطلب. حاول مرة أخرى.'
          : 'Connection failed. Success has not been confirmed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <TopicHelp locale={locale} topic="security" />
      {twoFactor ? (
        <>
          <label>
            {backupCode
              ? ar
                ? 'رمز الاستعادة'
                : 'Recovery code'
              : ar
                ? 'رمز تطبيق المصادقة'
                : 'Authenticator code'}
            <input
              key={backupCode ? 'backup' : 'totp'}
              name="code"
              inputMode={backupCode ? 'text' : 'numeric'}
              pattern={backupCode ? undefined : '[0-9]{6}'}
              maxLength={backupCode ? 100 : 6}
              autoComplete="one-time-code"
              required
            />
          </label>
          <button
            className="button-outline"
            type="button"
            onClick={() => {
              setBackupCode(!backupCode);
              setNotice('');
            }}
          >
            {backupCode
              ? ar
                ? 'استخدم تطبيق المصادقة'
                : 'Use authenticator app'
              : ar
                ? 'استخدم رمز استعادة'
                : 'Use a recovery code'}
          </button>
        </>
      ) : (
        <>
          {mode === 'register' && (
            <label>
              {ar ? 'اسمك' : 'Your name'}
              <input
                name="name"
                autoComplete="name"
                minLength={2}
                maxLength={60}
                required
              />
            </label>
          )}
          {mode !== 'reset' && (
            <label>
              {ar ? 'البريد الإلكتروني' : 'Email address'}
              <input
                name="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                maxLength={254}
                required
              />
            </label>
          )}
          {mode !== 'forgot' && mode !== 'verify' && (
            <>
              <label>
                {ar ? 'كلمة المرور' : 'Password'}
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  minLength={mode === 'login' ? 1 : 12}
                  maxLength={128}
                  aria-describedby={
                    mode !== 'login' ? 'password-hint' : undefined
                  }
                  required
                />
              </label>
              <span className="field-hint" id="password-hint">
                {mode !== 'login' &&
                  (ar ? '12 حرفاً على الأقل.' : 'At least 12 characters.')}
              </span>
            </>
          )}
        </>
      )}
      {notice && (
        <p
          className={failed ? 'form-notice error' : 'form-notice'}
          role={failed ? 'alert' : 'status'}
        >
          {notice}
        </p>
      )}
      <button
        className="button-primary"
        disabled={busy || (mode === 'reset' && !token)}
        type="submit"
      >
        {busy
          ? ar
            ? 'جاري التنفيذ…'
            : 'Working…'
          : twoFactor
            ? ar
              ? 'تأكيد الرمز'
              : 'Verify code'
            : mode === 'register'
              ? ar
                ? 'إنشاء الحساب'
                : 'Create account'
              : mode === 'forgot'
                ? ar
                  ? 'إرسال رابط الاستعادة'
                  : 'Send reset link'
                : mode === 'verify'
                  ? ar
                    ? 'إرسال رسالة تأكيد'
                    : 'Send verification email'
                  : mode === 'reset'
                    ? ar
                      ? 'حفظ كلمة المرور'
                      : 'Save password'
                    : ar
                      ? 'تسجيل الدخول'
                      : 'Sign in'}
        <span aria-hidden="true">↗</span>
      </button>
      <div className="auth-links">
        {mode === 'login' ? (
          <>
            <Link href={`/${locale}/register`}>
              {ar ? 'حساب جديد' : 'Create an account'}
            </Link>
            <Link href={`/${locale}/resend-verification`}>
              {ar ? 'إعادة إرسال رسالة التأكيد' : 'Resend verification email'}
            </Link>
            <Link href={`/${locale}/forgot-password`}>
              {ar ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
            </Link>
          </>
        ) : (
          <Link href={`/${locale}/login`}>
            {ar ? 'لديك حساب؟ تسجيل الدخول' : 'Already registered? Sign in'}
          </Link>
        )}
      </div>
    </form>
  );
}
