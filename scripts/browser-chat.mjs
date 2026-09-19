import { waitForVisibleImages } from './browser-images.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
export async function exerciseChat(
  page,
  pool,
  base,
  entry,
  groupId,
  accountId,
) {
  await page.goto(`${base}/en/groups/${groupId}/chat`);
  await expect(
    page.getByText('This room is disabled. The organizer can enable it.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Manage room ↗', exact: true }).click();
  await page.getByLabel('Enable member conversation').check();
  await page.getByLabel('Change reason').fill('QA enable members conversation');
  await page
    .getByRole('button', { name: 'Review room settings', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm request', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Saved.');
  await page.goto(`${base}/en/groups/${groupId}/chat`);
  const text = '<script>window.chatUnsafe=true</script> Great gameweek!';
  await page.getByLabel('Your message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => window.chatUnsafe), undefined);
  const source = (
    await pool.query('SELECT data FROM fantasy.entries WHERE id=$1', [entry.id])
  ).rows[0].data;
  const guest = {
    ...source,
    id: randomUUID(),
    accountId: randomUUID(),
    name: 'QA Rival XI',
  };
  await pool.query(
    'INSERT INTO fantasy.accounts(id,display_name) VALUES($1,$2)',
    [guest.accountId, 'QA Rival'],
  );
  await pool.query(
    'INSERT INTO fantasy.entries(id,competition_id,account_id,revision,data) VALUES($1,$2,$3,$4,$5)',
    [guest.id, entry.competition_id, guest.accountId, guest.revision, guest],
  );
  try {
    await pool.query(
      "INSERT INTO fantasy.group_memberships(group_id,competition_id,entry_id,account_id,status) VALUES($1,$2,$3,$4,'active')",
      [groupId, entry.competition_id, guest.id, guest.accountId],
    );
    const messageId = randomUUID();
    await pool.query(
      'INSERT INTO fantasy.chat_messages(id,group_id,account_id,body) VALUES($1,$2,$3,$4)',
      [messageId, groupId, guest.accountId, 'QA rival message for moderation'],
    );
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    const message = page.locator('li').filter({
      has: page.getByText('QA rival message for moderation', { exact: true }),
    });
    await expect(message).toBeVisible();
    await message.getByText('Report', { exact: true }).click();
    await message
      .getByLabel('Report reason')
      .fill('QA test report reviewed by the organizer');
    await message
      .getByRole('button', { name: 'Submit report', exact: true })
      .click();
    await expect
      .poll(async () =>
        Number(
          (
            await pool.query(
              'SELECT count(*) FROM fantasy.chat_reports WHERE message_id=$1',
              [messageId],
            )
          ).rows[0].count,
        ),
      )
      .toBe(1);
    await message
      .getByRole('button', { name: 'Block messages', exact: true })
      .click();
    await expect(message).toHaveCount(0);
    await page.getByText('Blocked accounts (1)', { exact: true }).click();
    await page.getByRole('button', { name: 'Unblock', exact: true }).click();
    await expect(message).toBeVisible();
    await page.getByRole('button', { name: 'Mute room', exact: true }).click();
    await expect(
      page.getByText(
        'Automatic updates are paused in this room. Refresh to see new messages.',
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Unmute room', exact: true })
      .click();
    await waitForVisibleImages(page);
    await page.screenshot({
      path: 'artifacts/web/chat-en.png',
      fullPage: true,
    });
    await page.goto(`${base}/ar/groups/${groupId}/chat`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByText('QA rival message for moderation', { exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await waitForVisibleImages(page);
    await page.screenshot({
      path: 'artifacts/web/chat-ar-mobile.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/en/groups/${groupId}/moderation`);
    const report = page.locator('article').filter({
      has: page.getByText('QA rival message for moderation', { exact: true }),
    });
    await report.getByText('Remove content from room', { exact: true }).click();
    const removal = report.locator('form').filter({
      has: page.getByRole('button', { name: 'Remove message', exact: true }),
    });
    await removal
      .getByLabel('Action reason')
      .fill('QA remove reported content while preserving evidence');
    await removal
      .getByRole('button', { name: 'Remove message', exact: true })
      .click();
    await removal
      .getByRole('button', { name: 'Confirm request', exact: true })
      .click();
    await expect(report.getByText('ACTIONED', { exact: true })).toBeVisible();
    await page.screenshot({
      path: 'artifacts/web/chat-moderation-en.png',
      fullPage: true,
    });
    await page.goto(`${base}/en/groups/${groupId}/chat`);
    await expect(
      page.getByText('Message removed.', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Delete my message', exact: true })
      .click();
    await expect(
      page.getByText('Message removed.', { exact: true }),
    ).toHaveCount(2);
    console.log(
      'Chat enablement, safe text, reporting, blocking, mute, deletion, retained evidence and Arabic mobile layout passed.',
    );
  } finally {
    await pool.query(
      'DELETE FROM fantasy.chat_blocks WHERE account_id=$1 OR blocked_id=$1',
      [guest.accountId],
    );
    await pool.query('DELETE FROM fantasy.chat_timeouts WHERE account_id=$1', [
      guest.accountId,
    ]);
    await pool.query('DELETE FROM fantasy.chat_messages WHERE account_id=$1', [
      guest.accountId,
    ]);
    await pool.query(
      'DELETE FROM fantasy.group_memberships WHERE entry_id=$1',
      [guest.id],
    );
    await pool.query('DELETE FROM fantasy.entries WHERE id=$1', [guest.id]);
    await pool.query('DELETE FROM fantasy.accounts WHERE id=$1', [
      guest.accountId,
    ]);
  }
}
