import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const cid = 'business-browser-team',
  headers = { 'X-Gradefy-Company-Id': cid };
async function login(page) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('business-browser-owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
}
const areaNav = (page) => page.getByRole('navigation', { name: 'Áreas dos relatórios' });
const metric = (page, label) =>
  page
    .locator('.gf-finance-metrics .gf-card')
    .filter({ has: page.getByRole('heading', { name: label, exact: true }) })
    .locator('strong');
const brMoney = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
async function responsive(page, name) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/reports-${name}-${width}.png`, fullPage: true });
  }
}
test('real reports share financial totals, accessible charts, server periods and responsive navigation', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page.goto('/app/dashboard?empresa=' + cid);
  await page
    .locator('.gf-dashboard-quick')
    .getByRole('link', { name: 'Relatórios Abrir gestão', exact: true })
    .click();
  await expect(page).toHaveURL('/app/relatorios?empresa=' + cid);
  await page.getByLabel('Período', { exact: true }).selectOption('last30');
  const actual = await (
    await page.request.get('/api/admin/reports?period=last30', { headers })
  ).json();
  await expect(metric(page, 'Recebimentos registrados')).toHaveText(
    brMoney(actual.metrics.receivedCents),
  );
  await expect(metric(page, 'Valor previsto')).toHaveText(brMoney(actual.metrics.expectedCents));
  await expect(page.locator('.gf-report-period')).toContainText(
    actual.from.split('-').reverse().join('/'),
  );
  const finance = await (
    await page.request.get('/api/admin/finance?from=' + actual.from + '&to=' + actual.to, {
      headers,
    })
  ).json();
  expect(actual.metrics).toEqual(finance.metrics);
  await responsive(page, 'overview');
  const chart = page.locator('.gf-report-chart').filter({
    has: page.getByRole('heading', { name: 'Evolução de recebimentos e despesas', exact: true }),
  });
  await chart.getByRole('button', { name: 'Ver dados', exact: true }).click();
  await expect(chart.locator('.gf-report-chart-data>div')).toHaveCount(30);
  await expect(chart.getByRole('button', { name: 'Ocultar dados', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await areaNav(page).getByRole('button', { name: 'Serviços', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Relatório por serviço' })
      .getByRole('heading', { name: 'Serviços concluídos', exact: true }),
  ).toBeVisible();
  const services = page.getByRole('region', { name: 'Relatório por serviço' });
  await expect(services).toContainText('R$ 45,00');
  await page.getByLabel('Ordenação', { exact: true }).selectOption('value');
  await responsive(page, 'services');
  await areaNav(page).getByRole('button', { name: 'Profissionais', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Desempenho dos profissionais' })).toBeVisible();
  await expect(page.locator('.gf-report-ranks')).toContainText('R$ 45,00');
  await responsive(page, 'professionals');
  expect(errors).toEqual([]);
});
test('combined backend filters and CSV match complete period; reload preserves choices and custom dates survive area changes', async ({
  page,
}) => {
  await login(page);
  await page.goto('/app/relatorios?empresa=' + cid + '&area=appointments&period=last30');
  await expect(page.getByRole('heading', { name: 'Atendimentos no período' })).toBeVisible();
  await page.getByLabel('Profissional', { exact: true }).selectOption(cid + '-pro');
  await page.getByLabel('Serviço', { exact: true }).selectOption(cid + '-service');
  await page.getByLabel('Status', { exact: true }).selectOption('completed');
  await expect(page.locator('.gf-report-counts')).toContainText('Concluídos');
  await page.reload();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('completed');
  await expect(page.getByLabel('Serviço', { exact: true })).toHaveValue(cid + '-service');
  await page.getByLabel('Período', { exact: true }).selectOption('custom');
  await page.getByLabel('Início do período').fill('2000-01-01');
  await page.getByLabel('Fim do período').fill('2000-01-07');
  await page.getByRole('button', { name: 'Aplicar período', exact: true }).click();
  await expect(page.locator('.gf-report-period')).toContainText('01/01/2000 a 07/01/2000');
  await areaNav(page).getByRole('button', { name: 'Financeiro', exact: true }).click();
  await expect(page.locator('.gf-report-period')).toContainText('01/01/2000 a 07/01/2000');
  await expect(metric(page, 'Recebimentos registrados')).toHaveText('R$ 0,00');
  await page.getByLabel('Período', { exact: true }).selectOption('last30');
  await page.getByLabel('Tipo de movimentação').selectOption('payments');
  await page.getByLabel('Forma de pagamento', { exact: true }).selectOption('pix');
  await expect(page.getByLabel('Forma de pagamento', { exact: true })).toHaveValue('pix');
  const real = await (
    await page.request.get(
      '/api/admin/reports?area=finance&period=last30&type=payments&method=pix',
      { headers },
    )
  ).json();
  await expect(metric(page, 'Recebimentos registrados')).toHaveText(
    brMoney(real.metrics.receivedCents),
  );
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const download = await dl;
  const csv = await readFile(await download.path(), 'utf8');
  expect(download.suggestedFilename()).toBe(`gradefy-finance-${real.from}-${real.to}.csv`);
  expect(csv.startsWith('\ufeff')).toBe(true);
  expect(csv).toContain('"' + real.from + '";"' + real.to + '"');
  expect(csv).toContain('"Recebimentos registrados"');
  expect(csv).toContain('pix');
  expect(csv).not.toMatch(/ana-browser@example|21988887777/);
  await expect(page.getByRole('status')).toContainText('CSV exportado');
});
test('empty reports, forbidden filters, failed network/export, company isolation, expired session and Igor remain safe', async ({
  page,
}) => {
  await login(page);
  await page.goto(
    '/app/relatorios?empresa=' + cid + '&area=services&period=custom&from=2000-01-01&to=2000-01-01',
  );
  await expect(page.getByRole('region', { name: 'Relatório por serviço' })).toContainText(
    'Nenhum serviço concluído',
  );
  await page.goto(
    '/app/relatorios?empresa=' +
      cid +
      '&area=services&period=last30&professionalId=business-browser-one-pro',
  );
  await expect(page.getByRole('alert')).toContainText('não pertence');
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Atendimentos no período' })).toBeVisible();
  await page.route('**/api/admin/reports?*', (r) => r.abort('failed'));
  await page.getByRole('button', { name: 'Atualizar relatórios' }).click();
  await expect(page.getByRole('alert')).toContainText('conectar ao servidor');
  await page.unroute('**/api/admin/reports?*');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Atendimentos no período' })).toBeVisible();
  await page.route('**/api/admin/reports/export?*', (r) => r.abort('failed'));
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('conectar ao servidor');
  await page.unroute('**/api/admin/reports/export?*');
  await page.getByLabel('Empresa', { exact: true }).selectOption('business-browser-one');
  await expect(page).toHaveURL('/app/relatorios?empresa=business-browser-one');
  const other = await (
    await page.request.get('/api/admin/reports', {
      headers: { 'X-Gradefy-Company-Id': 'business-browser-one' },
    })
  ).json();
  await expect(metric(page, 'Recebimentos registrados')).toHaveText(
    brMoney(other.metrics.receivedCents),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  await page.goto('/app/relatorios?empresa=' + cid);
  await expect(page.getByRole('heading', { name: 'Atendimentos no período' })).toBeVisible();
  await page.request.post('/api/auth/logout');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/login/);
});
