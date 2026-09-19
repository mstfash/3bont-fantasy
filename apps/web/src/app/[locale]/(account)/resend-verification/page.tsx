import { AuthForm } from '@/components/auth-form';
import { requireLocale } from '@/lib/locale';
export default async function ResendVerificationPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar';
  return (
    <>
      <h2>{ar ? 'فعّل حسابك.' : 'ACTIVATE YOUR ACCOUNT.'}</h2>
      <p>
        {ar
          ? 'أدخل البريد الذي سجلت به لطلب رسالة تأكيد جديدة. الرابط صالح لمدة ساعة.'
          : 'Enter the address you registered with to request a fresh verification email. The link is valid for one hour.'}
      </p>
      <AuthForm locale={locale} mode="verify" />
    </>
  );
}
