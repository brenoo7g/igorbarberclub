import { test, expect } from '@playwright/test';
async function setup(page) {
  const response = await page.request.post('/api/auth/register', {
    data: {
      scope: 'gradefy',
      name: 'Pessoa CEP',
      email: `cep-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
      password: 'GradefyTeste123!',
      confirmPassword: 'GradefyTeste123!',
    },
  });
  expect(response.status()).toBe(201);
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
  await expect(page.getByLabel('CEP', { exact: true })).toBeVisible();
}
const address = { street: 'Praça da Sé', neighborhood: 'Sé', city: 'São Paulo', region: 'SP' };
test('CEP completes address once, accepts formatting, preserves manual changes and submits structured data', async ({
  page,
}) => {
  await setup(page);
  const calls = [];
  await page.route('**/api/address/cep/*', (route) => {
    calls.push(route.request().url());
    return route.fulfill({ json: address });
  });
  await page.getByLabel('CEP', { exact: true }).fill('01001');
  // Allow the lookup debounce to elapse: incomplete CEP must not cause a request.
  await page.waitForTimeout(450);
  expect(calls).toHaveLength(0);
  await page.getByLabel('CEP', { exact: true }).fill('01001-000');
  await expect(page.getByLabel('Cidade', { exact: true })).toHaveValue('São Paulo');
  await expect(page.getByLabel('Estado', { exact: true })).toHaveValue('SP');
  await expect(page.getByLabel('Endereço (opcional)', { exact: true })).toHaveValue('Praça da Sé');
  await expect(page.getByLabel('Bairro', { exact: true })).toHaveValue('Sé');
  await page.getByLabel('Endereço (opcional)', { exact: true }).fill('Rua Editada');
  await page.getByLabel('CEP', { exact: true }).fill('01001000');
  await page.getByLabel('Nome do estabelecimento', { exact: true }).fill('Espaço CEP');
  await page.getByLabel('Nome público / slug', { exact: true }).fill('cep-' + Date.now());
  await page.getByLabel('Telefone', { exact: true }).fill('21999999999');
  await page.getByLabel('Número do imóvel', { exact: true }).fill('10');
  await page.getByLabel('Complemento (opcional)', { exact: true }).fill('Sala 2');
  await expect(page.getByLabel('Endereço (opcional)', { exact: true })).toHaveValue('Rua Editada');
  expect(calls).toHaveLength(1);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/cep-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Criar minha empresa', exact: true }).click();
  await expect(page.getByText('Empresa criada com sucesso.', { exact: true })).toBeVisible();
  const business = (await (await page.request.get('/api/onboarding/business')).json()).company;
  expect(business.settings.postal_code).toBe('01001000');
  expect(business.settings.street).toBe('Rua Editada');
  expect(business.settings.address).toContain('Sala 2');
  expect(business.trial).toBeNull();
});
test('unavailable, unknown and streetless CEP keep the form usable without rendering errors', async ({
  page,
}) => {
  await setup(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/address/cep/*', (route) => {
    const code = route.request().url().split('/').at(-1);
    return route.fulfill(
      code === '11111111'
        ? { status: 404, json: { error: 'CEP não encontrado. Preencha manualmente.' } }
        : code === '22222222'
          ? { status: 503, json: { error: 'Serviço indisponível. Preencha manualmente.' } }
          : { json: { ...address, street: '', neighborhood: '' } },
    );
  });
  await page.getByLabel('CEP', { exact: true }).fill('11111111');
  await expect(page.getByRole('status')).toContainText('CEP não encontrado');
  await page.getByLabel('CEP', { exact: true }).fill('22222222');
  await expect(page.getByRole('status')).toContainText('Serviço indisponível');
  await page.getByLabel('CEP', { exact: true }).fill('33333333');
  await expect(page.getByRole('status')).toContainText('sem logradouro');
  await page.getByLabel('Endereço (opcional)', { exact: true }).fill('Rua manual');
  await page.getByLabel('Número do imóvel', { exact: true }).fill('s/n');
  await expect(page.getByLabel('Endereço (opcional)', { exact: true })).toHaveValue('Rua manual');
  expect(errors).toEqual([]);
});
test('out of order CEP responses are ignored and manual edits during lookup are never overwritten', async ({
  page,
}) => {
  await setup(page);
  let oldRoute, lateRoute;
  await page.route('**/api/address/cep/*', (route) => {
    const code = route.request().url().split('/').at(-1);
    if (code === '11111111') {
      oldRoute = route;
      return;
    }
    if (code === '33333333') {
      lateRoute = route;
      return;
    }
    return route.fulfill({ json: { ...address, street: 'Rua Nova' } });
  });
  await page.getByLabel('CEP', { exact: true }).fill('11111111');
  await expect.poll(() => !!oldRoute).toBe(true);
  await page.getByLabel('CEP', { exact: true }).fill('22222222');
  await expect(page.getByLabel('Endereço (opcional)', { exact: true })).toHaveValue('Rua Nova');
  await oldRoute.fulfill({ json: { ...address, street: 'Rua Antiga' } }).catch(() => {});
  await page.getByLabel('CEP', { exact: true }).fill('33333333');
  await expect.poll(() => !!lateRoute).toBe(true);
  await page.getByLabel('Endereço (opcional)', { exact: true }).fill('Rua Manual Durante Consulta');
  await lateRoute.fulfill({ json: address });
  await expect(page.getByRole('status')).toContainText('Endereço preenchido');
  await expect(page.getByLabel('Endereço (opcional)', { exact: true })).toHaveValue(
    'Rua Manual Durante Consulta',
  );
});

const cid = 'business-browser-team',
  headers = { 'X-Gradefy-Company-Id': cid };
async function owner(page) {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill('business-browser-owner@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/dashboard');
  await page.goto('/app/equipe?empresa=' + cid);
  await expect(page.getByRole('heading', { name: 'Equipe e permissões' })).toBeVisible();
}
for (const mode of ['new', 'existing'])
  test(`professional invitation UI ${mode} creates or links only on acceptance and opens own panel`, async ({
    page,
    browser,
  }) => {
    await owner(page);
    const email = `professional-${mode}-${Date.now()}@example.test`;
    await page.getByLabel('E-mail do convidado').fill(email);
    await page.getByLabel('Papel do convidado').selectOption('professional');
    await page.getByLabel('Cadastro na agenda').selectOption(mode);
    if (mode === 'existing')
      await page.getByLabel('Profissional do convite').selectOption(cid + '-pro');
    const before = (await (await page.request.get('/api/admin/professionals', { headers })).json())
      .length;
    await page.getByRole('button', { name: 'Criar convite', exact: true }).click();
    const link = await page.getByRole('dialog').getByLabel('Link do convite').inputValue();
    expect(
      (await (await page.request.get('/api/admin/professionals', { headers })).json()).length,
    ).toBe(before);
    const context = await browser.newContext(),
      guest = await context.newPage();
    try {
      expect(
        (
          await context.request.post('http://127.0.0.1:4173/api/auth/register', {
            data: {
              scope: 'gradefy',
              name: 'Pessoa Convidada',
              email,
              password: 'GradefyTeste123!',
              confirmPassword: 'GradefyTeste123!',
            },
          })
        ).status(),
      ).toBe(201);
      await guest.goto(link);
      await guest.getByRole('button', { name: 'Aceitar convite', exact: true }).click();
      await expect(guest.getByText('Convite aceito com sucesso.', { exact: true })).toBeVisible();
      await guest.getByRole('link', { name: 'Acessar minha conta empresarial' }).click();
      await expect(guest).toHaveURL('/app/minha-agenda?empresa=' + cid);
      await expect(
        guest.getByRole('heading', {
          name: mode === 'new' ? 'Cadastro desativado' : 'Minha Agenda',
          exact: true,
        }),
      ).toBeVisible();
      expect((await guest.request.get('/api/admin/finance', { headers })).status()).toBe(403);
      const after = await (await page.request.get('/api/admin/professionals', { headers })).json();
      expect(after.length).toBe(before + (mode === 'new' ? 1 : 0));
      if (mode === 'new') expect(after.find((p) => p.name === 'Pessoa Convidada').active).toBe(0);
    } finally {
      await context.close();
    }
  });
