import { test, expect } from '@playwright/test';

const password = 'GradefyTeste123!';
async function login(page, email = 'cliente@example.com', value = 'ClienteDemo2026!') {
  await page.goto('/app/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
async function fillRegistration(page, email) {
  await page.getByLabel('Nome', { exact: true }).fill('Breno');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByLabel('Confirmação de senha', { exact: true }).fill(password);
}
test('Gradefy welcome and auth pages use scoped official branding at mobile, tablet and desktop sizes', async ({
  page,
}) => {
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  for (const path of ['/app', '/app/login', '/app/cadastro']) {
    await page.goto(path);
    await expect(page.locator('.gf-brand')).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    const stem = path.split('/').at(-1);
    await page.screenshot({ path: `test-results/gradefy-${stem}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `test-results/gradefy-${stem}-mobile.png`, fullPage: true });
  }
  expect(requests).not.toContain('/api/site');
  expect(requests).not.toContain('/api/services');
  expect(errors).toEqual([]);
  expect(
    await page.locator('.gf-app').evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('Inter');
  expect(
    await page
      .getByRole('heading', { level: 1 })
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('Sora');
});
test('Gradefy rejects invalid login, reveals password, accepts existing session and logs out', async ({
  page,
}) => {
  await login(page, 'cliente@example.com', 'incorrect');
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
  await page.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar senha', exact: true }).click();
  await page.getByLabel('Senha', { exact: true }).fill('ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/app/onboarding/plan');
  await expect(page.getByRole('heading', { name: 'Escolha seu plano' })).toBeVisible();
  await page.goto('/app/conta');
  await expect(
    page.getByRole('heading', { name: 'Seu próximo passo: seu negócio.' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Olá,');
  await page.goto('/minha-conta');
  await expect(page.locator('.auth-form-wrap')).toHaveCount(0);
  await page.goto('/app/conta');
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL('/app/login');
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await page.goto('/app/conta');
  await expect(page).toHaveURL('/app/login');
});
test('Gradefy validates registration and creates no company access; duplicate email is rejected', async ({
  page,
}) => {
  const email = `gradefy-browser-${Date.now()}@example.com`;
  await page.goto('/app/cadastro');
  await page.getByRole('button', { name: 'Criar minha conta', exact: true }).click();
  await expect(page.getByLabel('Nome', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await fillRegistration(page, email);
  await page.getByLabel('Confirmação de senha', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Criar minha conta', exact: true }).click();
  await expect(page.getByText('As senhas não coincidem.', { exact: true })).toBeVisible();
  await page.getByLabel('Confirmação de senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Criar minha conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Escolha seu plano' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Conta criada com sucesso.' }),
  ).toBeVisible();
  await page.goto('/app/conta');
  await expect(
    page.getByRole('heading', { name: 'Seu próximo passo: seu negócio.' }),
  ).toBeVisible();
  expect((await page.request.get('/api/companies')).status()).toBe(200);
  expect(await (await page.request.get('/api/companies')).json()).toEqual([]);
  expect((await page.request.get('/api/admin/metrics')).status()).toBe(403);
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await page.goto('/app/cadastro');
  await fillRegistration(page, email);
  await page.getByRole('button', { name: 'Criar minha conta', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Este e-mail já tem uma conta.');
});
test('Gradefy protects the account route and handles an expired session without a dead end', async ({
  page,
}) => {
  await page.goto('/app/conta');
  await expect(page).toHaveURL('/app/login');
  await expect(page.getByText('Entre para acessar sua conta.', { exact: true })).toBeVisible();
  await login(page);
  await expect(page).toHaveURL('/app/onboarding/plan');
  await page.goto('/app/conta');
  await expect(
    page.getByRole('heading', { name: 'Seu próximo passo: seu negócio.' }),
  ).toBeVisible();
  await page.route('**/api/companies', (route) =>
    route.fulfill({ status: 401, json: { error: 'Entre novamente.' } }),
  );
  await page.route('**/api/auth/me?scope=gradefy', (route) =>
    route.fulfill({ status: 401, json: { error: 'Sessão expirada.' } }),
  );
  await page.reload();
  await expect(page).toHaveURL('/app/login');
  await expect(page.getByRole('status').filter({ hasText: 'Sua sessão expirou.' })).toBeVisible();
  await page.unroute('**/api/auth/me?scope=gradefy');
  await page.context().clearCookies();
  await page.goto('/app/inexistente');
  await expect(page.getByRole('heading', { name: 'Vamos voltar ao início?' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao Gradefy', exact: true }).click();
  await expect(page).toHaveURL('/app');
});
test('Gradefy uses existing admin login without changing Igor permissions or public branding', async ({
  page,
}) => {
  await login(page, 'admin@igorbarberclub.com.br', 'IgorDemo2026!');
  await expect(page).toHaveURL('/app/dashboard');
  await expect(page.locator('.gf-dashboard-business')).toContainText('Igor Barber Club');
  await expect(page.getByText('Sem assinatura vinculada', { exact: true })).toBeVisible();
  await page.goto('/admin');
  await expect(page.locator('.kpi-card')).toHaveCount(4);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
  await expect(page.locator('.gf-app')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/gf-body/);
  await expect(page.locator('.service-card')).toHaveCount(4);
});
test('Gradefy recovery handles unavailable transport and invalid link and uses existing reset endpoint', async ({
  page,
}) => {
  await page.goto('/app/login');
  await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('cliente@example.com');
  await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
  await expect(page.getByRole('alert')).toContainText('temporariamente indisponível');
  await page.goto('/app/redefinir-senha#token=invalid');
  await expect(page.getByRole('alert')).toContainText('inválido ou expirou');
  await page.getByRole('link', { name: 'Solicitar novo link' }).click();
  await expect(page).toHaveURL('/app/esqueci-senha');
  await page.goto(`/app/redefinir-senha#token=${'b'.repeat(64)}`);
  await page.route('**/api/auth/reset-password', (route) =>
    route.fulfill({ json: { message: 'Senha redefinida com sucesso. Entre com sua nova senha.' } }),
  );
  await page.getByLabel('Nova senha', { exact: true }).fill(password);
  await page.getByLabel('Confirmação de senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Senha redefinida com sucesso.');
  expect(new URL(page.url()).hash).toBe('');
  await page.getByRole('link', { name: 'Voltar para o login' }).click();
  await expect(page).toHaveURL('/app/login');
});
