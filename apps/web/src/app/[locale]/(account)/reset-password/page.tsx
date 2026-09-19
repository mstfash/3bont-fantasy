import { notFound } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
export default async function ResetPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale } = await params;
  if (locale !== 'ar' && locale !== 'en') notFound();
  const query = await searchParams;
  const token = typeof query.token === 'string' ? query.token : '';
  return (
    <>
      <h2>{locale === 'ar' ? 'كلمة مرور جديدة.' : 'A FRESH START.'}</h2>
      {!token && (
        <p role="alert">
          {locale === 'ar'
            ? 'رابط الاستعادة غير صالح. اطلب رابطاً جديداً.'
            : 'Invalid reset link. Request a new one.'}
        </p>
      )}
      <AuthForm locale={locale} mode="reset" token={token} />
    </>
  );
}
