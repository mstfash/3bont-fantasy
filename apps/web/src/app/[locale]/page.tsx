import Link from 'next/link';
import { competitionSchema } from '@fantasy/contracts';
import { SiteShell } from '@/components/site-shell';
import { requireLocale } from '@/lib/locale';
import { getRuntime } from '@/server/runtime';
import { currentSession } from '@/server/session';

export default async function Home({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale);
  const ar = locale === 'ar';
  const [rows, session] = await Promise.all([
    getRuntime()
      .db.selectFrom('competitions')
      .select('data')
      .orderBy('slug')
      .execute(),
    currentSession(),
  ]);
  const competitions = rows
    .map((row) => competitionSchema.parse(row.data))
    .filter((c) => ['published', 'running'].includes(c.status));
  return (
    <SiteShell locale={locale} signedIn={session !== null}>
      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow">
            {ar
              ? '٣ بونط فانتازي / الدوري المصري'
              : '3BONT FANTASY / EGYPTIAN FOOTBALL'}
          </p>
          <h1>
            {ar ? (
              <>
                الملعب ليهم.
                <br />
                <em>القرار ليك.</em>
              </>
            ) : (
              <>
                THEY PLAY.
                <br />
                <em>YOU DECIDE.</em>
              </>
            )}
          </h1>
          <p className="hero-description">
            {ar
              ? 'كوّن فريقك. اختار كابتنك. وخلّي كل جولة حكاية جديدة بينك وبين أصحابك.'
              : 'Build your squad. Choose your captain. Make every gameweek a new story between you and your friends.'}
          </p>
          <Link
            className="action-button"
            href={`/${locale}/${session ? 'dashboard' : 'register'}`}
          >
            {ar ? 'ابدأ حكايتك' : 'BUILD YOUR STORY'}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="hero-pitch" aria-hidden="true">
          <div className="pitch-lines">
            <div className="pitch-circle" />
            <div className="pitch-box top" />
            <div className="pitch-box bottom" />
          </div>
          <span className="pitch-number">3</span>
          <div className="pitch-stamp">
            YOUR SQUAD.
            <br />
            YOUR RULE.
          </div>
          <span className="pitch-coordinate">30.0444° N / 31.2357° E</span>
        </div>
      </section>
      <section className="ticker" aria-label={ar ? 'الفكرة' : 'The idea'}>
        <span>{ar ? 'اختار' : 'SELECT'}</span>
        <span aria-hidden="true">✳</span>
        <span>{ar ? 'خطّط' : 'STRATEGIZE'}</span>
        <span aria-hidden="true">✳</span>
        <span>{ar ? 'نافس' : 'COMPETE'}</span>
        <span aria-hidden="true">✳</span>
        <span>3BONT FANTASY</span>
      </section>
      <section className="content-section" id="competitions">
        <div className="section-heading">
          <span className="eyebrow">
            01 / {ar ? 'البطولات' : 'COMPETITIONS'}
          </span>
          <h2>{ar ? 'اختار ملعبك.' : 'PICK YOUR ARENA.'}</h2>
        </div>
        {competitions.length === 0 ? (
          <div className="empty-state">
            <h3>
              {ar ? 'الموسم القادم يبدأ هنا.' : 'THE NEXT SEASON STARTS HERE.'}
            </h3>
            <p>
              {ar
                ? 'لا توجد بطولات مفتوحة حالياً. أنشئ حسابك لتكون جاهزاً عندما يبدأ التسجيل.'
                : 'There are no open competitions yet. Create your account so you are ready when registration opens.'}
            </p>
          </div>
        ) : (
          <div className="competition-grid">
            {competitions.map((c) => (
              <Link
                className="competition-card"
                href={`/${locale}/competitions/${c.slug}`}
                key={c.id}
              >
                <span className="eyebrow">
                  {c.status === 'running'
                    ? ar
                      ? 'المنافسة مستمرة'
                      : 'SEASON IN PLAY'
                    : ar
                      ? 'بطولة منشورة'
                      : 'COMPETITION'}
                </span>
                <h3>{c.name[locale]}</h3>
                <p>{c.description[locale]}</p>
                <span className="card-arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="content-section how-section" id="how-to-play">
        <div className="section-heading">
          <span className="eyebrow">
            02 / {ar ? 'إزاي تلعب' : 'HOW TO PLAY'}
          </span>
          <h2>{ar ? 'الكورة بتبدأ من عندك.' : 'FOOTBALL STARTS WITH YOU.'}</h2>
        </div>
        <div className="steps-grid">
          {(ar
            ? [
                [
                  '01',
                  'كوّن تشكيلتك',
                  'اختار لاعبيك ضمن ميزانية البطولة، ووازن بين النجوم والاختيارات الذكية.',
                ],
                [
                  '02',
                  'اخطف الجولة',
                  'حدّد الأساسيين والكابتن قبل الموعد النهائي. كل قرار له وزنه.',
                ],
                [
                  '03',
                  'نافس أصحابك',
                  'تابع نقاطك مع المباريات، وتحدّى نفسك مع كل جولة جديدة.',
                ],
              ]
            : [
                [
                  '01',
                  'BUILD THE SQUAD',
                  'Choose footballers within the competition budget. Balance the stars with your smartest picks.',
                ],
                [
                  '02',
                  'OWN THE GAMEWEEK',
                  'Set your lineup and captain before the deadline. Every decision counts.',
                ],
                [
                  '03',
                  'MAKE IT PERSONAL',
                  'Follow your points as matches unfold. Find a new challenge with every gameweek.',
                ],
              ]
          ).map(([n, title, detail]) => (
            <article key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
