import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { createDatabase } from '../packages/persistence/dist/index.js';
import { calculatePrizePreview } from '../packages/application/dist/prize-preview.js';
import { reconcilePrizeCorrections } from '../packages/application/dist/index.js';
export async function exercisePrizeCorrections(
  page,
  pool,
  base,
  poolId,
  operatorId,
) {
  const db = createDatabase(pool),
    guests = [randomUUID(), randomUUID()],
    cloneIds = [randomUUID(), randomUUID()],
    proposalId = randomUUID();
  const terms = (
    await pool.query('SELECT data FROM fantasy.prize_pools WHERE id=$1', [
      poolId,
    ])
  ).rows[0].data;
  const original = (
    await pool.query(
      'SELECT data FROM fantasy.entries WHERE competition_id=$1 AND account_id=$2 LIMIT 1',
      [terms.competitionId, operatorId],
    )
  ).rows[0].data;
  try {
    for (const [i, accountId] of guests.entries()) {
      await pool.query(
        'INSERT INTO fantasy.accounts(id,display_name) VALUES($1,$2)',
        [accountId, `QA award participant ${i + 1}`],
      );
      await pool.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
        [
          accountId,
          `QA award participant ${i + 1}`,
          `${accountId}@example.test`,
        ],
      );
      const entry = {
        ...original,
        id: cloneIds[i],
        accountId,
        name: `QA AWARD XI ${i + 1}`,
      };
      await pool.query(
        'INSERT INTO fantasy.entries(id,competition_id,account_id,revision,data) VALUES($1,$2,$3,$4,$5)',
        [entry.id, entry.competitionId, accountId, entry.revision, entry],
      );
      await pool.query(
        'INSERT INTO fantasy.entry_snapshots(entry_id,competition_id,gameweek_id,locked_at,payload) SELECT $1,competition_id,gameweek_id,locked_at,payload FROM fantasy.entry_snapshots WHERE entry_id=$2',
        [entry.id, original.id],
      );
      await pool.query(
        'INSERT INTO fantasy.entry_results(entry_id,competition_id,gameweek_id,revision,points,payload,published_at) SELECT $1,competition_id,gameweek_id,revision,points,payload,published_at FROM fantasy.entry_results WHERE entry_id=$2',
        [entry.id, original.id],
      );
    }
    for (const accountId of [operatorId, guests[1]])
      await pool.query(
        'INSERT INTO fantasy.prize_eligibility(pool_id,account_id,excluded,reason,evidence_reference,reviewed_by) VALUES($1,$2,true,$3,$4,$5)',
        [
          poolId,
          accountId,
          'Synthetic correction setup',
          'QA fixture only',
          operatorId,
        ],
      );
    const initial = await db
      .transaction()
      .execute((tx) => calculatePrizePreview(tx, terms));
    assert.equal(initial.issues.length, 0);
    assert.equal(initial.awards.length, 1);
    assert.equal(initial.awards[0].accountId, guests[0]);
    const time = new Date().toISOString();
    const proposal = {
      id: proposalId,
      poolId,
      competitionId: terms.competitionId,
      revision: 4,
      preview: initial,
      state: 'fulfilled',
      preparedBy: 'qa-original-preparer',
      preparedAt: time,
      reviewedBy: 'qa-original-reviewer',
      reviewedAt: time,
      approvedBy: operatorId,
      approvedAt: time,
      fulfilledBy: 'qa-original-fulfiller',
      fulfilledAt: time,
      fulfillmentReference: 'Synthetic recorded delivery; no money transferred',
    };
    await pool.query(
      'INSERT INTO fantasy.prize_proposals(id,pool_id,competition_id,revision,data) VALUES($1,$2,$3,4,$4)',
      [proposalId, poolId, terms.competitionId, proposal],
    );
    await page.goto(`${base}/en/admin/prizes/${poolId}`);
    const row = page
      .getByRole('row')
      .filter({
        has: page.getByRole('cell', { name: 'QA AWARD XI 2', exact: true }),
      })
      .last();
    await row.getByText('Review account eligibility', { exact: true }).click();
    await row
      .getByLabel('Eligibility decision reason')
      .fill('QA independently reviewed restored eligibility');
    await row
      .getByLabel('Evidence reference', { exact: true })
      .fill('QA synthetic eligibility restoration');
    await row
      .getByRole('button', { name: 'Remove exclusion', exact: true })
      .click();
    await row
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(row.getByText('Eligible', { exact: true })).toBeVisible();
    const reconciled = await reconcilePrizeCorrections(db, terms.competitionId);
    assert.equal(reconciled.failed.length, 0);
    assert.equal(reconciled.opened, 1);
    await page.reload();
    const review = page.getByRole('region', {
      name: 'Delivered award correction',
      exact: true,
    });
    await expect(review).toBeVisible();
    await expect(
      review.getByText('150.01 EGP', { exact: false }),
    ).toBeVisible();
    await expect(review.getByText('75.00 EGP', { exact: false })).toHaveCount(
      2,
    );
    await page.screenshot({
      path: 'artifacts/web/prize-correction-en.png',
      fullPage: true,
    });
    await review
      .getByLabel('Decision reason')
      .fill(
        'QA original delivery stands after independent review of corrected eligibility',
      );
    await review
      .getByLabel('Review or remedy evidence reference')
      .fill('QA no real prize; documented correction rehearsal');
    await review
      .getByLabel(
        'I reviewed the original delivery, current eligibility, awards and evidence.',
      )
      .check();
    await review
      .getByRole('button', { name: 'Review correction decision', exact: true })
      .click();
    await review
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(
      review.getByRole('heading', {
        name: 'Original delivery stands',
        exact: true,
      }),
    ).toBeVisible();
    assert.deepEqual(
      (
        await pool.query(
          'SELECT data FROM fantasy.prize_proposals WHERE id=$1',
          [proposalId],
        )
      ).rows[0].data,
      proposal,
    );
    await page.goto(`${base}/en/prizes/${poolId}`);
    await expect(
      page.getByText('A post-delivery correction has been reviewed.', {
        exact: false,
      }),
    ).toBeVisible();
    await page.goto(`${base}/ar/admin/prizes/${poolId}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('heading', {
        name: 'الإبقاء على التسليم الأصلي',
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
      path: 'artifacts/web/prize-correction-ar-mobile.png',
      fullPage: true,
    });
  } finally {
    await pool.query(
      'DELETE FROM fantasy.prize_correction_observations WHERE case_id IN (SELECT id FROM fantasy.prize_correction_cases WHERE proposal_id=$1)',
      [proposalId],
    );
    await pool.query(
      'DELETE FROM fantasy.prize_correction_cases WHERE proposal_id=$1',
      [proposalId],
    );
    await pool.query('DELETE FROM fantasy.prize_proposals WHERE id=$1', [
      proposalId,
    ]);
    await pool.query(
      'DELETE FROM fantasy.prize_eligibility WHERE pool_id=$1 AND account_id=ANY($2::text[])',
      [poolId, [operatorId, ...guests]],
    );
    for (const table of ['entry_results', 'entry_snapshots'])
      await pool.query(
        `DELETE FROM fantasy.${table} WHERE entry_id=ANY($1::uuid[])`,
        [cloneIds],
      );
    await pool.query('DELETE FROM fantasy.entries WHERE id=ANY($1::uuid[])', [
      cloneIds,
    ]);
    await pool.query('DELETE FROM fantasy.accounts WHERE id=ANY($1::text[])', [
      guests,
    ]);
    await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [guests]);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.goto(`${base}/en/admin`);
  console.log(
    'Delivered award correction evidence, independent reviewed resolution, public disclosure and Arabic mobile layout passed.',
  );
}
