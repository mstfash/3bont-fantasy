import { requireLocale } from '@/lib/locale';
import { PlayerGuidePage } from '@/components/help/player-guide-page';
export default async function Page({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ competition?: string; gameweek?: string }>;
}) {
  const locale = requireLocale((await params).locale);
  return (
    <PlayerGuidePage
      locale={locale}
      kind="playbook"
      query={await searchParams}
    />
  );
}
