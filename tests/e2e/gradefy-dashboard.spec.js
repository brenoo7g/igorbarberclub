import { test, expect } from '@playwright/test';
import { money } from '../../src/lib.ts';

async function login(page, email = 'dashboard-owner@example.com') {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
const metric = (page, title) =>
  page
    .locator('.gf-dashboard-metric')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test('real dashboard selects companies explicitly, shows scoped appointments/trial/site and works on mobile/desktop', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await expect(page).toHaveURL('/app/dashboard');
  await expect(
    page.getByRole('heading', { name: 'Escolha sua empresa', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.gf-dashboard-kpis')).toHaveCount(0);
  await page.getByLabel('Empresa', { exact: true }).selectOption('dashboard-horizonte');
  await expect(page.locator('.gf-dashboard-business')).toContainText('Barbearia Horizonte');
  await expect(metric(page, 'Agendamentos de hoje').locator('strong')).toHaveText('2');
  await expect(metric(page, 'Atendimentos concluídos').locator('strong')).toHaveText('1');
  const snapshot = await (
    await page.request.get('/api/dashboard', {
      headers: { 'X-Gradefy-Company-Id': 'dashboard-horizonte' },
    })
  ).json();
  await expect(metric(page, 'Valor previsto').locator('strong')).toHaveText(
    money(snapshot.metrics.expectedValueCents),
  );
  await expect(metric(page, 'Valor previsto')).toContainText('Não indica pagamento recebido.');
  await expect(metric(page, 'Próximo atendimento')).toContainText(
    snapshot.nextAppointment.clientName,
  );
  await expect(page.locator('.gf-day-appointment')).toHaveCount(4);
  await expect(
    page.locator('.gf-day-appointment').filter({ hasText: 'Reserva Cancelada' }),
  ).toContainText('Cancelado');
  await expect(
    page.locator('.gf-day-appointment').filter({ hasText: 'Pedro Rocha' }),
  ).toContainText('Concluído');
  await expect(
    page.getByText('Teste grátis ativo · 2 dias restantes', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.gf-dashboard-site')).toContainText('Não publicado');
  await expect(
    page.locator('.gf-dashboard-site').getByRole('link', { name: 'Abrir site' }),
  ).toHaveCount(0);
  await expect(page.locator('.gf-dashboard-business img')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Cliente Confidencial Boreal');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `test-results/gradefy-dashboard-${width}.png`,
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .locator('.gf-dashboard-sidebar')
    .getByRole('link', { name: 'Financeiro', exact: true })
    .click();
  await expect(page).toHaveURL('/app/financeiro?empresa=dashboard-horizonte');
  await expect(page.getByRole('heading', { name: 'Financeiro', exact: true })).toBeVisible();
  await page.goto('/app/dashboard?empresa=dashboard-horizonte');
  await page.getByRole('link', { name: 'Personalizar site', exact: true }).click();
  await expect(page).toHaveURL('/app/meu-site?empresa=dashboard-horizonte');
  await expect(page.getByLabel('Nome público da empresa', { exact: true })).toHaveValue(
    'Barbearia Horizonte',
  );
  await page.goto('/app/dashboard?empresa=dashboard-horizonte');
  await page.reload();
  await expect(page.getByLabel('Empresa', { exact: true })).toHaveValue('dashboard-horizonte');
  await page.getByLabel('Período dos indicadores', { exact: true }).selectOption('day');
  await expect(metric(page, 'Valor previsto').locator('strong')).toHaveText('R$ 75,00');
  await page
    .getByLabel('Data da agenda', { exact: true })
    .fill(
      snapshot.nextAppointment.date === snapshot.clock.today
        ? new Date(Date.parse(snapshot.clock.today + 'T12:00Z') + 86400000)
            .toISOString()
            .slice(0, 10)
        : snapshot.nextAppointment.date,
    );
  await expect(page.locator('.gf-day-appointment')).toHaveCount(1);
  await expect(page.locator('.gf-day-appointment')).toContainText('Camila Santos');
  await page.getByLabel('Empresa', { exact: true }).selectOption('dashboard-boreal');
  await expect(page.locator('.gf-dashboard-business')).toContainText('Studio Boreal');
  await expect(page.getByText('Teste grátis encerrado', { exact: true })).toBeVisible();
  await expect(page.locator('.gf-dashboard-site')).toContainText('Publicado');
  await expect(
    page.locator('.gf-dashboard-site').getByRole('link', { name: 'Abrir site', exact: true }),
  ).toHaveAttribute('href', '/dashboard-boreal');
  await expect(page.locator('body')).not.toContainText('Ana Martins');
  await page.getByLabel('Empresa', { exact: true }).selectOption('dashboard-vazio');
  await expect(
    page.getByRole('heading', { name: 'Nenhum agendamento nesta data', exact: true }),
  ).toBeVisible();
  await expect(metric(page, 'Agendamentos de hoje').locator('strong')).toHaveText('0');
  await expect(metric(page, 'Próximo atendimento')).toContainText(
    'Nenhum atendimento futuro confirmado',
  );
  await expect(metric(page, 'Valor previsto').locator('strong')).toHaveText('R$ 0,00');
  await page.goto('/app/dashboard?empresa=igor-barber-club');
  await expect(page.getByRole('alert')).toContainText('Sem acesso à empresa selecionada');
  await expect(page.locator('.gf-dashboard-kpis')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  expect(errors).toEqual([]);
});

test('manager auto selection, connection recovery, session expiry and configured login landing', async ({
  page,
}) => {
  await login(page, 'dashboard-manager@example.com');
  await expect(page).toHaveURL('/app/dashboard');
  await expect(page.locator('.gf-dashboard-business')).toContainText('Barbearia Horizonte');
  await expect(page.getByLabel('Empresa', { exact: true })).toHaveCount(0);
  await page.goto('/app');
  await expect(page).toHaveURL('/app/dashboard');
  await page.route('**/api/dashboard?**', (route) => route.abort('failed'));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Não foi possível carregar seu painel', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.gf-day-appointment')).toHaveCount(0);
  await page.unroute('**/api/dashboard?**');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.locator('.gf-day-appointment')).toHaveCount(4);
  await page.route('**/api/dashboard?**', (route) =>
    route.fulfill({ status: 401, json: { error: 'Entre novamente.' } }),
  );
  await page.context().clearCookies();
  await page.getByRole('button', { name: 'Atualizar painel', exact: true }).click();
  await expect(page).toHaveURL('/app/login');
});

test('no-company and pending onboarding resume; anonymous cannot view dashboard', async ({
  page,
}) => {
  await page.goto('/app/dashboard');
  await expect(page).toHaveURL('/app/login');
  const registered = await page.request.post('/api/auth/register', {
    data: {
      scope: 'gradefy',
      name: 'Dona em Configuração',
      email: `dash-pending-${Date.now()}@example.com`,
      password: 'GradefyTeste123!',
      confirmPassword: 'GradefyTeste123!',
    },
  });
  expect(registered.status()).toBe(201);
  await page.goto('/app/dashboard');
  await expect(page).toHaveURL('/app/onboarding/plan');
  const company = await page.request.post('/api/onboarding/business', {
    data: {
      name: 'Pendente Dashboard',
      slug: `pending-dashboard-${Date.now()}`,
      phone: '21999998888',
      city: 'Rio de Janeiro',
      region: 'RJ',
      planCode: 'individual',
      nicheCode: 'barbershop',
      templateCode: 'barber-classic',
    },
  });
  expect(company.status()).toBe(201);
  await page.goto('/app/dashboard');
  await expect(page).toHaveURL('/app/onboarding/operations');
  await expect(page.getByRole('heading', { name: 'Seus serviços', exact: true })).toBeVisible();
});
