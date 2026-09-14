import { test, expect } from '@playwright/test';

test('forgot password modal preserves login fields, displays delivery feedback and handles failures', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/minha-conta');
  await page.getByRole('button', { name: 'Já tenho conta', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('cliente@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('MinhaSenha123!');
  await page.getByRole('button', { name: 'Esqueci minha senha', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('E-mail da conta')).toHaveValue('cliente@example.com');
  await page.route('**/api/auth/forgot-password', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'A recuperação por e-mail está temporariamente indisponível.' },
    }),
  );
  await dialog.getByRole('button', { name: 'Enviar link de recuperação' }).click();
  await expect(dialog.getByRole('alert')).toContainText('temporariamente indisponível');
  await expect(dialog.getByLabel('E-mail da conta')).toHaveValue('cliente@example.com');
  await page.route('**/api/auth/forgot-password', (route) =>
    route.fulfill({
      status: 202,
      json: {
        message:
          'Se existir uma conta com esse e-mail, você receberá um link para redefinir sua senha. Confira também a caixa de spam.',
      },
    }),
  );
  await dialog.getByRole('button', { name: 'Enviar link de recuperação' }).click();
  await expect(dialog.getByRole('status')).toContainText('caixa de spam');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('MinhaSenha123!');
  await page.goto('/agendar?servico=corte');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const date = new Date();
  date.setDate(date.getDate() + 71);
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  await page.getByLabel('Escolher outra data').fill(date.toISOString().slice(0, 10));
  await page.locator('.time-options button').first().click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Já tenho conta', exact: true }).click();
  const summary = await page.locator('.booking-summary').innerText();
  await page.getByRole('button', { name: 'Esqueci minha senha', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  expect(await page.locator('.booking-summary').innerText()).toBe(summary);
  await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Esqueci minha senha', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 750 });
  await expect(page.getByRole('dialog').getByLabel('E-mail da conta')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('reset password works with a real API, reload, validation, invalid tokens and mobile layout', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/redefinir-senha#token=invalid');
  await expect(page.getByRole('alert')).toContainText('inválido ou expirou');
  await page.getByRole('link', { name: 'Solicitar novo link' }).click();
  await expect(page.getByRole('heading', { name: 'Esqueceu sua senha?' })).toBeVisible();
  const resetUrl = '/redefinir-senha#token=' + 'a'.repeat(64);
  await page.goto(resetUrl);
  await page.reload();
  await page.getByRole('link', { name: 'Pular para o conteúdo' }).focus();
  await page.keyboard.press('Enter');
  expect(new URL(page.url()).hash).toBe('#token=' + 'a'.repeat(64));
  await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenhaBrowser123!');
  await page.getByLabel('Confirmar nova senha', { exact: true }).fill('OutraSenha123!');
  await page.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('não coincidem');
  await page.getByLabel('Confirmar nova senha', { exact: true }).fill('NovaSenhaBrowser123!');
  await page.screenshot({ path: 'test-results/recovery-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.mobile-book')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/recovery-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Senha redefinida', exact: true })).toBeVisible();
  await expect(page).toHaveURL('/redefinir-senha');
  const oldLogin = await page.request.post('/api/auth/login', {
    data: { email: 'recovery-browser@example.com', password: 'ClienteDemo2026!' },
  });
  expect(oldLogin.status()).toBe(401);
  const newLogin = await page.request.post('/api/auth/login', {
    data: { email: 'recovery-browser@example.com', password: 'NovaSenhaBrowser123!' },
  });
  expect(newLogin.status()).toBe(200);
  await page.goto(resetUrl);
  await page.getByLabel('Nova senha', { exact: true }).fill('OutraSenhaBrowser123!');
  await page.getByLabel('Confirmar nova senha', { exact: true }).fill('OutraSenhaBrowser123!');
  await page.getByRole('button', { name: 'Redefinir senha', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('inválido ou expirou');
  expect(errors).toEqual([]);
});
