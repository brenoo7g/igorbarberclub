import { expect, test } from '@playwright/test';
import {
  financePresentation,
  reportPresentation,
  settingsPresentation,
} from './fixtures/finance-reports-settings-presentation.js';

const companyId = 'business-browser-team';

async function login(page) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('business-browser-owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
}

test('Finance, Reports and Settings desktop use real scoped data and keep mobile usable', async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/app/financeiro?empresa=' + companyId);
  await expect(page.locator('.gf-finance-desktop')).toBeVisible();
  await expect(page.locator('.gf-finance-desktop-metric')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/gradefy-finance-after-1672x941.png' });
  await page.goto('/app/relatorios?empresa=' + companyId);
  await expect(page.locator('.gf-reports-desktop')).toBeVisible();
  await page.screenshot({ path: 'test-results/gradefy-reports-after-1672x941.png' });
  await page.goto('/app/configuracoes?empresa=' + companyId);
  await expect(page.locator('.gf-settings-profile')).toBeVisible();
  await page.screenshot({ path: 'test-results/gradefy-settings-after-1672x941.png' });
  for (const [path, selector] of [
    ['/app/financeiro', '.gf-finance-desktop'],
    ['/app/relatorios', '.gf-reports-desktop'],
    ['/app/configuracoes', '.gf-settings-profile'],
  ]) {
    await page.goto(path + '?empresa=' + companyId);
    await expect(page.locator(selector)).toBeVisible();
    for (const [width, height] of [
      [1024, 768],
      [1280, 720],
      [1366, 768],
      [1440, 900],
      [1672, 941],
      [1920, 1080],
      [320, 844],
      [360, 844],
      [390, 844],
      [428, 844],
      [768, 844],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        path + ' at ' + width,
      ).toBeLessThanOrEqual(width);
      if (path === '/app/configuracoes' && width === 390) {
        await expect(page.locator('.gf-settings-hours-details')).toBeVisible();
      }
    }
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.evaluate(() => {
      document.body.style.zoom = '1.25';
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      path + ' at 125%',
    ).toBeLessThanOrEqual(1672);
    await page.evaluate(() => {
      document.body.style.zoom = '';
    });
  }
});

test('isolated desktop fixtures show populated, empty, and read-only states without database writes', async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  let settingsReadOnly = false;
  let reportEmpty = false;
  let financeSeries = [];
  let settingsBase = null;
  await page.route('**/api/admin/finance?*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: financePresentation(await response.json()) });
  });
  await page.route('**/api/admin/reports?*', async (route) => {
    const response = await route.fetch();
    const original = await response.json();
    const presented = reportEmpty ? original : reportPresentation(original);
    if (route.request().url().includes('area=finance'))
      financeSeries = presented.financialSeries || [];
    await route.fulfill({ response, json: presented });
  });
  await page.route('**/api/admin/finance/expenses/fixture-5?*', async (route) => {
    const paid = {
      id: 'fixture-5',
      description: 'Materiais de atendimento',
      category: 'materials',
      amount_cents: 4000,
      date: '2026-10-22',
      status: 'paid',
      paid_at: '2026-10-22T14:00:00.000Z',
      paid_date: '2026-10-22',
      notes: 'Registro visual isolado',
      version: 2,
    };
    await route.fulfill({
      json: {
        expense: paid,
        editable: true,
        timezone: 'America/Sao_Paulo',
        localNow: '2026-10-27T12:00',
        total: 2,
        page: 1,
        pageSize: 30,
        events: [
          {
            id: 'fixture-event-create',
            action: 'create',
            created_at: '2026-10-22T13:00:00.000Z',
            actor_name: 'Gestora',
            before_json: null,
            after_json: JSON.stringify({ ...paid, status: 'pending', paid_at: null }),
            reason: '',
          },
          {
            id: 'fixture-event-pay',
            action: 'pay',
            created_at: '2026-10-22T14:00:00.000Z',
            actor_name: 'Gestora',
            before_json: JSON.stringify({ ...paid, status: 'pending', paid_at: null }),
            after_json: JSON.stringify(paid),
            reason: '',
          },
        ],
      },
    });
  });
  await page.route('**/api/admin/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      const fields = route.request().postDataJSON();
      settingsBase = { ...settingsBase, ...fields, version: settingsBase.version + 1 };
      await route.fulfill({ json: settingsBase });
      return;
    }
    const response = await route.fetch();
    settingsBase = settingsPresentation(await response.json(), settingsReadOnly);
    await route.fulfill({
      response,
      json: settingsBase,
    });
  });
  await page.goto('/app/financeiro?empresa=' + companyId);
  await expect(page.locator('.gf-finance-desktop-metric').first()).toContainText('R$ 230,00');
  await expect(page.locator('.gf-finance-desktop-history tbody tr')).toHaveCount(7);
  await expect(page.locator('.gf-finance-desktop .gf-report-chart svg')).toBeVisible();
  expect(financeSeries.some((day) => day.receivedCents === -2000)).toBe(true);
  expect(financeSeries.map((day) => day.date)).toEqual(financeSeries.map((day) => day.date).sort());
  const metricBox = await page.locator('.gf-finance-desktop-metrics').boundingBox();
  const filterBox = await page.locator('.gf-finance-filters').boundingBox();
  const historyBox = await page.locator('.gf-finance-desktop-history').boundingBox();
  expect(metricBox.y).toBeLessThan(filterBox.y);
  expect(historyBox.y).toBeLessThan(941);
  await page.screenshot({ path: 'test-results/gradefy-finance-fixture-1672x941.png' });
  await page.locator('.gf-finance-desktop .gf-report-text-toggle').click();
  await expect(page.locator('.gf-finance-desktop .gf-report-chart-data')).toContainText('20,00');
  await page.screenshot({ path: 'test-results/gradefy-finance-chart-data-r1-1672x941.png' });
  await page.locator('.gf-finance-desktop .gf-report-text-toggle').click();
  await page.locator('.gf-finance-desktop-history').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/gradefy-finance-history-fixture-1672x941.png' });
  await page.getByRole('button', { name: 'Novo recebimento', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'test-results/gradefy-finance-payment-modal-1672x941.png' });
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page
    .locator('.gf-finance-desktop-history tbody tr')
    .filter({ hasText: 'Materiais de atendimento' })
    .getByRole('button', { name: 'Detalhes' })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Histórico de alterações');
  await page.screenshot({ path: 'test-results/gradefy-finance-expense-details-1672x941.png' });

  await page.goto('/app/relatorios?empresa=' + companyId);
  await expect(page.locator('.gf-reports-desktop-metric').first()).toContainText('R$ 230,00');
  await expect(page.locator('.gf-reports-desktop .gf-report-chart svg')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/gradefy-reports-fixture-1672x941.png' });
  await page.getByRole('button', { name: 'Financeiro', exact: true }).click();
  await expect(page.locator('.gf-reports-desktop')).toContainText('R$ 165,00');
  await page.screenshot({ path: 'test-results/gradefy-reports-finance-fixture-1672x941.png' });
  await page.getByRole('button', { name: 'Atendimentos', exact: true }).click();
  await expect(page.locator('.gf-reports-desktop')).toContainText('17');
  expect(
    (await page.locator('.gf-reports-desktop .gf-report-chart svg').boundingBox()).height,
  ).toBeLessThanOrEqual(230);
  await page.screenshot({ path: 'test-results/gradefy-reports-appointments-fixture-1672x941.png' });
  await page.getByRole('button', { name: 'Serviços', exact: true }).click();
  await expect(page.locator('.gf-reports-desktop')).toContainText('Corte completo');
  await page.screenshot({ path: 'test-results/gradefy-reports-services-fixture-1672x941.png' });
  await page.getByRole('button', { name: 'Profissionais', exact: true }).click();
  await expect(page.locator('.gf-reports-desktop')).toContainText('Ana Souza');
  expect(
    (await page.locator('.gf-reports-desktop .gf-report-chart svg').boundingBox()).height,
  ).toBeLessThanOrEqual(230);
  await page.screenshot({
    path: 'test-results/gradefy-reports-professionals-fixture-1672x941.png',
  });
  reportEmpty = true;
  await page.goto(
    '/app/relatorios?empresa=' +
      companyId +
      '&area=overview&period=custom&from=2000-01-01&to=2000-01-07',
  );
  await expect(page.locator('.gf-reports-desktop')).toContainText('Nenhum serviço concluído');
  await page.screenshot({ path: 'test-results/gradefy-reports-empty-1672x941.png' });

  await page.goto('/app/configuracoes?empresa=' + companyId);
  await expect(page.locator('.gf-settings-profile')).toBeVisible();
  await page.screenshot({ path: 'test-results/gradefy-settings-fixture-1672x941.png' });
  await page.locator('.gf-settings-profile').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/gradefy-settings-profile-r1-1672x941.png' });
  await expect(page.locator('.gf-settings-profile')).toContainText('(21) 99999-8888');
  await expect(page.locator('.gf-settings-hours-summary')).toContainText('Segunda-feira');
  await page.locator('.gf-settings-hours-toggle').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/gradefy-settings-hours-summary-r1-1672x941.png' });
  await page.locator('.gf-settings-business-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/gradefy-settings-business-fixture-1672x941.png' });
  await page.locator('.gf-settings-hours-card').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Editar horários de funcionamento' }).click();
  await expect(page.getByLabel('Abertura — Segunda-feira')).toBeVisible();
  await page.screenshot({ path: 'test-results/gradefy-settings-hours-fixture-1672x941.png' });
  await page.getByLabel('Abertura — Segunda-feira').fill('10:00');
  await page.getByRole('button', { name: 'Recolher edição dos horários' }).click();
  await expect(page.locator('.gf-settings-hours-summary')).toContainText('10:00');
  await page.getByRole('button', { name: 'Editar horários de funcionamento' }).click();
  await expect(page.getByLabel('Abertura — Segunda-feira')).toHaveValue('10:00');
  await page.getByLabel('Abertura — Segunda-feira').fill('09:00');
  await page.getByRole('button', { name: 'Recolher edição dos horários' }).click();
  await page.locator('.gf-settings-booking-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/gradefy-settings-booking-fixture-1672x941.png' });
  await page.getByLabel('Antecedência mínima da reserva', { exact: true }).fill('90');
  await expect(page.getByRole('button', { name: 'Descartar alterações' })).toBeVisible();
  await page.screenshot({ path: 'test-results/gradefy-settings-unsaved-fixture-1672x941.png' });
  await page.getByRole('button', { name: /Salvar/ }).click();
  await expect(page.getByText(/Configurações salvas/).first()).toBeVisible();
  await page.locator('.gf-feedback.gf-success').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/gradefy-settings-saved-r1-1672x941.png' });
  settingsReadOnly = true;
  await page.reload();
  await expect(page.getByLabel('Nome de exibição', { exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/gradefy-settings-readonly-fixture-1672x941.png' });
});
