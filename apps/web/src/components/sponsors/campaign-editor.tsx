'use client';
import { useRouter } from 'next/navigation';
import {
  sponsorCommandSchema,
  sponsorCommandResultSchema,
  type SponsorCampaign,
} from '@fantasy/contracts';
import { ReviewedCommandForm } from '../reviewed-command-form';
import { CairoDateTime } from '../cairo-date-time';
import { formText } from '../groups/reviewed-form';
import type { Locale } from '@/lib/brand';
export function SponsorCampaignEditor({
  locale,
  competitionId,
  campaign,
  assets,
}: {
  readonly locale: Locale;
  readonly competitionId: string | null;
  readonly campaign: SponsorCampaign | null;
  readonly assets: readonly { id: string; label: string }[];
}) {
  const ar = locale === 'ar',
    router = useRouter();
  return (
    <ReviewedCommandForm
      locale={locale}
      label={ar ? 'مراجعة مسودة الرعاية' : 'Review sponsor draft'}
      endpoint="/api/v1/admin/sponsors"
      commandSchema={sponsorCommandSchema}
      resultSchema={sponsorCommandResultSchema}
      onSaved={() => {
        router.refresh();
      }}
      makeCommand={(form) => ({
        kind: campaign ? 'update' : 'create',
        commandId: crypto.randomUUID(),
        competitionId,
        ...(campaign
          ? { campaignId: campaign.id, expectedRevision: campaign.revision }
          : {}),
        name: { ar: formText(form, 'nameAr'), en: formText(form, 'nameEn') },
        description: {
          ar: formText(form, 'descriptionAr'),
          en: formText(form, 'descriptionEn'),
        },
        assets: {
          ar: formText(form, 'assetAr'),
          en: formText(form, 'assetEn'),
        },
        destination: formText(form, 'destination'),
        slot: formText(form, 'slot'),
        startsAt: formText(form, 'startsAt'),
        endsAt: formText(form, 'endsAt'),
        priority: Number(formText(form, 'priority')),
        reason: formText(form, 'reason'),
      })}
    >
      <div className="form-pair">
        <label>
          {ar ? 'اسم الراعي بالعربية' : 'Arabic sponsor name'}
          <input
            name="nameAr"
            defaultValue={campaign?.name.ar ?? ''}
            required
            maxLength={200}
          />
        </label>
        <label>
          {ar ? 'اسم الراعي بالإنجليزية' : 'English sponsor name'}
          <input
            name="nameEn"
            defaultValue={campaign?.name.en ?? ''}
            required
            maxLength={200}
          />
        </label>
      </div>
      <div className="form-pair">
        <label>
          {ar ? 'الوصف بالعربية' : 'Arabic sponsor description'}
          <textarea
            name="descriptionAr"
            defaultValue={campaign?.description.ar ?? ''}
            required
            maxLength={200}
          />
        </label>
        <label>
          {ar ? 'الوصف بالإنجليزية' : 'English sponsor description'}
          <textarea
            name="descriptionEn"
            defaultValue={campaign?.description.en ?? ''}
            required
            maxLength={200}
          />
        </label>
      </div>
      <div className="form-pair">
        <label>
          {ar ? 'الصورة العربية' : 'Arabic artwork'}
          <select
            aria-label={ar ? 'الصورة العربية' : 'Arabic artwork'}
            name="assetAr"
            defaultValue={campaign?.assets.ar ?? ''}
            required
          >
            <option value="">{ar ? 'اختر صورة' : 'Choose artwork'}</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {ar ? 'الصورة الإنجليزية' : 'English artwork'}
          <select
            aria-label={ar ? 'الصورة الإنجليزية' : 'English artwork'}
            name="assetEn"
            defaultValue={campaign?.assets.en ?? ''}
            required
          >
            <option value="">{ar ? 'اختر صورة' : 'Choose artwork'}</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {ar ? 'رابط الراعي HTTPS' : 'Sponsor HTTPS destination'}
        <input
          name="destination"
          type="url"
          required
          maxLength={2000}
          defaultValue={campaign?.destination ?? ''}
        />
      </label>
      <label>
        {ar ? 'موضع الرعاية' : 'Placement'}
        <select
          name="slot"
          defaultValue={
            campaign?.slot ?? (competitionId ? 'competition' : 'header')
          }
        >
          {competitionId ? (
            <>
              <option value="competition">
                {ar ? 'صفحة البطولة' : 'Competition page'}
              </option>
              <option value="prize">
                {ar ? 'صفحات الجوائز' : 'Prize pages'}
              </option>
            </>
          ) : (
            <option value="header">
              {ar ? 'ترويسة الموقع' : 'Site header'}
            </option>
          )}
        </select>
      </label>
      <div className="form-pair">
        <CairoDateTime
          locale={locale}
          name="startsAt"
          label={ar ? 'بداية الحملة' : 'Campaign starts'}
          initialValue={campaign?.startsAt ?? ''}
        />
        <CairoDateTime
          locale={locale}
          name="endsAt"
          label={ar ? 'نهاية الحملة' : 'Campaign ends'}
          initialValue={campaign?.endsAt ?? ''}
        />
      </div>
      <label>
        {ar
          ? 'الأولوية (الأعلى يظهر أولاً)'
          : 'Priority (highest appears first)'}
        <input
          name="priority"
          type="number"
          min={0}
          max={100}
          required
          defaultValue={campaign?.priority ?? 10}
        />
      </label>
      <label>
        {ar ? 'سبب المسودة' : 'Draft reason'}
        <textarea name="reason" minLength={5} maxLength={1000} required />
      </label>
    </ReviewedCommandForm>
  );
}
export function SponsorPublication({
  locale,
  campaign,
}: {
  readonly locale: Locale;
  readonly campaign: SponsorCampaign;
}) {
  const ar = locale === 'ar',
    router = useRouter(),
    pause = campaign.state === 'published';
  return (
    <ReviewedCommandForm
      locale={locale}
      label={
        pause
          ? ar
            ? 'إيقاف الحملة'
            : 'Pause campaign'
          : ar
            ? 'نشر الحملة'
            : 'Publish campaign'
      }
      endpoint="/api/v1/admin/sponsors"
      commandSchema={sponsorCommandSchema}
      resultSchema={sponsorCommandResultSchema}
      onSaved={() => {
        router.refresh();
      }}
      makeCommand={(form) => ({
        kind: pause ? 'pause' : 'publish',
        commandId: crypto.randomUUID(),
        campaignId: campaign.id,
        competitionId: campaign.competitionId,
        expectedRevision: campaign.revision,
        ...(pause
          ? {}
          : {
              authorizationReference: formText(form, 'authorizationReference'),
            }),
        reason: formText(form, 'reason'),
      })}
    >
      {!pause && (
        <label>
          {ar
            ? 'مرجع اعتماد الصور والرابط والنصوص'
            : 'Artwork, destination and copy approval reference'}
          <input
            name="authorizationReference"
            minLength={5}
            maxLength={1000}
            required
          />
        </label>
      )}
      <label>
        {ar ? 'سبب الإجراء' : 'Action reason'}
        <textarea name="reason" minLength={5} maxLength={1000} required />
      </label>
    </ReviewedCommandForm>
  );
}
