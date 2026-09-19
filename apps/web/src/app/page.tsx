import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export default async function Home() {
  redirect(
    (await cookies()).get('fantasy-locale')?.value === 'en' ? '/en' : '/ar',
  );
}
