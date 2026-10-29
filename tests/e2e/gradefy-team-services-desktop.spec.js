import { test, expect } from '@playwright/test';
import {
  services,
  professionals,
  weekly,
  team,
  servicesReport,
  professionalsReport,
} from './fixtures/team-services-presentation.js';

const companyId = 'business-browser-team';
async function login(page) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('business-browser-owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
}
async function sizes(page, name) {
  for (const [width, height] of [
    [1024, 768],
    [1280, 720],
    [1366, 768],
    [1440, 900],
    [1672, 941],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width === 1672)
      await page.screenshot({ path: `test-results/gradefy-${name}-real-1672x941.png` });
  }
  await page.setViewportSize({ width: 1338, height: 753 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1338,
    height: 753,
    deviceScaleFactor: 1.25,
    mobile: false,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1338);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  for (const width of [320, 360, 390, 428, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
}

test('team desktop shows scoped real professionals, weekly scale and owner-only access', async ({
  page,
}) => {
  await login(page);
  await page.goto('/app/equipe?empresa=' + companyId);
  const weeklyResponse = await page.request.get('/api/admin/team/weekly', {
    headers: { 'X-Gradefy-Company-Id': companyId },
  });
  expect(weeklyResponse.status()).toBe(200);
  const weekly = await weeklyResponse.json();
  await expect(page.locator('.gf-team-desktop .gf-team-roster tbody tr')).toHaveCount(
    weekly.people.length,
  );
  await expect(page.locator('.gf-team-scale tbody tr')).toHaveCount(weekly.people.length);
  await expect(page.locator('.gf-team-intro')).toContainText('Acesso ao painel');
  await page.getByRole('button', { name: 'Próxima semana' }).click();
  await expect(page.locator('.gf-team-scale tbody tr')).toHaveCount(weekly.people.length);
  await sizes(page, 'team');
});

test('services desktop filters real catalog and keeps the existing editor', async ({ page }) => {
  await login(page);
  await page.goto('/app/servicos?empresa=' + companyId);
  const catalogResponse = await page.request.get('/api/admin/services', {
    headers: { 'X-Gradefy-Company-Id': companyId },
  });
  expect(catalogResponse.status()).toBe(200);
  const catalog = await catalogResponse.json();
  await expect(page.locator('.gf-services-desktop .gf-services-table-wrap tbody tr')).toHaveCount(
    catalog.length,
  );
  await page.locator('.gf-services-search input').fill('nome inexistente');
  await expect(page.locator('.gf-services-table-wrap tbody tr')).toHaveCount(0);
  await page.locator('.gf-services-search input').fill('');
  const first = catalog[0];
  if (first) {
    await page
      .locator('.gf-services-toolbar select')
      .first()
      .selectOption(first.category || 'Sem categoria');
    await expect(page.locator('.gf-services-table-wrap tbody tr')).toHaveCount(
      catalog.filter(
        (item) => (item.category || 'Sem categoria') === (first.category || 'Sem categoria'),
      ).length,
    );
    await page.locator('.gf-services-toolbar select').first().selectOption('');
    await page
      .locator('.gf-services-table-wrap tbody tr')
      .first()
      .getByRole('button', { name: 'Editar' })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.screenshot({ path: 'test-results/gradefy-services-editor-1672x941.png' });
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  }
  await sizes(page, 'services');
});

test('team and services desktop presentation fixture matches populated layouts without writing data', async ({
  page,
}) => {
  await login(page);
  await page.route('**/api/admin/professionals', (route) => route.fulfill({ json: professionals }));
  await page.route('**/api/admin/services', (route) => route.fulfill({ json: services }));
  await page.route('**/api/admin/team', (route) => route.fulfill({ json: team }));
  await page.route('**/api/admin/team/weekly**', (route) => route.fulfill({ json: weekly }));
  await page.route('**/api/admin/reports?area=professionals*', (route) =>
    route.fulfill({ json: professionalsReport }),
  );
  await page.route('**/api/admin/reports?area=services*', (route) =>
    route.fulfill({ json: servicesReport }),
  );
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/app/equipe?empresa=' + companyId);
  await expect(page.locator('.gf-team-roster tbody tr')).toHaveCount(professionals.length);
  await expect(page.locator('.gf-team-scale tbody tr')).toHaveCount(professionals.length);
  await page.screenshot({ path: 'test-results/gradefy-team-presentation-1672x941.png' });
  const scheduleDetails = page.locator('.gf-team-scale details').first();
  await expect(scheduleDetails.locator('summary')).toContainText('09h–18h');
  await scheduleDetails.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(scheduleDetails).toHaveAttribute('open', '');
  await expect(scheduleDetails).toContainText('Intervalo 12h–13h');
  await page.screenshot({ path: 'test-results/gradefy-team-weekly-details-1672x941.png' });
  await page.screenshot({
    path: 'test-results/gradefy-team-permissions-1672x941.png',
    fullPage: true,
  });
  await page.evaluate(() =>
    document.querySelector('.gf-team')?.classList.remove('gf-premium-page'),
  );
  await page.addStyleTag({
    content:
      '.gf-team-desktop,.gf-management-topbar,.gf-team-access-anchor{display:none!important}.gf-team .gf-dashboard-main>.gf-agenda-heading{display:flex!important}',
  });
  await page.screenshot({ path: 'test-results/gradefy-team-before-reconstructed-1672x941.png' });
  await page.goto('/app/profissionais?empresa=' + companyId);
  await expect(page.locator('.gf-team-roster tbody tr')).toHaveCount(professionals.length);
  await page.screenshot({ path: 'test-results/gradefy-professionals-presentation-1672x941.png' });
  await page.goto('/app/servicos?empresa=' + companyId);
  await expect(page.locator('.gf-services-table-wrap tbody tr')).toHaveCount(services.length);
  await expect(page.locator('.gf-services-metric').last()).toContainText(
    'Serviços com profissional',
  );
  await page.screenshot({ path: 'test-results/gradefy-services-presentation-1672x941.png' });
  const peopleDetails = page
    .locator('.gf-services-people')
    .filter({ has: page.locator('summary') })
    .first();
  await peopleDetails.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(peopleDetails).toHaveAttribute('open', '');
  await expect(peopleDetails.locator('li')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/gradefy-services-full-professionals-1672x941.png' });
  await peopleDetails.locator('summary').focus();
  await page.keyboard.press('Enter');
  await page.locator('.gf-services-actions button').first().focus();
  await page.screenshot({ path: 'test-results/gradefy-services-actions-1672x941.png' });
  await page.evaluate(() =>
    document
      .querySelector('.gf-business-services')
      ?.classList.remove('gf-premium-page', 'gf-business-services'),
  );
  await page.addStyleTag({
    content:
      '.gf-management-topbar{display:none!important}.gf-services-desktop{display:none!important}',
  });
  await page.screenshot({
    path: 'test-results/gradefy-services-before-reconstructed-1672x941.png',
  });
  await page.goto('/app/servicos?empresa=' + companyId);
  await expect(page.locator('.gf-services-table-wrap tbody tr')).toHaveCount(services.length);
  await page.locator('.gf-services-toolbar select').first().selectOption('Cabelo');
  await expect(page.locator('.gf-services-table-wrap tbody tr')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/gradefy-services-filtered-1672x941.png' });
  await page.locator('.gf-services-search input').fill('nenhum resultado');
  await expect(page.locator('.gf-services-table-wrap tbody tr')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/gradefy-services-empty-1672x941.png' });
  await page.route('**/api/admin/team/weekly**', (route) =>
    route.fulfill({
      json: {
        ...weekly,
        people: weekly.people.map((person) => ({
          ...person,
          days: person.days.map((day) => ({ ...day, blocks: [] })),
        })),
      },
    }),
  );
  await page.goto('/app/equipe?empresa=' + companyId);
  await expect(page.locator('.gf-team-absences-card.is-empty')).toBeVisible();
  const absencesTop = await page
    .locator('.gf-team-absences-card')
    .evaluate((element) => element.getBoundingClientRect().top + window.scrollY - 200);
  await page.evaluate((top) => window.scrollTo(0, top), absencesTop);
  await page.screenshot({ path: 'test-results/gradefy-team-empty-absences-1672x941.png' });
  await page.route('**/api/admin/professionals', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/team/weekly**', (route) =>
    route.fulfill({ json: { ...weekly, people: [] } }),
  );
  await page.route('**/api/admin/reports?area=professionals*', (route) =>
    route.fulfill({ json: { professionals: { items: [], total: 0 } } }),
  );
  await page.route('**/api/admin/team', (route) =>
    route.fulfill({
      json: { ...team, members: team.members.slice(0, 1), invitations: [], professionals: [] },
    }),
  );
  await page.goto('/app/equipe?empresa=' + companyId);
  await expect(page.locator('.gf-team-desktop')).toBeVisible();
  await expect(page.locator('.gf-team-roster .gf-team-empty')).toBeVisible();
  await expect(page.locator('.gf-team-scale .gf-team-empty')).toBeVisible();
  await expect(page.locator('.gf-team-roster tbody tr')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/gradefy-team-empty-1672x941.png', fullPage: true });
});
