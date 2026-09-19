import { notFound } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
export default async function RegisterPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'ar' && locale !== 'en') notFound();
  return (
    <>
      <span className="eyebrow">YOUR FIRST WHISTLE / البداية من هنا</span>
      <h2>{locale === 'ar' ? 'ابدأ حكايتك.' : 'MAKE YOUR MARK.'}</h2>
      <p>
        {locale === 'ar'
          ? 'أنشئ حسابك، ثم أكد بريدك الإلكتروني لتبدأ تكوين فريقك.'
          : 'Create your account, then verify your email to start building your squad.'}
      </p>
      <AuthForm locale={locale} mode="register" />
    </>
  );
}
