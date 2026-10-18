import { test, expect } from '@playwright/test';
import { registerMiniCustomer } from '../helpers/minisite-client-browser.js';
const root = '/api/public/minisite-browser',
  site = '/minisite-browser';
const widths = [320, 360, 390, 428, 768, 1440];
async function visual(page, name) {
  await expect(
    page.locator('.barber-classic, .auth-intro, .auth-panel, .account-login, .brand-mark'),
  ).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Igor Barber Club');
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if ([390, 1440].includes(width))
      await page.screenshot({
        path: `test-results/mini-client-${name}-${width}.png`,
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
async function credentials(page, email, password = 'ClienteDemo2026!') {
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
test('owner panel stays signed in while Mini Site demands explicit customer login before any selection', async ({
  page,
}) => {
  expect(
    (
      await page.request.post('/api/auth/login', {
        data: { email: 'minisite-owner@example.com', password: 'ClienteDemo2026!' },
      })
    ).status(),
  ).toBe(200);
  await page.goto(site);
  await page.getByRole('link', { name: 'Agendar horário', exact: true }).click();
  await expect(page).toHaveURL(site + '/entrar?destino=agendar');
  await expect(page.getByRole('heading', { name: 'Entrar ou criar conta' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  expect((await (await page.request.get(root + '/auth/me')).json()).user).toBeNull();
  await visual(page, 'login');
  await page.getByLabel('Senha', { exact: true }).fill('wrong-password');
  await page.getByLabel('E-mail', { exact: true }).fill('minisite-owner@example.com');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos');
  await credentials(page, 'minisite-owner@example.com');
  await expect(page).toHaveURL(site + '/agendar');
  await expect(page.getByRole('radio')).toBeVisible();
  expect((await (await page.request.get('/api/auth/me?scope=gradefy')).json()).user.id).toBe(
    'minisite-owner',
  );
  await page.goto(site + '/minha-conta');
  await expect(page.getByRole('heading', { name: 'Minhas reservas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL(site + '/entrar?destino=reservas');
  expect((await (await page.request.get('/api/auth/me?scope=gradefy')).json()).user.id).toBe(
    'minisite-owner',
  );
  await page.goto('/app/conta');
  await expect(page.getByRole('region', { name: 'Acesso a Barbearia Horizonte' })).toBeVisible();
});
test('public navbar services and business hours are Gradefy pages and never require a session', async ({
  page,
}) => {
  await page.goto(site);
  await page
    .getByRole('navigation', { name: 'Navegação do Mini Site' })
    .getByRole('link', { name: 'Serviços', exact: true })
    .click();
  await expect(page).toHaveURL(site + '/servicos');
  await expect(page.getByRole('heading', { name: 'Corte personalizado' })).toBeVisible();
  await expect(page.getByText('R$ 35,00', { exact: true })).toBeVisible();
  await visual(page, 'services');
  await page
    .getByRole('navigation', { name: 'Navegação do Mini Site' })
    .getByRole('link', { name: 'Horários', exact: true })
    .click();
  await expect(page).toHaveURL(site + '/horarios');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Horários de funcionamento');
  await expect(page.locator('.ms-client-week')).toContainText('09:00 às 19:00');
  await expect(page.locator('.ms-client-week')).toContainText('12:20 às 14:00');
  await visual(page, 'hours');
  expect((await (await page.request.get(root + '/auth/me')).json()).user).toBeNull();
  await page.goto(site + '/minhas-reservas');
  await expect(page).toHaveURL(site + '/entrar?destino=reservas');
});
test('new customer signs up first, books at real price, sees only own reservations and uses Gradefy detail/cancellation', async ({
  page,
  browser,
}) => {
  await page.goto(site + '/agendar?servico=minisite-service');
  await expect(page).toHaveURL(site + '/entrar?destino=agendar&servico=minisite-service');
  await page.getByRole('link', { name: 'Criar minha conta', exact: true }).click();
  await page.getByLabel('Nome e sobrenome').fill('Cliente Jornada Oficial');
  await page
    .getByLabel('E-mail', { exact: true })
    .fill(`client-official-${Date.now()}@example.test`);
  await page.getByLabel('Telefone', { exact: true }).fill('21988776655');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteMini2026!');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('As senhas não coincidem');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('ClienteMini2026!');
  await visual(page, 'registration');
  await page.setViewportSize({ width: 390, height: 390 });
  await page.getByLabel('E-mail', { exact: true }).focus();
  await page.getByLabel('E-mail', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByLabel('E-mail', { exact: true })).toBeInViewport();
  expect(
    await page
      .getByLabel('E-mail', { exact: true })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page).toHaveURL(site + '/agendar?servico=minisite-service');
  expect((await page.request.get('/api/companies')).status()).toBe(401);
  const dates = (await (await page.request.get(root + '/barbers/minisite-person/schedule')).json())
    .dates;
  const date = dates.find((d) => d > new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Escolher outra data').fill(date);
  await page.locator('.time-options button').first().click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continuar Sem Login' })).toHaveCount(0);
  const response = page.waitForResponse(
    (r) => r.url().endsWith(root + '/appointments') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  const savedResponse = await response;
  expect(savedResponse.status()).toBe(201);
  const saved = await savedResponse.json();
  expect(saved.company_id).toBe('minisite-browser');
  expect(saved.total).toBe(3500);
  expect(saved.end_minute - saved.start_minute).toBe(40);
  await page.getByRole('link', { name: 'Ver meus agendamentos', exact: true }).click();
  await expect(page.locator('.ms-reservation-card')).toContainText('Corte personalizado');
  await visual(page, 'reservations');
  await page.getByRole('button', { name: 'Ver detalhes' }).click();
  await expect(page.getByRole('dialog', { name: 'Detalhes da reserva' })).toContainText('R$ 35,00');
  await page
    .getByRole('dialog', { name: 'Detalhes da reserva' })
    .getByText('Fechar', { exact: true })
    .click();
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    await registerMiniCustomer(other);
    expect(await (await other.request.get(root + '/appointments')).json()).toEqual([]);
    expect(
      (await other.request.patch(root + '/appointments/' + saved.id + '/cancel')).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }
  await page.getByRole('button', { name: 'Cancelar horário' }).click();
  await page.getByRole('button', { name: 'Sim, cancelar' }).click();
  await expect(page.locator('.ms-reservation-card')).toHaveCount(0);
  await page.getByRole('link', { name: 'Dados da conta' }).click();
  await expect(page.getByRole('heading', { name: 'Dados da conta' })).toBeVisible();
  await visual(page, 'profile');
});
test('recovery, reset, safe destinations and temporary errors keep company and the unrelated owner session', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', {
    data: { email: 'minisite-owner@example.com', password: 'ClienteDemo2026!' },
  });
  await page.goto(site + '/entrar?destino=reservas');
  await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
  await expect(page).toHaveURL(site + '/esqueci-senha?destino=reservas');
  await visual(page, 'recovery');
  await page.getByLabel('E-mail').fill('mini-recovery@example.test');
  await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
  await expect(page.getByRole('alert')).toContainText('temporariamente indisponível');
  await page.goto(
    site + '/redefinir-senha?destino=agendar&servico=minisite-service#token=' + 'b'.repeat(64),
  );
  await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenhaMini2026!');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('NovaSenhaMini2026!');
  await page.getByRole('button', { name: 'Redefinir senha' }).click();
  await expect(page).toHaveURL(site + '/entrar?destino=agendar&servico=minisite-service');
  await expect(page.getByRole('status').filter({ hasText: 'Senha redefinida' })).toBeVisible();
  await credentials(page, 'mini-recovery@example.test', 'NovaSenhaMini2026!');
  await expect(page).toHaveURL(site + '/agendar?servico=minisite-service');
  expect((await (await page.request.get('/api/auth/me?scope=gradefy')).json()).user.id).toBe(
    'minisite-owner',
  );
  await page.route('**' + root + '/auth/me', (route) =>
    route.fulfill({ status: 503, json: { error: 'Falha temporária de sessão.' } }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Falha temporária');
  await expect(page).toHaveURL(site + '/agendar?servico=minisite-service');
  await page.unroute('**' + root + '/auth/me');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('radio')).toBeVisible();
  await page.request.post(root + '/auth/logout');
  await page.goto(
    site +
      '/entrar?destino=https://untrusted.invalid&next=/app/dashboard&returnTo=//untrusted.invalid',
  );
  await credentials(page, 'mini-recovery@example.test', 'NovaSenhaMini2026!');
  await expect(page).toHaveURL(site + '/agendar');
});
