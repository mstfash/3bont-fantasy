import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
export async function exerciseCatalogueImport(page, pool, base) {
  const manifest = JSON.parse(
    await readFile('apps/web/public/templates/catalogue-example.json', 'utf8'),
  );
  const ids = new Map(
    manifest.items.map((item) => [item[item.kind].id, randomUUID()]),
  );
  for (const item of manifest.items) {
    item.commandId = randomUUID();
    const doc = item[item.kind];
    doc.id = ids.get(doc.id);
    if (doc.seasonId) doc.seasonId = ids.get(doc.seasonId);
    if (doc.clubId) doc.clubId = ids.get(doc.clubId);
  }
  const season = manifest.items.find((i) => i.kind === 'season').season;
  season.name.en = `Browser import ${randomUUID().slice(0, 8)}`;
  const upload = async (label, data) =>
    page.getByLabel(label, { exact: true }).setInputFiles({
      name: 'reviewed-catalogue.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data)),
    });
  try {
    await page.goto(`${base}/en/admin/catalogue/import`);
    await upload('Import file', manifest);
    await page
      .getByRole('button', { name: 'Preview batch', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: '2. REVIEW THE CHANGES', exact: true }),
    ).toBeVisible();
    assert.equal(
      (
        await pool.query('SELECT id FROM fantasy.seasons WHERE id=$1', [
          season.id,
        ])
      ).rows.length,
      0,
    );
    await page.locator('summary').first().click();
    await page.screenshot({
      path: 'artifacts/web/catalogue-import-en.png',
      fullPage: true,
    });
    await page
      .getByLabel(
        'I reviewed the records, sources and valuation display rights.',
      )
      .check();
    await page
      .getByRole('button', { name: 'Confirm batch import', exact: true })
      .click();
    await expect(page.getByRole('status')).toHaveText(
      'Accepted 3 records together.',
    );
    const response = await page.request.get(
      `${base}/api/v1/admin/catalogue/export?season=${season.id}`,
    );
    assert.equal(response.status(), 200);
    const exported = await response.json();
    assert.equal(exported.items.length, 3);
    assert.ok(
      exported.items.every((i) =>
        /^[a-f0-9]{64}$/u.test(i.expectedFingerprint),
      ),
    );
    await page.goto(`${base}/ar/admin/catalogue/import`);
    await page.setViewportSize({ width: 390, height: 844 });
    await upload('ملف الاستيراد', exported);
    await page
      .getByRole('button', { name: 'مراجعة الدفعة', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: '٢. راجع التغييرات', exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: 'artifacts/web/catalogue-import-ar-mobile.png',
      fullPage: true,
    });
    const invalid = structuredClone(exported),
      player = invalid.items.find((i) => i.kind === 'footballer');
    player.footballer.clubId = randomUUID();
    await upload('ملف الاستيراد', invalid);
    await page
      .getByRole('button', { name: 'مراجعة الدفعة', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('لم تُطبّق الدفعة.');
    const saved = (
      await pool.query('SELECT data FROM fantasy.footballers WHERE id=$1', [
        player.footballer.id,
      ])
    ).rows[0].data;
    assert.notEqual(saved.clubId, player.footballer.clubId);
  } finally {
    const entityIds = [...ids.values()];
    await pool.query('DELETE FROM fantasy.footballers WHERE season_id=$1', [
      season.id,
    ]);
    await pool.query('DELETE FROM fantasy.clubs WHERE season_id=$1', [
      season.id,
    ]);
    await pool.query('DELETE FROM fantasy.seasons WHERE id=$1', [season.id]);
    await pool.query(
      "DELETE FROM fantasy.audit_events WHERE scope_id=ANY($1::text[]) OR (action=$2 AND payload->>'sourceName'=$3 AND payload->'entities' @> $4::jsonb)",
      [
        entityIds,
        'catalogue.batch-imported',
        manifest.sourceName,
        JSON.stringify([{ id: season.id }]),
      ],
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.goto(`${base}/en/admin`);
  console.log(
    'Catalogue batch preview, atomic apply, revision export, invalid-row rollback and Arabic mobile passed.',
  );
}
