import { expect, test } from '@playwright/test';

// Local mock-mode end-to-end tests exercise the real web/API/PostgreSQL path.
// They are deliberately not evidence that Railway accepted a real mutation.
test('login, start, refresh, confirmed stop and a new start', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('demo');
  await page.getByLabel('Password', { exact: true }).fill('local-demo-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workload control' })).toBeVisible();
  await expect(page.getByText('LOCAL SIMULATOR')).toBeVisible();
  const resource = page.getByRole('region', { name: 'Signal demo' });
  const start = resource.getByRole('button', { name: 'Start workload' });
  const stop = resource.getByRole('button', { name: 'Stop workload' });
  await expect.poll(async () => (await start.isEnabled()) || (await stop.isEnabled())).toBe(true);
  if (await stop.isEnabled()) {
    await stop.click();
    await page.getByRole('button', { name: 'Stop and remove deployment', exact: true }).click();
    await expect(start).toBeEnabled();
  }
  await expect(start).toBeEnabled();
  // Lose the HTTP response after the real API has accepted the intent.
  await page.route(
    '**/api/v1/resources/*/operations',
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fetch();
      await route.abort('failed');
    },
    { times: 1 },
  );
  await start.click();
  await expect(page.getByRole('button', { name: 'Recover request' })).toBeVisible();
  await page.getByRole('button', { name: 'Recover request' }).click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('control.pending-request')))
    .toBeNull();
  await expect(page.getByRole('heading', { name: 'Start workload', exact: true })).toBeVisible();
  await page.reload();
  await expect(stop).toBeEnabled();
  await expect(resource.locator('.status')).toHaveText('Running');
  await stop.click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep running' }).click();
  await expect(stop).toBeFocused();
  await stop.click();
  await page.getByRole('button', { name: 'Stop and remove deployment', exact: true }).click();
  await expect(start).toBeEnabled();
  await expect(resource.locator('.status')).toHaveText('Stopped');
  await start.click();
  await expect(stop).toBeEnabled();
  await expect(page.getByRole('table')).toBeVisible();
  // Leave the local simulator stopped after the demonstration.
  await stop.click();
  await page.getByRole('button', { name: 'Stop and remove deployment', exact: true }).click();
  await expect(start).toBeEnabled();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the control room' })).toBeVisible();
});

test('keyboard sign-in and an unavailable API have actionable states', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('demo');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.type('incorrect-password');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Username or password is incorrect',
  );
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'API_UNAVAILABLE', message: 'The API is unavailable.', requestId: 'test' },
      }),
    }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Control room unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
