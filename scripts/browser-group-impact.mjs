import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import {
  leagueGroupSchema,
  headToHeadEditionSchema,
} from '../packages/contracts/dist/index.js';

/** Disposable group scopes over the existing synthetic replay; no source facts or published scores change. */
export async function exerciseGroupImpact(page, pool, base) {
  const competition = (
    await pool.query(
      "SELECT data FROM fantasy.competitions WHERE slug='cairo-replay'",
    )
  ).rows[0].data;
  const round = (
    await pool.query(
      'SELECT data FROM fantasy.gameweeks WHERE competition_id=$1 AND number=1',
      [competition.id],
    )
  ).rows[0].data;
  const entries = (
    await pool.query(
      'SELECT e.data FROM fantasy.entries e JOIN fantasy.entry_results r ON r.entry_id=e.id WHERE r.gameweek_id=$1 AND r.revision=$2 ORDER BY e.id LIMIT 2',
      [round.id, round.resultRevision],
    )
  ).rows.map((r) => r.data);
  assert.equal(entries.length, 2);
  const session = await (
    await page.request.get(`${base}/api/auth/get-session`)
  ).json();
  const group = leagueGroupSchema.parse({
    id: randomUUID(),
    competitionId: competition.id,
    organizerId: session.user.id,
    name: 'QA Correction League',
    description: 'Synthetic projection scope',
    visibility: 'public',
    approvalRequired: false,
    entryLimit: 2,
    startGameweekId: null,
    revision: 1,
    createdAt: new Date().toISOString(),
  });
  const hidden = {
    ...group,
    id: randomUUID(),
    name: 'QA Restricted Association',
    organizerId: entries[0].accountId,
    visibility: 'private',
  };
  const edition = headToHeadEditionSchema.parse({
    id: randomUUID(),
    groupId: group.id,
    competitionId: competition.id,
    name: 'QA Correction Cup',
    status: 'published',
    revision: 1,
    gameweekIds: [round.id],
    seed: 'a'.repeat(32),
    tieBreak: 'shared',
    tablePoints: { win: 3, draw: 1, loss: 0 },
    createdAt: group.createdAt,
    publishedAt: group.createdAt,
    schedule: [
      {
        gameweekId: round.id,
        homeId: entries[0].id,
        awayId: entries[1].id,
        cycle: 1,
      },
    ],
  });
  try {
    for (const g of [group, hidden]) {
      await pool.query(
        'INSERT INTO fantasy.league_groups(id,competition_id,organizer_id,invitation_hash,revision,data) VALUES($1,$2,$3,$4,1,$5)',
        [g.id, competition.id, g.organizerId, 'a'.repeat(64), g],
      );
      for (const e of entries)
        await pool.query(
          "INSERT INTO fantasy.group_memberships(group_id,competition_id,entry_id,account_id,status) VALUES($1,$2,$3,$4,'active')",
          [g.id, competition.id, e.id, e.accountId],
        );
    }
    await pool.query(
      'INSERT INTO fantasy.h2h_editions(id,group_id,competition_id,revision,data) VALUES($1,$2,$3,1,$4)',
      [edition.id, group.id, competition.id, edition],
    );
    for (const e of entries)
      await pool.query(
        'INSERT INTO fantasy.h2h_registrations(edition_id,competition_id,entry_id) VALUES($1,$2,$3)',
        [edition.id, competition.id, e.id],
      );
    for (const locale of ['en', 'ar']) {
      const ar = locale === 'ar';
      await page.setViewportSize(
        ar ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      );
      await page.goto(`${base}/${locale}/admin/results/${round.id}`);
      const label = ar
        ? 'أثر التصحيح على الدوريات والمواجهات'
        : 'League and H2H correction impact';
      const region = page.getByRole('region', { name: label, exact: true });
      await expect(region).toBeVisible();
      await region.getByText(group.name, { exact: true }).click();
      await expect(
        region.getByRole('heading', { name: edition.name, exact: true }),
      ).toBeVisible();
      await expect(
        region.getByRole('table', {
          name: ar ? 'نتائج مواجهات الجولة' : 'Gameweek matchup results',
          exact: true,
        }),
      ).toBeVisible();
      await expect(region.getByText(hidden.name, { exact: true })).toHaveCount(
        0,
      );
      assert.equal((await page.content()).includes(hidden.id), false);
      await region
        .getByRole('button', {
          name: `${ar ? 'شرح' : 'Explain'}: ${label}`,
          exact: true,
        })
        .click();
      await expect(page.getByRole('tooltip')).toContainText(
        ar ? 'انسحاباتها المسجلة' : 'recorded forfeits',
      );
      await page.keyboard.press('Escape');
      await region.scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `artifacts/web/group-impact-${locale}.png`,
        fullPage: true,
      });
    }
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await pool.query(
      'DELETE FROM fantasy.h2h_registrations WHERE edition_id=$1',
      [edition.id],
    );
    await pool.query('DELETE FROM fantasy.h2h_editions WHERE id=$1', [
      edition.id,
    ]);
    await pool.query(
      'DELETE FROM fantasy.group_memberships WHERE group_id=ANY($1::uuid[])',
      [[group.id, hidden.id]],
    );
    await pool.query(
      'DELETE FROM fantasy.league_groups WHERE id=ANY($1::uuid[])',
      [[group.id, hidden.id]],
    );
  }
  console.log(
    'Classic/H2H correction review, restricted private associations, bilingual help and Arabic mobile passed.',
  );
}
