'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { Locale } from '@/lib/brand';
import { helpCopy, pageHelpTopic, type HelpTopic } from '@/lib/help/topics';
import { InfoTip } from './info-tip';
export function TopicHelp({
  locale,
  topic,
}: {
  readonly locale: Locale;
  readonly topic: HelpTopic;
}) {
  const copy = helpCopy(topic, locale);
  return (
    <span className="topic-help">
      <InfoTip locale={locale} label={copy.title} text={copy.text} />
      <span>{copy.title}</span>
    </span>
  );
}
export function PageHelp({ locale }: { readonly locale: Locale }) {
  const path = usePathname();
  const params = useSearchParams();
  const competition =
    params.get('competition') ??
    (!path.includes('/admin')
      ? /\/competitions\/([^/]+)/u.exec(path)?.[1]
      : undefined);
  const guideQuery = new URLSearchParams();
  if (competition) guideQuery.set('competition', competition);
  const round = params.get('gameweek');
  if (round) guideQuery.set('gameweek', round);
  const suffix = guideQuery.size ? `?${guideQuery.toString()}` : '';
  const admin = path.includes('/admin');
  return (
    <aside
      className="page-help"
      aria-label={locale === 'ar' ? 'مساعدة الصفحة' : 'Page help'}
    >
      <TopicHelp locale={locale} topic={pageHelpTopic(path)} />
      <nav aria-label={locale === 'ar' ? 'أدلة المساعدة' : 'Help guides'}>
        {admin && (
          <Link href={`/${locale}/admin/how-to`}>
            {locale === 'ar' ? 'دليل الإدارة' : 'Admin handbook'}
          </Link>
        )}
        <Link href={`/${locale}/how-to-play${suffix}`}>
          {locale === 'ar' ? 'إزاي تلعب' : 'How to play'}
        </Link>
        <Link href={`/${locale}/playbook${suffix}`}>
          {locale === 'ar' ? 'دليل اللعب' : 'Playbook'}
        </Link>
      </nav>
    </aside>
  );
}
