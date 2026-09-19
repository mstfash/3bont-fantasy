import { activeSponsor, issueSponsorMetricToken } from '@fantasy/application';
import type { SponsorSlot as Slot } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { getRuntime } from '@/server/runtime';
import { SponsorBanner } from './sponsor-banner';
export async function SponsorSlot({
  locale,
  slot,
  competitionId,
}: {
  readonly locale: Locale;
  readonly slot: Slot;
  readonly competitionId: string | null;
}) {
  const { db, config } = getRuntime(),
    campaign = await activeSponsor(db, slot, competitionId);
  if (!campaign) return null;
  return (
    <SponsorBanner
      key={`${campaign.id}:${String(campaign.revision)}`}
      locale={locale}
      assetId={campaign.assets[locale]}
      name={campaign.name[locale]}
      description={campaign.description[locale]}
      destination={campaign.destination}
      compact={slot === 'header'}
      token={issueSponsorMetricToken(
        campaign,
        locale,
        config.BETTER_AUTH_SECRET,
      )}
    />
  );
}
