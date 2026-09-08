import { test, expect } from '@playwright/test';
import sharp from 'sharp';

async function photo() {
  return {
    name: 'perfil.png',
    mimeType: 'image/png',
    buffer: await sharp({ create: { width: 100, height: 80, channels: 3, background: '#365fff' } })
      .png()
      .toBuffer(),
  };
}

test('admin can manage profile on desktop and mobile, with persistent avatar and safe validation', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Preencher acesso de demonstração' }).click();
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await page.getByRole('link', { name: 'Meu perfil', exact: true }).click();
  const original = (await (await page.request.get('/api/auth/me')).json()).user;
  try {
    await page.getByLabel('Nome de exibição', { exact: true }).fill('Igor Perfil Atualizado');
    await page.getByLabel('Selecionar foto de perfil').setInputFiles(await photo());
    await expect(page.locator('.profile-avatar img')).toBeVisible();
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(page.locator('.sidebar-profile')).toContainText('Igor Perfil Atualizado');
    await expect(page.locator('.sidebar-profile img')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Salvar alterações', exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(page.getByLabel('Nome de exibição')).toHaveValue('Igor Perfil Atualizado');
    await expect(page.locator('.profile-avatar img')).toBeVisible();
    await page.getByLabel('Selecionar foto de perfil').setInputFiles({
      name: 'invalid.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg/>'),
    });
    await expect(page.getByRole('alert')).toContainText('JPG, PNG ou WebP');
    await expect(page.locator('.profile-avatar img')).toBeVisible();
    await page.getByLabel('Senha atual', { exact: true }).fill('wrong-password');
    await page.getByLabel('Nova senha', { exact: true }).fill('UmaNovaSenha123!');
    await page.getByLabel('Confirmar nova senha', { exact: true }).fill('OutraNovaSenha123!');
    await page.getByRole('button', { name: 'Alterar senha', exact: true }).click();
    await expect(page.getByText('A confirmação não coincide com a nova senha.')).toBeVisible();
    await page.getByLabel('Confirmar nova senha', { exact: true }).fill('UmaNovaSenha123!');
    await page.getByRole('button', { name: 'Alterar senha', exact: true }).click();
    await expect(page.getByText('A senha atual está incorreta.')).toBeVisible();
    await page.reload();
    await expect(page.locator('.profile-avatar img')).toBeVisible();
    await page.screenshot({ path: 'test-results/profile-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await expect
      .poll(() =>
        page.locator('.admin-sidebar').evaluate((element) => element.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(0);
    await page.screenshot({ path: 'test-results/profile-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Remover foto', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(page.locator('.profile-avatar img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Abrir menu administrativo' }).click();
    await page.getByRole('link', { name: 'Agenda', exact: true }).click();
    await expect(page.getByLabel('Data da agenda')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    const current = (await (await page.request.get('/api/auth/me')).json()).user;
    await page.request.patch('/api/auth/profile', {
      data: {
        name: original.name,
        email: original.email,
        phone: original.phone,
        avatar: original.avatar,
        profileVersion: current.profileVersion,
      },
    });
  }
});

test('client profile recovers from failed saves and stale tabs; new credentials work after logout', async ({
  page,
  context,
}) => {
  const email = `profile-${Date.now()}@example.com`;
  const password = 'ClientePerfil123!';
  await page.request.post('/api/auth/register', {
    data: { name: 'Cliente Perfil', email, phone: '21999997777', password },
  });
  await page.goto('/minha-conta');
  await page.getByRole('link', { name: 'Editar perfil', exact: true }).click();
  await page.getByLabel('Nome de exibição').fill('Nome atualizado do cliente');
  await page.route(
    '**/api/auth/profile',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Falha temporária de teste.' }),
      }),
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Falha temporária de teste.');
  await expect(page.getByLabel('Nome de exibição')).toHaveValue('Nome atualizado do cliente');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar alterações', exact: true })).toBeDisabled();

  const other = await context.newPage();
  await other.goto('/minha-conta/perfil');
  await other.getByLabel('Nome de exibição').fill('Edição da outra aba');
  await page.getByLabel('Nome de exibição').fill('Nome salvo na primeira aba');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar alterações', exact: true })).toBeDisabled();
  await other.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('outra aba');
  await other.getByRole('button', { name: 'Recarregar dados do perfil' }).click();
  await expect(other.getByLabel('Nome de exibição')).toHaveValue('Nome salvo na primeira aba');
  await other.close();

  const newEmail = `new-${email}`;
  await page.getByLabel('E-mail', { exact: true }).fill(newEmail);
  await page.getByLabel('Senha atual para alterar o e-mail').fill(password);
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByLabel('Senha atual para alterar o e-mail')).toHaveCount(0);
  await page.getByLabel('Senha atual', { exact: true }).fill(password);
  await page.getByLabel('Nova senha', { exact: true }).fill('ClienteNovaSenha123!');
  await page.getByLabel('Confirmar nova senha', { exact: true }).fill('ClienteNovaSenha123!');
  await page.getByRole('button', { name: 'Alterar senha', exact: true }).click();
  await expect(page.getByLabel('Nova senha', { exact: true })).toHaveValue('');
  await page.getByRole('link', { name: 'Voltar para minha conta', exact: true }).click();
  await expect(page.locator('.account-profile')).toContainText(newEmail);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.getByRole('button', { name: 'Já tenho conta', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill(newEmail);
  await page.getByLabel('Senha', { exact: true }).fill('ClienteNovaSenha123!');
  await page.getByRole('button', { name: 'Entrar na minha conta', exact: true }).click();
  await expect(page.locator('.account-profile')).toContainText('Nome salvo na primeira aba');
  await page.reload();
  await expect(page.locator('.account-profile')).toContainText(newEmail);
  await page.getByRole('link', { name: 'Editar perfil', exact: true }).click();
  await page.getByLabel('Nome de exibição').fill('A'.repeat(100));
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar alterações', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Voltar para minha conta', exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
});
