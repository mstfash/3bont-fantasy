import { monitorPageHealth } from './browser-health.mjs';
import { exerciseGroupHandover } from './browser-group-handover.mjs';
import { exerciseChat } from './browser-chat.mjs';
import { exerciseHeadToHead } from './browser-head-to-head.mjs';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
export async function exerciseGroups(page, pool, base, accountId) {
  const { rows } = await pool.query(
    'SELECT e.id,c.id AS competition_id,c.slug FROM fantasy.entries e JOIN fantasy.competitions c ON c.id=e.competition_id WHERE e.account_id=$1',
    [accountId],
  );
  const entry = rows[0];
  assert.ok(entry);
  const original = page.url();
  await page.goto(`${base}/en/competitions/${entry.slug}/groups`);
  await page
    .getByLabel('Group name', { exact: true })
    .fill('QA Private Friends');
  await page
    .getByLabel('Group description')
    .fill('A private browser-tested group');
  await page.getByLabel('Entries per account', { exact: true }).fill('2');
  await page.getByLabel('Organizer approval required to join').check();
  await page
    .getByRole('button', { name: 'REVIEW NEW GROUP', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  const invitation = await page
    .getByLabel('Invitation code — save and share with friends')
    .inputValue();
  const [groupId, token] = invitation.split('.');
  assert.ok(groupId && token);
  const group = await pool.query(
    'SELECT invitation_hash,data FROM fantasy.league_groups WHERE id=$1',
    [groupId],
  );
  assert.equal(group.rows[0]?.data.visibility, 'private');
  assert.notEqual(group.rows[0]?.invitation_hash, token);
  await page.getByRole('link', { name: 'OPEN GROUP', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'QA Private Friends', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'QA First XI', exact: true }),
  ).toBeVisible();
  const anonymous = await page.context().browser().newPage();
  const assertAnonymousHealthy = monitorPageHealth(anonymous, base);
  try {
    const denied = await anonymous.goto(`${base}/en/groups/${groupId}`);
    assert.equal(denied.status(), 404);
    await expect(
      anonymous.getByRole('heading', {
        name: 'QA Private Friends',
        exact: true,
      }),
    ).toHaveCount(0);
    assertAnonymousHealthy();
  } finally {
    await anonymous.close();
  }
  await page
    .getByRole('button', { name: 'REPLACE INVITATION CODE', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(page.getByLabel('New invitation code')).toBeVisible();
  assert.notEqual(
    await page.getByLabel('New invitation code').inputValue(),
    invitation,
  );
  await page.screenshot({
    path: 'artifacts/web/groups-en.png',
    fullPage: true,
    mask: [page.getByLabel('New invitation code')],
  });
  await page.goto(`${base}/ar/groups/${groupId}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.brand-logo:visible')
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode().catch(() => {}))),
    );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'artifacts/web/groups-ar-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await exerciseHeadToHead(page, pool, base, entry, groupId, accountId);
  await exerciseChat(page, pool, base, entry, groupId, accountId);
  await exerciseGroupHandover(page, pool, base, entry, groupId, accountId);
  await page.goto(original);
  console.log(
    'Private group creation, hashed invitation rotation, anonymous denial, standings and Arabic mobile layout passed.',
  );
}
