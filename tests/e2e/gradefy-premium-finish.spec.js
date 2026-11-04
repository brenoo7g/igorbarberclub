import { test, expect } from '@playwright/test';
import { presentationDashboard, presentationReport } from './fixtures/dashboard-presentation.js';

const shot = (page, name) => page.screenshot({ path: `test-results/gradefy-7f4c61-${name}.png` });
async function login(page, email) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
}
async function noOverflow(page) {
  const state = await page.evaluate(() => ({
    viewport: innerWidth,
    scroll: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName}.${element.className || ''}`),
  }));
  expect(state.scroll, JSON.stringify(state)).toBeLessThanOrEqual(state.viewport);
}

test('Dashboard mobile: plano integrado, critérios dos KPIs, estados e seletor', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'dashboard-owner@example.com');
  await page.goto('/app/dashboard?empresa=dashboard-horizonte');
  await expect(page.locator('.gf-mobile-business-plan')).toContainText('Plano Individual');
  await expect(page.locator('.gf-mobile-business-plan')).toContainText('Teste:');
  await expect(page.locator('.gf-dashboard-kpis')).toContainText('Agendamentos ativos hoje');
  await expect(page.locator('.gf-dashboard-kpis')).toContainText('2');
  await expect(page.locator('.gf-dashboard-agenda')).toContainText('4 agendamentos');
  await shot(page, 'dashboard-trial-390x844');
  await page
    .locator('.gf-dashboard-metric')
    .filter({ has: page.getByRole('heading', { name: 'Valor previsto' }) })
    .locator('summary')
    .click();
  await expect(
    page
      .locator('.gf-dashboard-metric')
      .filter({ has: page.getByRole('heading', { name: 'Valor previsto' }) })
      .locator('.gf-metric-mobile-detail p'),
  ).toContainText('não indica pagamento recebido');
  await shot(page, 'dashboard-finance-detail-390x844');
  const selected = page.getByLabel('Empresa', { exact: true });
  await selected.evaluate((element) => {
    element.size = 4;
    element.parentElement.style.position = 'absolute';
    element.parentElement.style.top = '54px';
    element.parentElement.style.right = '12px';
    element.parentElement.style.width = 'calc(100% - 24px)';
    element.parentElement.style.height = '112px';
    element.parentElement.style.zIndex = '10';
    element.style.width = '100%';
    element.style.height = '112px';
    element.style.color = '#fff';
    element.style.fontSize = '14px';
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'dashboard-company-selector-390x844');
  await selected.evaluate((element) => {
    element.size = 0;
    element.removeAttribute('style');
    element.parentElement.removeAttribute('style');
  });
  for (const width of [312, 320, 360, 390, 428]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/dashboard?empresa=dashboard-boreal');
  await expect(page.locator('.gf-mobile-business-plan')).toContainText('Teste grátis encerrado');
  await shot(page, 'dashboard-restricted-390x844');
  await page.goto('/app/dashboard?empresa=dashboard-horizonte');
  for (const [pattern, make] of [
    ['**/api/dashboard?**', presentationDashboard],
    ['**/api/admin/reports?**', presentationReport],
  ]) {
    await page.route(pattern, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: make(await response.json()) });
    });
  }
  await page.reload();
  await expect(page.locator('.gf-dashboard-kpis')).toContainText('7');
  await shot(page, 'dashboard-filled-390x844');
});

test('Configurações desktop: resumo, edição de horários e regras', async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await login(page, 'business-browser-owner@example.com');
  await page.goto('/app/configuracoes?empresa=business-browser-team');
  await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  await shot(page, 'settings-main-1672x941');
  await page.locator('.gf-settings-hours-card').scrollIntoViewIfNeeded();
  await shot(page, 'settings-hours-summary-1672x941');
  await page.getByLabel('Usar somente os expedientes dos profissionais').uncheck();
  await page.getByRole('button', { name: 'Editar horários de funcionamento' }).click();
  await shot(page, 'settings-hours-edit-1672x941');
  await page.locator('.gf-settings-booking-card').scrollIntoViewIfNeeded();
  await shot(page, 'settings-operational-1672x941');
  for (const width of [1280, 1366, 1440, 1672, 1920]) {
    await page.setViewportSize({ width, height: 941 });
    await noOverflow(page);
  }
});

test('Meu Site: ações reais, publicação e editor do Mini Site', async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await login(page, 'minisite-owner@example.com');
  await page.goto('/app/meu-site?empresa=minisite-browser');
  await expect(page.locator('.gf-mini-overview')).toBeVisible();
  await expect(page.locator('.gf-mini-site-address')).toContainText('/minisite-browser');
  await expect(page.locator('.gf-mini-site-address')).toContainText('Endereço público');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copiar link', exact: true }).click();
  await expect(page.locator('.gf-mini-link-feedback')).toContainText('Link copiado.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'http://127.0.0.1:4173/minisite-browser',
  );
  await shot(page, 'site-published-1672x941');
  await page.getByRole('button', { name: 'Editar site', exact: true }).click();
  await expect(page.getByLabel('Nome público da empresa', { exact: true })).toBeVisible();
  await shot(page, 'site-identity-1672x941');
  await page.getByRole('button', { name: 'Portfólio', exact: true }).click();
  await shot(page, 'site-portfolio-1672x941');
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
  await page.getByRole('button', { name: 'Retirar do ar', exact: true }).click();
  await page.getByRole('button', { name: 'Retirar site do ar', exact: true }).click();
  await expect(page.getByText('As reservas anteriores serão preservadas.')).toBeVisible();
  await shot(page, 'site-sensitive-confirmation-1672x941');
  await page.getByRole('button', { name: 'Manter publicado', exact: true }).click();
  await page.route('**/api/company-site', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const state = await response.json();
    await route.fulfill({
      response,
      json: { ...state, company: { ...state.company, sitePublished: false } },
    });
  });
  await page.reload();
  await expect(page.locator('.gf-mini-site-address')).toContainText('Endereço após publicação');
  await shot(page, 'site-unpublished-1672x941');
  for (const width of [320, 390, 428, 1280, 1672, 1920]) {
    await page.setViewportSize({ width, height: 941 });
    await noOverflow(page);
  }
});

test('Onboarding: grupos, escolha preservada, validação e retomada', async ({ page }) => {
  const email = `finish-${Date.now()}@example.com`;
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: {
          scope: 'gradefy',
          name: 'Proprietária Exemplo',
          email,
          password: 'GradefyTeste123!',
          confirmPassword: 'GradefyTeste123!',
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/app/onboarding/plan');
  await page
    .locator('.gf-plan-option')
    .filter({ has: page.getByRole('radio', { name: 'Plano Individual', exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page
    .locator('.gf-plan-option')
    .filter({ has: page.getByRole('radio', { name: 'Barbearia', exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page).toHaveURL('/app/onboarding/setup');
  await page.setViewportSize({ width: 1672, height: 941 });
  await shot(page, 'onboarding-desktop-1672x941');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'onboarding-mobile-390x844');
  await page.getByLabel('Nome do estabelecimento', { exact: true }).fill('Estúdio Exemplo');
  await page.getByLabel('Nome público / slug', { exact: true }).fill('admin');
  await page.getByLabel('Telefone', { exact: true }).fill('21999998888');
  await page.getByLabel('Cidade', { exact: true }).fill('Rio de Janeiro');
  await page.getByLabel('Estado', { exact: true }).selectOption('RJ');
  await shot(page, 'onboarding-partial-390x844');
  await page.getByRole('button', { name: 'Criar minha empresa', exact: true }).click();
  await expect(
    page.getByText('Esse nome público é reservado pelo sistema.', { exact: true }),
  ).toBeVisible();
  await shot(page, 'onboarding-errors-390x844');
  await page.getByLabel('Nome público / slug', { exact: true }).fill(`studio-finish-${Date.now()}`);
  await page.getByRole('button', { name: 'Criar minha empresa', exact: true }).click();
  await expect(page.locator('.gf-setup-summary')).toContainText('Estúdio Exemplo');
  await page.reload();
  await expect(page.locator('.gf-setup-summary')).toContainText('Estúdio Exemplo');
  await shot(page, 'onboarding-resume-390x844');
  for (const width of [312, 320, 360, 390, 428, 768, 1280, 1672]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
  }
});
