import { test, expect } from '@playwright/test';

test('management email center uses real scoped API, safe disabled state and mobile layout', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('dashboard-owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
  await page.goto('/app/dashboard?empresa=dashboard-horizonte');
  await page.getByText('Notificações por e-mail', { exact: true }).click();
  const panel = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: /^Notificações por e-mail$/ }) });
  await expect(panel).toContainText('Envio desabilitado ou configuração incompleta.');
  await expect(panel).toContainText('ela ainda pode ir para spam');
  const response = await page.request.get('/api/admin/email-notifications', {
    headers: { 'X-Gradefy-Company-Id': 'dashboard-horizonte' },
  });
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.configured).toBe(false);
  expect(data).toHaveProperty('attempts');
  expect(JSON.stringify(data)).not.toMatch(/token_hash|delivery_payload|RESEND_API_KEY/);
  expect(
    (
      await page.request.get('/api/admin/email-notifications', {
        headers: { 'X-Gradefy-Company-Id': 'minisite-browser' },
      })
    ).status(),
  ).toBe(403);
  await panel.getByRole('button', { name: 'Atualizar notificações', exact: true }).click();
  for (const width of [320, 360, 390, 428, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
  expect(errors).toEqual([]);
});
