import { test, expect } from '@playwright/test';
import {
  presentationDashboard,
  presentationReport,
  presentationNotifications,
} from './fixtures/dashboard-presentation.js';

async function login(page) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('dashboard-owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
  await page.getByLabel('Empresa', { exact: true }).selectOption('dashboard-horizonte');
  await expect(page.locator('.gf-desktop-dashboard')).toBeVisible();
}

test('dashboard desktop visual audit at reference resolution', async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await login(page);
  await expect(page.locator('.gf-desktop-timeline li')).toHaveCount(4);
  await expect(page.locator('.gf-desktop-finance')).not.toContainText('Carregando');
  const positions = await page.evaluate(() =>
    ['.gf-desktop-team', '.gf-desktop-services', '#dashboard-email-notifications'].map(
      (selector) => document.querySelector(selector).getBoundingClientRect().x,
    ),
  );
  expect(positions[0]).toBeLessThan(positions[1]);
  expect(positions[1]).toBeLessThan(positions[2]);
  await page.mouse.move(1, 1);
  await page.screenshot({
    path: `test-results/gradefy-dashboard-${process.env.GRADEFY_AUDIT_PHASE || 'review'}-1672x941.png`,
    fullPage: false,
  });
  await page.getByRole('button', { name: 'Abrir notificações' }).click();
  await expect(page.locator('#dashboard-email-notifications details').first()).toHaveAttribute(
    'open',
    '',
  );
});

test('fixture visual isolada exibe composição densa sem gravar no banco', async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  for (const [routePattern, create] of [
    ['**/api/dashboard?**', presentationDashboard],
    ['**/api/admin/reports?**', presentationReport],
    ['**/api/admin/email-notifications', presentationNotifications],
  ]) {
    await page.route(routePattern, async (route) => {
      if (route.request().headers()['x-gradefy-company-id'] !== 'dashboard-horizonte') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      await route.fulfill({ response, json: create(await response.json()) });
    });
  }
  await login(page);
  await expect(page.locator('.gf-desktop-timeline li')).toHaveCount(7);
  await expect(page.locator('.gf-desktop-team-list > span')).toHaveCount(4);
  await expect(page.locator('.gf-desktop-services li')).toHaveCount(4);
  await expect(page.locator('.gf-desktop-chart svg')).toBeVisible();
  await expect(page.locator('.gf-desktop-notification-preview li')).toHaveCount(3);
  await page.locator('.gf-desktop-chart svg').hover({ position: { x: 200, y: 65 } });
  await expect(page.locator('.gf-desktop-chart-tooltip')).toBeVisible();
  await page.mouse.move(1, 1);
  await page.screenshot({
    path: 'test-results/gradefy-dashboard-presentation-1672x941.png',
    fullPage: false,
  });
  for (const [width, height] of [
    [1280, 800],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `test-results/gradefy-dashboard-presentation-${width}x${height}.png`,
      fullPage: false,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const geometry = await page.evaluate(() => {
      const bottom = (selector) => document.querySelector(selector).getBoundingClientRect().bottom;
      return {
        nextItem: bottom('.gf-desktop-next-list .gf-desktop-appointment:last-child'),
        nextCard: bottom('.gf-desktop-next'),
        financeNote: bottom('.gf-desktop-finance > small'),
        financeCard: bottom('.gf-desktop-finance'),
      };
    });
    expect(geometry.nextItem).toBeLessThanOrEqual(geometry.nextCard);
    expect(geometry.financeNote).toBeLessThanOrEqual(geometry.financeCard);
  }
  // A 1672px desktop at 125% zoom has about 1338 CSS pixels available.
  // Emulate that effective viewport and device scale without changing app CSS.
  await page.setViewportSize({ width: 1338, height: 753 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1338,
    height: 753,
    deviceScaleFactor: 1.25,
    mobile: false,
  });
  await page.screenshot({
    path: 'test-results/gradefy-dashboard-presentation-125-percent.png',
    fullPage: false,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1338);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
});

test('dados reais escassos e ausência de reservas usam cards proporcionais', async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await login(page);
  await page.getByLabel('Empresa', { exact: true }).selectOption('dashboard-boreal');
  await expect(page.locator('.gf-desktop-dashboard.gf-desktop-sparse')).toBeVisible();
  await expect(page.locator('.gf-desktop-timeline li')).toHaveCount(1);
  expect(
    await page
      .locator('.gf-desktop-agenda')
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThan(350);
  await page.screenshot({
    path: 'test-results/gradefy-dashboard-one-appointment-1672x941.png',
    fullPage: false,
  });
  await page.getByLabel('Empresa', { exact: true }).selectOption('dashboard-vazio');
  await expect(page.locator('.gf-desktop-dashboard.gf-desktop-sparse')).toBeVisible();
  await expect(page.locator('.gf-desktop-timeline li')).toHaveCount(0);
  await expect(page.getByText('Nenhum agendamento nesta data')).toBeVisible();
  await page.screenshot({
    path: 'test-results/gradefy-dashboard-empty-1672x941.png',
    fullPage: false,
  });
});
