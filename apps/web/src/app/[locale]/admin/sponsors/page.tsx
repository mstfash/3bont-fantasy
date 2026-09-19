import { notFound } from 'next/navigation';
import {
  capabilityScopes,
  readSponsorAdministration,
} from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { SponsorAssetUpload } from '@/components/sponsors/asset-upload';
import {
  SponsorCampaignEditor,
  SponsorPublication,
} from '@/components/sponsors/campaign-editor';
import { requireLocale } from '@/lib/locale';
import { requireStaffSession } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
import '@/styles/results.css';
import '@/styles/sponsors.css';
export default async function Sponsors({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ competition?: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar',
    context = await requireStaffSession(locale),
    db = getRuntime().db,
    scopes = capabilityScopes(context.grants, 'sponsors.manage'),
    global = scopes.includes(null),
    ids = scopes.filter((s) => s !== null);
  if (!global && !ids.length) notFound();
  const competitions = await db
    .selectFrom('competitions')
    .select('data')
    .$if(!global, (q) => q.where('id', 'in', ids))
    .orderBy('slug')
    .execute();
  const selected =
      (await searchParams).competition ??
      (global ? 'global' : competitions[0]?.data.id),
    competitionId = selected === 'global' ? null : selected;
  if (
    competitionId === undefined ||
    (competitionId === null && !global) ||
    (competitionId !== null &&
      !competitions.some((c) => c.data.id === competitionId))
  )
    notFound();
  const data = await readSponsorAdministration(
    db,
    context.principal,
    context.grants,
    competitionId,
  );
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar ? 'إدارة الرعاية' : 'PARTNER OPERATIONS'}
        </span>
        <h1>{ar ? 'شراكة واضحة.' : 'PARTNERS. IN PLAIN SIGHT.'}</h1>
        <p>
          {ar
            ? 'صور معتمدة، مواعيد واضحة، وإفصاح ظاهر عن الرعاية.'
            : 'Approved artwork, clear schedules and visible sponsorship disclosure.'}
        </p>
      </div>
      <form className="group-form" method="get">
        <label>
          {ar ? 'نطاق الرعاية' : 'Sponsor scope'}
          <select name="competition" defaultValue={selected}>
            {global && (
              <option value="global">
                {ar ? 'ترويسة الموقع — عام' : 'Site header — global'}
              </option>
            )}
            {competitions.map((c) => (
              <option key={c.data.id} value={c.data.id}>
                {c.data.name[locale]}
              </option>
            ))}
          </select>
        </label>
        <button className="button-outline">{ar ? 'عرض' : 'Show'}</button>
      </form>
      <section className="group-card">
        <h2>{ar ? 'صور الرعاية' : 'Sponsor artwork'}</h2>
        <SponsorAssetUpload locale={locale} competitionId={competitionId} />
        <div className="sponsor-assets">
          {data.assets.map((a) => (
            <figure key={a.id}>
              <img
                src={`/api/v1/sponsors/assets/${a.id}`}
                alt={a.label}
                width={a.width}
                height={a.height}
                loading="lazy"
              />
              <figcaption>
                {a.label} ·{' '}
                <bdi>
                  {a.width} × {a.height}
                </bdi>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section className="group-card">
        <h2>{ar ? 'حملة جديدة' : 'New campaign'}</h2>
        {data.assets.length ? (
          <SponsorCampaignEditor
            locale={locale}
            competitionId={competitionId}
            campaign={null}
            assets={data.assets}
          />
        ) : (
          <p>
            {ar
              ? 'ارفع صورة معتمدة للبدء.'
              : 'Upload approved artwork to begin.'}
          </p>
        )}
      </section>
      {data.campaigns.map((c) => (
        <section className="group-card" key={c.id}>
          <span className="eyebrow">
            {c.state === 'draft'
              ? ar
                ? 'مسودة'
                : 'DRAFT'
              : c.state === 'paused'
                ? ar
                  ? 'متوقفة'
                  : 'PAUSED'
                : ar
                  ? 'منشورة'
                  : 'PUBLISHED'}{' '}
            · v{c.revision}
          </span>
          <h2>{c.name[locale]}</h2>
          <p>{c.description[locale]}</p>
          <p>
            <bdi>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Africa/Cairo',
              }).format(new Date(c.startsAt))}
            </bdi>{' '}
            —{' '}
            <bdi>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Africa/Cairo',
              }).format(new Date(c.endsAt))}
            </bdi>
          </p>
          <p>
            {ar ? 'الموضع' : 'Placement'}:{' '}
            {c.slot === 'header'
              ? ar
                ? 'ترويسة الموقع'
                : 'Site header'
              : c.slot === 'competition'
                ? ar
                  ? 'صفحة البطولة'
                  : 'Competition page'
                : ar
                  ? 'صفحات الجوائز'
                  : 'Prize pages'}{' '}
            · {ar ? 'الأولوية' : 'Priority'}: {c.priority}
          </p>
          <details>
            <summary>
              {ar ? 'معاينة النسختين' : 'Preview both languages'}
            </summary>
            <div className="sponsor-assets">
              {(['ar', 'en'] as const).map((language) => (
                <figure key={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
                  <img
                    src={`/api/v1/sponsors/assets/${c.assets[language]}`}
                    alt={c.name[language]}
                    width={320}
                    height={120}
                    loading="lazy"
                  />
                  <figcaption>
                    <strong>{c.name[language]}</strong>
                    <p>{c.description[language]}</p>
                    <a
                      href={c.destination}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {c.destination}
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </details>
          {c.state !== 'published' && (
            <details>
              <summary>{ar ? 'تحرير المسودة' : 'Edit draft'}</summary>
              <SponsorCampaignEditor
                locale={locale}
                competitionId={competitionId}
                campaign={c}
                assets={data.assets}
              />
            </details>
          )}
          <SponsorPublication locale={locale} campaign={c} />
        </section>
      ))}
      <section className="group-card">
        <h2>{ar ? 'تقرير الرعاية' : 'Sponsor report'}</h2>
        <p>
          {ar
            ? 'آخر ٣٠ يوماً تقويمياً بتوقيت القاهرة'
            : 'Last 30 calendar days in Cairo'}{' '}
          ·{' '}
          <bdi>
            {data.reportSince} — {data.today}
          </bdi>
        </p>
        <p>
          {ar
            ? 'الظهور يُسجل بعد رؤية نصف الإعلان لمدة ثانية، والنقر عند اختيار الرابط. تُستبعد أنماط الزواحف المعروفة وتكرارات رمز الصفحة. أرقام تقريبية وليست ضماناً للفوترة؛ لا ملفات تعريف للأشخاص.'
            : 'An impression requires half the placement visible for one second; a click records link activation. Known crawler patterns and repeated page-token events are excluded. Approximate reporting, not billing-grade counts; no participant profiles.'}
        </p>
        <div className="results-scroll">
          <table className="results-table">
            <thead>
              <tr>
                <th>{ar ? 'الحملة' : 'Campaign'}</th>
                <th>{ar ? 'الإصدار' : 'Revision'}</th>
                <th>{ar ? 'اللغة' : 'Language'}</th>
                <th>{ar ? 'الظهور' : 'Impressions'}</th>
                <th>{ar ? 'النقرات' : 'Clicks'}</th>
              </tr>
            </thead>
            <tbody>
              {data.metrics.map((m) => (
                <tr key={`${m.campaign_id}:${String(m.revision)}:${m.locale}`}>
                  <td>
                    {
                      data.campaigns.find((c) => c.id === m.campaign_id)?.name[
                        locale
                      ]
                    }
                  </td>
                  <td>{m.revision}</td>
                  <td>{m.locale === 'ar' ? 'العربية' : 'English'}</td>
                  <td>{Number(m.impressions).toLocaleString(locale)}</td>
                  <td>{Number(m.clicks).toLocaleString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
