import { test, expect } from '@playwright/test';

async function login(page, email = 'dashboard-owner@example.com') {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test('desktop dashboard uses scoped data, real links, calendar and preserves mobile', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await expect(page).toHaveURL('/app/dashboard');
  await expect(page.getByRole('heading', { name: 'Escolha sua empresa' })).toBeVisible();
  await expect(page.locator('.gf-header .gf-brand')).toBeVisible();
  await page.getByLabel('Empresa', { exact: true }).selectOption('dashboard-horizonte');
  const desktop = page.locator('.gf-desktop-dashboard');
  await expect(desktop.locator('.gf-desktop-company')).toContainText('Barbearia Horizonte');
  const snapshot = await (
    await page.request.get('/api/dashboard', {
      headers: { 'X-Gradefy-Company-Id': 'dashboard-horizonte' },
    })
  ).json();
  await expect(desktop.locator('.gf-desktop-metrics')).toContainText('Agendamentos hoje');
  await expect(desktop.locator('.gf-desktop-metrics')).toContainText('Faturamento do mês');
  await expect(desktop.locator('.gf-desktop-metrics')).toContainText('Clientes ativos');
  await expect(desktop.locator('.gf-desktop-metrics')).toContainText('Taxa de ocupação');
  await expect(desktop.locator('.gf-desktop-metrics')).toContainText('Dados indisponíveis');
  await expect(desktop.locator('.gf-desktop-timeline li')).toHaveCount(4);
  await expect(desktop.locator('.gf-desktop-timeline')).toContainText('Reserva Cancelada');
  await expect(desktop.locator('.gf-desktop-timeline')).toContainText('Concluído');
  await expect(desktop.locator('.gf-desktop-team')).toContainText('Equipe de hoje');
  await expect(desktop.locator('.gf-desktop-finance')).toContainText('Recebimentos registrados');
  await expect(desktop.locator('.gf-desktop-services')).toContainText('Serviços mais realizados');
  await expect(desktop.locator('.gf-desktop-finance')).toContainText('R$');
  await expect(desktop.locator('.gf-desktop-payments')).toContainText('Resumo de pagamentos');
  await desktop.getByRole('searchbox', { name: 'Buscar nesta agenda' }).fill('Pedro');
  await expect(desktop.locator('.gf-desktop-timeline li')).toHaveCount(1);
  await desktop.getByRole('searchbox', { name: 'Buscar nesta agenda' }).clear();
  await expect(desktop.locator('.gf-desktop-services')).not.toContainText('Carregando');
  await expect(desktop).not.toContainText('Cliente Confidencial Boreal');
  await expect(desktop.getByText('Teste grátis · 2 dias restantes', { exact: true })).toBeVisible();
  await expect(desktop.locator('.gf-desktop-plan')).toContainText('não publicado');
  const target = snapshot.nextAppointment.date;
  await desktop.getByText('Filtrar agenda', { exact: true }).click();
  await desktop.getByLabel('Data da agenda').fill(target);
  await expect(desktop.locator('.gf-desktop-timeline li')).toHaveCount(
    target === snapshot.clock.today ? 4 : 1,
  );
  await desktop.getByLabel('Data da agenda').fill(snapshot.clock.today);
  await desktop.getByRole('button', { name: 'Próximo mês' }).click();
  await expect(desktop.locator('.gf-desktop-calendar')).toContainText('novembro');
  await desktop.getByRole('button', { name: 'Mês anterior' }).click();
  await expect(desktop.locator('.gf-desktop-calendar')).toContainText('outubro');

  for (const width of [1024, 1280, 1366, 1440, 1920, 320, 390, 768]) {
    const height =
      { 1280: 720, 1366: 768, 1440: 900, 1920: 1080 }[width] || (width < 801 ? 850 : 900);
    await page.setViewportSize({ width, height });
    await expect(
      page.locator(width > 800 ? '.gf-desktop-dashboard' : '.gf-dashboard-top'),
    ).toBeVisible();
    if (width > 800) {
      await expect(desktop.locator('.gf-desktop-finance')).not.toContainText('Carregando');
      await expect(desktop.locator('.gf-desktop-services')).not.toContainText('Carregando');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if ([1024, 1280, 1366, 1440, 1920, 320, 390].includes(width))
      await page.screenshot({
        path: `test-results/gradefy-dashboard-desktop-phase-${width}.png`,
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(desktop).toBeVisible();
  await desktop.getByRole('link', { name: 'Ver agenda completa' }).click();
  await expect(page).toHaveURL('/app/agenda?empresa=dashboard-horizonte');
  await page.goto('/app/dashboard?empresa=dashboard-horizonte');
  await page.reload();
  await expect(page.getByLabel('Empresa', { exact: true })).toHaveValue('dashboard-horizonte');
  await page.getByLabel('Empresa', { exact: true }).selectOption('dashboard-boreal');
  await expect(desktop.locator('.gf-desktop-company')).toContainText('Studio Boreal');
  await expect(desktop.locator('.gf-desktop-plan')).toContainText('Teste grátis encerrado');
  await expect(desktop).not.toContainText('Ana Martins');
  await page.getByLabel('Empresa', { exact: true }).selectOption('dashboard-vazio');
  await expect(desktop).toContainText('Nenhum agendamento nesta data');
  await expect(desktop.locator('.gf-desktop-metrics')).toContainText('R$ 0,00');
  await page.goto('/app/dashboard?empresa=igor-barber-club');
  await expect(page.getByRole('alert')).toContainText('Sem acesso à empresa selecionada');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  expect(errors).toEqual([]);
});

test('manager recovers from API failure and expired session', async ({ page }) => {
  await login(page, 'dashboard-manager@example.com');
  const desktop = page.locator('.gf-desktop-dashboard');
  await expect(desktop.locator('.gf-desktop-company')).toContainText('Barbearia Horizonte');
  await expect(page.getByLabel('Empresa', { exact: true })).toHaveCount(0);
  await page.route('**/api/dashboard?**', (route) => route.abort('failed'));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Não foi possível carregar seu painel' }),
  ).toBeVisible();
  await expect(desktop.locator('.gf-desktop-timeline li')).toHaveCount(0);
  await page.unroute('**/api/dashboard?**');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(desktop.locator('.gf-desktop-timeline li')).toHaveCount(4);
  await page.route('**/api/dashboard?**', (route) =>
    route.fulfill({ status: 401, json: { error: 'Entre novamente.' } }),
  );
  await page.context().clearCookies();
  await page.getByRole('button', { name: 'Atualizar dashboard' }).click();
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
  await expect(page.getByRole('heading', { name: 'Seus serviços' })).toBeVisible();
});
