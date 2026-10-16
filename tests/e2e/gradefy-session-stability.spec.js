import { test, expect } from '@playwright/test';
const cid = 'business-browser-team';
async function login(page) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('business-browser-owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
  await page.goto('/app/dashboard?empresa=' + cid);
  await expect(
    page.getByRole('complementary').getByRole('link', { name: 'Clientes', exact: true }),
  ).toBeVisible();
}
test('an isolated company 401 validates the canonical session without logging the owner out', async ({
  page,
}) => {
  await login(page);
  await page.route('**/api/companies', (route) =>
    route.fulfill({ status: 401, json: { error: 'Falha isolada de autorização.' } }),
  );
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Clientes', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Falha isolada de autorização.');
  await expect(page).toHaveURL('/app/clientes?empresa=' + cid);
  await page.unroute('**/api/companies');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
});

test('owner visits every management tab, preserves selected company and survives reload', async ({
  page,
}) => {
  await login(page);
  for (const [path, title] of [
    ['agenda', 'Minha agenda'],
    ['clientes', 'Clientes'],
    ['servicos', 'Serviços'],
    ['profissionais', 'Profissionais'],
    ['financeiro', 'Financeiro'],
    ['relatorios', 'Relatórios'],
    ['equipe', 'Equipe e permissões'],
    ['meu-site', 'Meu Site'],
    ['configuracoes', 'Configurações operacionais'],
    ['dashboard', 'Visão geral'],
  ]) {
    await page.goto('/app/' + path + '?empresa=' + cid);
    await expect(page).toHaveURL('/app/' + path + '?empresa=' + cid);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => location.pathname)).not.toBe('/app/login');
  }
  await page.goto('/app/configuracoes?empresa=' + cid);
  await page.getByLabel('Empresa', { exact: true }).selectOption('business-browser-one');
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Clientes', exact: true })
    .click();
  await expect(page).toHaveURL('/app/clientes?empresa=business-browser-one');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
});

test('temporary errors, access denial, and a burst of isolated 401s never clear a valid session or loop', async ({
  page,
}) => {
  await login(page);
  for (const status of [500, 403, 401]) {
    let probes = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/auth/me?scope=gradefy')) probes++;
    });
    await page.route('**/api/admin/settings', (route) =>
      route.fulfill({ status, json: { error: 'Erro recuperável ' + status } }),
    );
    await page.goto('/app/configuracoes?empresa=' + cid);
    await expect(page.getByRole('alert').first()).toContainText('Erro recuperável');
    for (let i = 0; i < 8; i++)
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('session-check', { detail: { scope: 'gradefy' } })),
      );
    await expect(page).toHaveURL('/app/configuracoes?empresa=' + cid);
    expect(probes).toBeLessThanOrEqual(3);
    await page.unroute('**/api/admin/settings');
    await page.getByRole('button', { name: 'Recarregar configurações', exact: true }).click();
    await expect(page.getByLabel('Nome de exibição')).toBeVisible();
    page.removeAllListeners('request');
  }
});

test('canonical network failure on reload is recoverable without routing to login; true expiry does route to login', async ({
  page,
}) => {
  await login(page);
  await page.route('**/api/auth/me?scope=gradefy', (route) => route.abort('failed'));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Não foi possível verificar sua sessão' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/app/dashboard?empresa=' + cid);
  await page.unroute('**/api/auth/me?scope=gradefy');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('complementary')).toBeVisible();
  await page.context().clearCookies();
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('session-check', { detail: { scope: 'gradefy' } })),
  );
  await expect(page).toHaveURL('/app/login');
});

test('public-scope failures do not invalidate Gradefy; actual logout propagates across tabs', async ({
  page,
  context,
}) => {
  await login(page);
  let probes = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/api/auth/me?scope=gradefy')) probes++;
  });
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('session-check', { detail: { scope: 'public:/api' } })),
  );
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Clientes', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  expect(probes).toBe(0);
  const other = await context.newPage();
  await other.goto('/app/conta');
  await other.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page).toHaveURL('/app/login');
  await other.close();
});

test('expiry during a throttled 401 burst is checked again instead of being lost', async ({
  page,
}) => {
  await login(page);
  const validated = page.waitForResponse('**/api/auth/me?scope=gradefy');
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('session-check', { detail: { scope: 'gradefy' } })),
  );
  await validated;
  await page.context().clearCookies();
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('session-check', { detail: { scope: 'gradefy' } })),
  );
  await expect(page).toHaveURL('/app/login');
});

test('CSV authorization failures validate the same session and remain recoverable when it is valid', async ({
  page,
}) => {
  await login(page);
  await page.goto('/app/relatorios?empresa=' + cid);
  await expect(page.getByRole('heading', { name: 'Atendimentos no período' })).toBeVisible();
  await page.route('**/api/admin/reports/export?*', (route) =>
    route.fulfill({ status: 401, json: { error: 'Falha isolada ao exportar.' } }),
  );
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Falha isolada ao exportar.');
  await expect(page).toHaveURL('/app/relatorios?empresa=' + cid);
  await page.unroute('**/api/admin/reports/export?*');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});
