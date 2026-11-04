import { expect, test } from '@playwright/test';
import {
  financePresentation,
  reportPresentation,
} from './fixtures/finance-reports-settings-presentation.js';

const companyId = 'business-browser-team';

async function login(page, email = 'business-browser-owner@example.com') {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
}

async function responsive(page, name) {
  for (const width of [320, 360, 390, 428, 768, 1672]) {
    await page.setViewportSize({ width, height: width === 1672 ? 941 : 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `${name} ${width}px`,
    ).toBeLessThanOrEqual(width);
    if ([320, 360, 390, 428, 1672].includes(width)) {
      await page.screenshot({
        path: `test-results/mobile-phase-7f4c6-${name}-${width}x${width === 1672 ? 941 : 844}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test('Clientes mobile: métricas e cards reais da empresa, busca paginada e modal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/app/clientes?empresa=' + companyId);
  await expect(page.locator('.gf-client-mobile-card').first()).toBeVisible();
  await expect(page.locator('.gf-client-kpis .gf-card')).toHaveCount(4);
  const realClients = await (
    await page.request.get('/api/admin/clients?q=&page=1', {
      headers: { 'X-Gradefy-Company-Id': companyId },
    })
  ).json();
  await expect(page.locator('.gf-client-kpis .gf-card').first()).toContainText(
    String(realClients.stats.registered),
  );
  await page
    .locator('.gf-client-mobile-card')
    .first()
    .getByRole('button', { name: 'Ver histórico' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();

  await page.route('**/api/admin/clients?**', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (route.request().headers()['x-gradefy-company-id'] !== companyId)
      return route.fulfill({ response });
    const items = Array.from({ length: 8 }, (_, index) => ({
      id: `visual-client-${index}`,
      name: ['Gabriel Almeida', 'Larissa Ferreira', 'Matheus Silva', 'Rafael Costa'][index % 4],
      phone: `2199${String(1000000 + index).padStart(7, '0')}`,
      email: `cliente${index}@example.test`,
      version: 1,
      created_at: '2026-10-10T12:00:00.000Z',
    }));
    await route.fulfill({
      response,
      json: {
        ...data,
        items,
        total: 38,
        pageSize: 8,
        stats: { registered: 38, newThisMonth: 8, futureClients: 12, completedVisits: 84 },
      },
    });
  });
  await page.reload();
  await expect(page.locator('.gf-client-mobile-card')).toHaveCount(8);
  await expect(page.locator('.gf-client-kpis .gf-card').first()).toContainText('38');
  const clientLayout = await page.evaluate(() => ({
    search: document.querySelector('.gf-business-search').getBoundingClientRect().bottom,
    kpis: document.querySelector('.gf-client-kpis').getBoundingClientRect().top,
  }));
  expect(clientLayout.search).toBeLessThan(clientLayout.kpis);
  await responsive(page, 'clientes-fixture');
  await page.locator('.gf-client-mobile-card').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mobile-phase-7f4c6-clientes-lista-390x844.png' });
  await expect(page.getByRole('navigation', { name: 'Páginas' })).toBeVisible();
  await page.unroute('**/api/admin/clients?**');
  await page.locator('.gf-business-search input').fill('Ana');
  await expect(page.locator('.gf-client-result-count')).toContainText('busca atual');
});

test('Pagamentos mobile: indicadores, série negativa, filtros e lançamento real', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.route('**/api/admin/finance?*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: financePresentation(await response.json()) });
  });
  await page.route('**/api/admin/reports?*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: reportPresentation(await response.json()) });
  });
  await page.goto('/app/financeiro?empresa=' + companyId);
  await expect(page.locator('.gf-finance-metrics .gf-card')).toHaveCount(4);
  await expect(page.locator('.gf-finance-mobile-historical')).toContainText('R$ 290,00');
  await expect(page.locator('.gf-finance-metrics .gf-card').first()).toContainText('R$ 230,00');
  await expect(page.locator('.gf-finance-desktop-chart .gf-report-chart svg')).toBeVisible();
  const financeLayout = await page.evaluate(() => ({
    kpis: document.querySelector('.gf-finance-metrics').getBoundingClientRect().bottom,
    chart: document.querySelector('.gf-finance-desktop-chart').getBoundingClientRect().top,
    historical: document.querySelector('.gf-finance-mobile-historical').getBoundingClientRect().top,
  }));
  expect(financeLayout.kpis).toBeLessThan(financeLayout.chart);
  expect(financeLayout.chart).toBeLessThan(financeLayout.historical);
  await expect(page.locator('.gf-finance-entry')).toHaveCount(7);
  await expect(page.locator('.gf-finance-entry-amount.is-negative')).toHaveCount(3);
  await responsive(page, 'pagamentos-fixture');
  await page.locator('.gf-finance-desktop-chart').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mobile-phase-7f4c6-pagamentos-grafico-390x844.png' });
  await page.locator('.gf-finance-entry').first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'test-results/mobile-phase-7f4c6-pagamentos-historico-390x844.png',
  });
  await page.getByRole('button', { name: 'Novo recebimento' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  await page.getByLabel('Tipo de lançamento').selectOption('expenses');
  await expect(page.locator('.gf-finance-entries')).toBeVisible();
});

test('Perfil mobile: conta real, papéis, atalhos autorizados e logout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/app/conta?empresa=' + companyId);
  await expect(page.locator('.gf-account-company')).toContainText(['Clube Horizonte']);
  await expect(page.locator('.gf-account-other-areas')).toContainText('Dados do estabelecimento');
  await responsive(page, 'perfil-real');
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Perfil' })
    .click();
  await expect(page).toHaveURL(/\/app\/conta/);
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL('/app/login');
});

test('Perfil mobile mantém jornada sem empresa e vínculo profissional sem acesso administrativo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'cliente@example.com');
  await page.goto('/app/conta');
  await expect(
    page.getByRole('heading', { name: 'Seu próximo passo: seu negócio.' }),
  ).toBeVisible();
  await expect(page.locator('.gf-account-other-areas')).toHaveCount(0);
  const layout = await page.evaluate(() => ({
    heading: document.querySelector('.gf-journey-heading').getBoundingClientRect().top,
    next: document.querySelector('.gf-journey-state').getBoundingClientRect().top,
  }));
  expect(layout.heading).toBeLessThan(layout.next);
  await page.screenshot({ path: 'test-results/mobile-phase-7f4c6-perfil-sem-empresa-390x844.png' });
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL('/app/login');
  await login(page, 'staff-browser-primary@example.com');
  await page.goto('/app/conta');
  const professional = page.getByRole('region', { name: 'Acesso a Equipe de Atendimento' });
  await expect(professional).toContainText('Profissional');
  await expect(professional.getByRole('link', { name: 'Abrir Minha Agenda' })).toBeVisible();
  await expect(professional.getByRole('link', { name: 'Abrir painel empresarial' })).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/mobile-phase-7f4c6-perfil-multiplos-papeis-390x844.png',
  });
});
