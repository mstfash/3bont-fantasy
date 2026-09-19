import { Star, Trophy, Shield, Zap, Crown } from 'lucide-react';
import type { Locale } from '@/lib/brand';
import type { AchievementDefinition } from '@fantasy/contracts';
import '@/styles/achievements.css';
export const achievementIcons = {
  star: Star,
  trophy: Trophy,
  shield: Shield,
  bolt: Zap,
  crown: Crown,
};
export function AchievementBadges({
  locale,
  badges,
}: {
  readonly locale: Locale;
  readonly badges: readonly {
    id: string;
    name: { ar: string; en: string };
    description: { ar: string; en: string };
    icon: AchievementDefinition['icon'];
    scope: 'entry' | 'account';
    version: number;
    witnessRounds: readonly number[];
    entryName?: string | null;
  }[];
}) {
  const ar = locale === 'ar';
  if (!badges.length) return null;
  return (
    <section className="achievement-section">
      <h2>{ar ? 'إنجازات الملعب' : 'EARNED ON THE PITCH'}</h2>
      <div className="achievement-grid">
        {badges.map((b) => {
          const Icon = achievementIcons[b.icon];
          return (
            <article key={b.id} className="achievement-badge">
              <Icon aria-hidden size={32} />
              <div>
                <h3>{b.name[locale]}</h3>
                <p>{b.description[locale]}</p>
                <small>
                  {b.entryName ??
                    (b.scope === 'account'
                      ? ar
                        ? 'إنجاز الحساب'
                        : 'Account achievement'
                      : ar
                        ? 'إنجاز الفريق'
                        : 'Squad achievement')}{' '}
                  · v{b.version}
                  {b.witnessRounds.length > 0
                    ? ` · ${ar ? 'الجولات' : 'Rounds'} ${b.witnessRounds.join(', ')}`
                    : ''}
                </small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
