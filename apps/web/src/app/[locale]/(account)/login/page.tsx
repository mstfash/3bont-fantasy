import { notFound } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
export default async function LoginPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'ar' && locale !== 'en') notFound();
  return (
    <>
      <span className="eyebrow">WELCOME BACK / أهلاً بعودتك</span>
      <h2>{locale === 'ar' ? 'جاهز للجولة؟' : 'READY FOR THE ROUND?'}</h2>
      <p>
        {locale === 'ar'
          ? 'سجّل دخولك وارجع للمنافسة.'
          : 'Sign in and get back in the game.'}
      </p>
      <AuthForm locale={locale} mode="login" />
    </>
  );
}
