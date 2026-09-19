import { withAuthRateLimit } from './browser-auth-retry.mjs';
import { monitorPageHealth } from './browser-health.mjs';
import { exerciseAccountClosure } from './browser-account-closure.mjs';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { expect } from '@playwright/test';
export async function exerciseGroupHandover(
  page,
  pool,
  base,
  entry,
  groupId,
  accountId,
) {
  const guest = await page
    .context()
    .browser()
    .newPage({ viewport: { width: 390, height: 844 } });
  const assertHealthy = monitorPageHealth(guest, base);
  const email = `handover-${randomUUID()}@example.test`,
    password = `Qa-${randomBytes(18).toString('hex')}`;
  let guestId = null,
    entryId = null;
  try {
    const signup = await withAuthRateLimit(() =>
      guest.request.post(`${base}/api/auth/sign-up/email`, {
        headers: { Origin: base },
        data: { email, password, name: 'QA New Organizer' },
      }),
    );
    assert.equal(signup.status(), 200);
    guestId = (await signup.json()).user.id;
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [
      guestId,
    ]);
    assert.equal(
      (
        await withAuthRateLimit(() =>
          guest.request.post(`${base}/api/auth/sign-in/email`, {
            headers: { Origin: base },
            data: { email, password },
          }),
        )
      ).status(),
      200,
    );
    const source = (
      await pool.query('SELECT data FROM fantasy.entries WHERE id=$1', [
        entry.id,
      ])
    ).rows[0].data;
    entryId = randomUUID();
    await pool.query(
      'INSERT INTO fantasy.entries(id,competition_id,account_id,revision,data) VALUES($1,$2,$3,$4,$5)',
      [
        entryId,
        entry.competition_id,
        guestId,
        source.revision,
        { ...source, id: entryId, accountId: guestId, name: 'QA Handover XI' },
      ],
    );
    await pool.query(
      "INSERT INTO fantasy.group_memberships(group_id,competition_id,entry_id,account_id,status) VALUES($1,$2,$3,$4,'active')",
      [groupId, entry.competition_id, entryId, guestId],
    );
    await page.goto(`${base}/en/groups/${groupId}`);
    const ownerCard = page.locator('.group-card').filter({
      has: page.getByRole('heading', {
        name: 'GROUP OWNERSHIP',
        exact: true,
      }),
    });
    await ownerCard.getByLabel('Member by squad name').selectOption(entryId);
    await ownerCard
      .getByRole('button', { name: 'REVIEW NEW ORGANIZER OFFER', exact: true })
      .click();
    await ownerCard
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(
      ownerCard.getByText('Offer available until', { exact: false }),
    ).toBeVisible();
    await ownerCard.screenshot({ path: 'artifacts/web/group-handover-en.png' });
    const oldHash = (
      await pool.query(
        'SELECT invitation_hash FROM fantasy.league_groups WHERE id=$1',
        [groupId],
      )
    ).rows[0].invitation_hash;
    await guest.goto(`${base}/ar/groups/${groupId}`);
    const recipientCard = guest.locator('.group-card').filter({
      has: guest.getByRole('heading', {
        name: 'تسليم إدارة المجموعة',
        exact: true,
      }),
    });
    await expect(
      recipientCard.getByRole('button', {
        name: 'مراجعة عرض الإدارة',
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      await guest.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await recipientCard.screenshot({
      path: 'artifacts/web/group-handover-ar-mobile.png',
    });
    await recipientCard
      .getByRole('button', { name: 'مراجعة عرض الإدارة', exact: true })
      .click();
    await recipientCard
      .getByRole('button', { name: 'تأكيد الطلب', exact: true })
      .click();
    await expect(
      guest.getByRole('heading', { name: 'دعوات الأصدقاء', exact: true }),
    ).toBeVisible();
    const changed = (
      await pool.query(
        'SELECT organizer_id,invitation_hash FROM fantasy.league_groups WHERE id=$1',
        [groupId],
      )
    ).rows[0];
    assert.equal(changed.organizer_id, guestId);
    assert.notEqual(changed.invitation_hash, oldHash);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'INVITE FRIENDS', exact: true }),
    ).toHaveCount(0);
    await guest.goto(`${base}/en/groups/${groupId}`);
    const newOwner = guest.locator('.group-card').filter({
      has: guest.getByRole('heading', {
        name: 'GROUP OWNERSHIP',
        exact: true,
      }),
    });
    await newOwner.getByLabel('Member by squad name').selectOption(entry.id);
    await newOwner
      .getByRole('button', { name: 'REVIEW NEW ORGANIZER OFFER', exact: true })
      .click();
    await newOwner
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(
      newOwner.getByText('Offer available until', { exact: false }),
    ).toBeVisible();
    await page.reload();
    await ownerCard
      .getByRole('button', { name: 'REVIEW OWNERSHIP OFFER', exact: true })
      .click();
    await ownerCard
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'INVITE FRIENDS', exact: true }),
    ).toBeVisible();
    await exerciseAccountClosure(
      guest,
      pool,
      base,
      guestId,
      entryId,
      email,
      password,
    );
    assertHealthy();
    console.log(
      'Consensual ownership handover, new organizer authority, old invitation revocation, return handover and Arabic mobile passed.',
    );
  } finally {
    await guest.close();
    if (guestId) {
      await pool.query(
        "UPDATE fantasy.league_groups SET organizer_id=$2,data=jsonb_set(data,'{organizerId}',to_jsonb($2::text)) WHERE id=$1",
        [groupId, accountId],
      );
      await pool.query(
        'DELETE FROM fantasy.group_handovers WHERE group_id=$1',
        [groupId],
      );
      if (entryId) {
        await pool.query(
          'DELETE FROM fantasy.group_membership_history WHERE entry_id=$1',
          [entryId],
        );
        await pool.query(
          'DELETE FROM fantasy.group_memberships WHERE entry_id=$1',
          [entryId],
        );
        await pool.query(
          'DELETE FROM fantasy.entry_retirements WHERE entry_id=$1',
          [entryId],
        );
        await pool.query('DELETE FROM fantasy.entries WHERE id=$1', [entryId]);
      }
      await pool.query('DELETE FROM fantasy.audit_events WHERE actor_id=$1', [
        guestId,
      ]);
      await pool.query('DELETE FROM fantasy.commands WHERE actor_id=$1', [
        guestId,
      ]);
      await pool.query('DELETE FROM "session" WHERE "userId"=$1', [guestId]);
      await pool.query('DELETE FROM "account" WHERE "userId"=$1', [guestId]);
      await pool.query('DELETE FROM "user" WHERE id=$1', [guestId]);
      await pool.query(
        'DELETE FROM fantasy.account_exports WHERE account_id=$1',
        [guestId],
      );
      await pool.query('DELETE FROM fantasy.accounts WHERE id=$1', [guestId]);
    }
    for (const file of await readdir(process.env.MAIL_OUTBOX_DIR)) {
      const path = `${process.env.MAIL_OUTBOX_DIR}/${file}`;
      if (JSON.parse(await readFile(path, 'utf8')).to === email)
        await unlink(path);
    }
  }
}
