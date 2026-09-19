import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { fetchProviderResource } from '../packages/application/dist/index.js';
import { clubSchema, seasonSchema } from '../packages/contracts/dist/index.js';
export async function exerciseProviderIdentities(
  page,
  pool,
  db,
  base,
  accountId,
) {
  const season = seasonSchema.parse({
    id: randomUUID(),
    name: { ar: 'موسم اختبار الربط', en: 'QA identity season' },
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2027-01-01T00:00:00Z',
    synthetic: true,
  });
  const club = clubSchema.parse({
    id: randomUUID(),
    seasonId: season.id,
    name: { ar: 'نادي اختبار الربط', en: 'QA mapped club' },
    shortName: 'QAM',
    color: '#123456',
  });
  let bindingId = null;
  try {
    await pool.query('INSERT INTO fantasy.seasons(id,data) VALUES($1,$2)', [
      season.id,
      season,
    ]);
    await pool.query(
      'INSERT INTO fantasy.clubs(id,season_id,data) VALUES($1,$2,$3)',
      [club.id, season.id, club],
    );
    for (const [request, response] of [
      [
        { resource: 'leagues', country: 'Egypt', season: 2026 },
        [
          {
            league: { id: 900099, name: 'QA source league' },
            country: { name: 'Egypt' },
            seasons: [{ year: 2026 }],
          },
        ],
      ],
      [
        { resource: 'teams', league: 900099, season: 2026 },
        [{ team: { id: 900101, name: 'QA source club' } }],
      ],
    ]) {
      // Advance only the isolated QA account. The injected transport never calls the provider.
      await pool.query(
        'UPDATE fantasy.provider_accounts SET next_dispatch_at=NULL,cooldown_until=NULL WHERE id=$1',
        [accountId],
      );
      const result = await fetchProviderResource(
        db,
        {
          accountId,
          request,
          priority: 'ordinary',
          apiKey: 'qa-synthetic-provider-key',
        },
        async () =>
          Response.json({
            get: request.resource,
            parameters: {},
            errors: [],
            results: response.length,
            paging: { current: 1, total: 1 },
            response,
          }),
      );
      assert.equal(result.outcome, 'success');
    }
    await page.goto(`${base}/en/admin/providers/identities`);
    await page.getByLabel('App season').selectOption(season.id);
    await page
      .getByLabel('Source-use authorization reference')
      .fill('QA synthetic data, no external rights claim');
    await page
      .getByLabel('Mapping review reason')
      .fill('QA reviewed season binding from saved evidence');
    await page
      .getByRole('button', { name: 'REVIEW IDENTITY MAPPING', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(page.getByLabel('Matching app record')).toBeVisible();
    bindingId = (
      await pool.query(
        'SELECT id FROM fantasy.provider_season_bindings WHERE season_id=$1',
        [season.id],
      )
    ).rows[0].id;
    await page.getByLabel('Matching app record').selectOption(club.id);
    await page
      .getByLabel('Mapping review reason')
      .fill('QA confirm club identity using stable provider ID');
    await page
      .getByRole('button', { name: 'REVIEW IDENTITY MAPPING', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: '900101', exact: true }) });
    await expect(row).toContainText('1 · Active');
    await page.screenshot({
      path: 'artifacts/web/provider-identities-en.png',
      fullPage: true,
    });
    await row.getByText('Retire mapping', { exact: true }).click();
    await row
      .getByLabel('Retirement reason')
      .fill('QA retire identity while retaining its evidence');
    await row
      .getByRole('button', { name: 'REVIEW MAPPING RETIREMENT', exact: true })
      .click();
    await row
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(row).toContainText('2 · Retired');
    await page
      .getByLabel('Mapping review reason')
      .fill('QA reactivate reviewed original club identity');
    await page
      .getByRole('button', { name: 'REVIEW IDENTITY MAPPING', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(row).toContainText('3 · Active');
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM fantasy.provider_identity_history h JOIN fantasy.provider_identities i ON i.id=h.mapping_id WHERE i.binding_id=$1',
          [bindingId],
        )
      ).rows[0].n,
      3,
    );
    await page.goto(
      `${base}/ar/admin/providers/identities?binding=${bindingId}&kind=club`,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('heading', {
        name: 'هوية ثابتة. دليل محفوظ.',
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: 'artifacts/web/provider-identities-ar-mobile.png',
      fullPage: true,
    });
  } finally {
    const binding =
      bindingId ??
      (
        await pool.query(
          'SELECT id FROM fantasy.provider_season_bindings WHERE season_id=$1',
          [season.id],
        )
      ).rows[0]?.id;
    if (binding) {
      await pool.query(
        'DELETE FROM fantasy.audit_events WHERE scope_id=$1::text OR scope_id IN (SELECT id::text FROM fantasy.provider_identities WHERE binding_id=$1::uuid)',
        [binding],
      );
      await pool.query(
        "DELETE FROM fantasy.commands WHERE result->'binding'->>'id'=$1",
        [binding],
      );
      await pool.query(
        'DELETE FROM fantasy.provider_identity_history WHERE mapping_id IN (SELECT id FROM fantasy.provider_identities WHERE binding_id=$1)',
        [binding],
      );
      await pool.query(
        'DELETE FROM fantasy.provider_identities WHERE binding_id=$1',
        [binding],
      );
      await pool.query(
        'DELETE FROM fantasy.provider_season_bindings WHERE id=$1',
        [binding],
      );
    }
    await pool.query('DELETE FROM fantasy.clubs WHERE id=$1', [club.id]);
    await pool.query('DELETE FROM fantasy.seasons WHERE id=$1', [season.id]);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.goto(`${base}/en/admin/providers`);
  console.log(
    'Source-backed season binding, reviewed identity mapping, retirement, reactivation, retained history and Arabic mobile passed.',
  );
}
