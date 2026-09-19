import { notFound } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
export default async function ForgotPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'ar' && locale !== 'en') notFound();
  return (
    <>
      <h2>{locale === 'ar' ? 'استعد حسابك.' : 'BACK IN THE GAME.'}</h2>
      <p>
        {locale === 'ar'
          ? 'أدخل بريدك الإلكتروني وسنرسل لك رابط الاستعادة.'
          : 'Enter your email for a password reset link.'}
      </p>
      <AuthForm locale={locale} mode="forgot" />
    </>
  );
}
