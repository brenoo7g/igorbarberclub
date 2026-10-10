import { test, expect } from '@playwright/test';

async function prepare(page) {
  const result = await page.request.post('/api/auth/register', {
    data: {
      scope: 'gradefy',
      name: 'Novo Proprietário',
      email: `business-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'GradefyTeste123!',
      confirmPassword: 'GradefyTeste123!',
    },
  });
  expect(result.status()).toBe(201);
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
  await page.getByRole('button', { name: 'Escolher este template' }).click();
  await expect(page).toHaveURL('/app/onboarding/setup');
  await expect(
    page.getByRole('heading', { name: 'Agora vamos configurar seu negócio.' }),
  ).toBeVisible();
}
async function fill(page, slug) {
  await page.getByLabel('Nome do estabelecimento', { exact: true }).fill('Meu Espaço');
  await page.getByLabel('Nome público / slug', { exact: true }).fill(slug);
  await page
    .getByLabel('Descrição', { exact: true })
    .fill('Atendimento profissional com hora marcada.');
  await page.getByLabel('Telefone', { exact: true }).fill('(21) 99999-8888');
  await page.getByLabel('WhatsApp', { exact: true }).fill('21999998888');
  await page.getByLabel('Instagram', { exact: true }).fill('https://instagram.com/meu_espaco/');
  await page.getByLabel('Cidade', { exact: true }).fill('Rio de Janeiro');
  await page.getByLabel('Estado', { exact: true }).selectOption('RJ');
  await page.getByLabel('Endereço (opcional)', { exact: true }).fill('Rua de Teste, 10');
}
test('initial business form, responsive creation, owner-only durable resume without localStorage and no publication', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepare(page);
  await page.getByRole('link', { name: 'Alterar plano', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Plano Individual', exact: true })).toBeChecked();
  await page.goto('/app/onboarding/setup');
  await expect(page.locator('.gf-business-choices')).toContainText(
    'Individual · Barbearia · Barber Classic',
  );
  await fill(page, `meu-espaco-${Date.now()}`);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({ path: `test-results/gradefy-business-${width}.png`, fullPage: true });
  }
  const posted = page.waitForRequest(
    (request) => request.url().endsWith('/api/onboarding/business') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Criar minha empresa', exact: true }).click();
  const request = await posted;
  expect(request.headers()['idempotency-key']).toMatch(/^[a-z0-9-]{36}$/);
  expect(request.postDataJSON()).toMatchObject({
    planCode: 'individual',
    nicheCode: 'barbershop',
    templateCode: 'barber-classic',
  });
  await expect(
    page.getByRole('heading', { name: 'Seu negócio está em configuração.' }),
  ).toBeVisible();
  await expect(
    page.getByText('Seu teste grátis ainda não começou.', { exact: false }),
  ).toBeVisible();
  const { company } = await (await page.request.get('/api/onboarding/business')).json();
  expect(company.settings.city).toBe('Rio de Janeiro');
  expect(await (await page.request.get('/api/companies')).json()).toEqual([]);
  expect((await page.request.get(`/api/public/${company.slug}/site`)).status()).toBe(404);
  expect(
    (
      await page.request.get('/api/admin/metrics', {
        headers: { 'X-Gradefy-Company-Id': company.id },
      })
    ).status(),
  ).toBe(403);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.gf-setup-summary')).toContainText('Meu Espaço');
  await page.goto('/app/onboarding/plan');
  await expect(page).toHaveURL('/app/onboarding/setup');
  await page.getByRole('link', { name: 'Voltar para minha conta', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu negócio está em configuração.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Retomar configuração' }).click();
  await expect(page.locator('.gf-setup-summary')).toContainText('Barber Classic');
  const { user } = await (await page.request.get('/api/auth/me?scope=gradefy')).json();
  await page.context().clearCookies();
  await page.goto('/app/onboarding/setup');
  await expect(page).toHaveURL('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('GradefyTeste123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/onboarding/operations');
  await expect(page.getByRole('heading', { name: 'Seus serviços', exact: true })).toBeVisible();
  await expect(page.locator('main')).toContainText('Meu Espaço');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  expect(errors).toEqual([]);
});

test('field errors, duplicate slug and lost response retry use persistent idempotency', async ({
  page,
}) => {
  // Mobile testing over HTTP on a LAN may not expose randomUUID.
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
  await prepare(page);
  await fill(page, 'admin');
  await page.getByRole('button', { name: 'Criar minha empresa', exact: true }).click();
  await expect(
    page.getByText('Esse nome público é reservado pelo sistema.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Nome público / slug', { exact: true }).fill('igor-barber-club');
  await page.getByRole('button', { name: 'Criar minha empresa', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('já está em uso');
  await page.getByLabel('Nome público / slug', { exact: true }).fill(`recovery-${Date.now()}`);
  let original = null;
  const keys = [];
  await page.route('**/api/onboarding/business', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    if (keys.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      original = (await response.json()).company;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Criar minha empresa', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('conectar ao servidor');
  await page.getByRole('button', { name: 'Criar minha empresa', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu negócio está em configuração.' }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect((await (await page.request.get('/api/onboarding/business')).json()).company).toEqual(
    original,
  );
});
