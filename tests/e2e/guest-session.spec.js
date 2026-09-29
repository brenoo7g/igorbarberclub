import { test, expect } from '@playwright/test';

test('visitor retains contacts and history after reopening the browser, reschedules, cancels and forgets the device', async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const date = new Date();
  date.setDate(date.getDate() + 61);
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  const day = date.toISOString().slice(0, 10);
  await page.goto('/agendar?servico=barba');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Escolher outra data').fill(day);
  await page.locator('.time-options button').first().click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar Sem Login', exact: true }).click();
  await page.getByLabel('Nome + Sobrenome').fill('Visitante Persistente');
  await page.getByLabel('Telefone', { exact: true }).fill('21988887777');
  await page.getByLabel('E-mail', { exact: true }).fill('persistente@example.com');
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/api/appointments/guest') && response.status() === 201,
  );
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  const appointment = await (await saved).json();
  await page.getByRole('link', { name: 'Ver meus agendamentos' }).click();
  await expect(page.locator('.appointment-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.account-profile')).toContainText('Visitante Persistente');
  await expect(page.getByRole('link', { name: 'Editar perfil' })).toHaveCount(0);
  expect(await page.evaluate(() => document.cookie.includes('igor-visitor'))).toBe(false);
  const cookie = (await page.context().cookies()).find((cookie) => cookie.name === 'igor-visitor');
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 89 * 86400);
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 390, height: 844 },
  });
  const resumed = await context.newPage();
  resumed.on('pageerror', (error) => errors.push(error.message));
  try {
    await resumed.goto('http://127.0.0.1:4173/minha-conta');
    await expect(resumed.locator('.appointment-card')).toHaveCount(1);
    expect(
      (await (await resumed.request.get('http://127.0.0.1:4173/api/auth/me')).json()).user,
    ).toBeNull();
    await resumed.goto('http://127.0.0.1:4173/agendar?servico=barba');
    await resumed.getByRole('button', { name: 'Continuar', exact: true }).click();
    await resumed.getByLabel('Escolher outra data').fill(day);
    await resumed.locator('.time-options button').last().click();
    await resumed.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(resumed.getByLabel('Nome + Sobrenome')).toHaveValue('Visitante Persistente');
    expect(
      await (await resumed.request.get('http://127.0.0.1:4173/api/appointments')).json(),
    ).toHaveLength(1);
    await expect(resumed.getByLabel('Telefone', { exact: true })).toHaveValue('21988887777');
    await expect(resumed.getByLabel('E-mail', { exact: true })).toHaveValue(
      'persistente@example.com',
    );
    // Refreshing identity on window focus must not overwrite edited contacts or switch tabs.
    await resumed.getByLabel('Nome + Sobrenome').fill('Contato Rascunho');
    const refreshed = resumed.waitForResponse((response) =>
      response.url().endsWith('/api/auth/me'),
    );
    await resumed.evaluate(() => window.dispatchEvent(new Event('focus')));
    await refreshed;
    await expect(resumed.getByLabel('Nome + Sobrenome')).toHaveValue('Contato Rascunho');
    await resumed.goto('http://127.0.0.1:4173/minha-conta');
    await resumed.getByRole('link', { name: 'Remarcar', exact: true }).click();
    await resumed.getByLabel('Escolher outra data').fill(day);
    await resumed.locator('.time-options button').last().click();
    await resumed.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(resumed.getByLabel('Senha', { exact: true })).toHaveCount(0);
    await resumed.getByRole('button', { name: 'Confirmar remarcação', exact: true }).click();
    await expect(
      resumed.getByRole('heading', { name: 'Novo horário. Mesmo estilo.' }),
    ).toBeVisible();
    await resumed.getByRole('link', { name: 'Ver meus agendamentos' }).click();
    await resumed.getByRole('button', { name: 'Cancelar horário', exact: true }).click();
    await resumed.getByRole('button', { name: 'Sim, cancelar', exact: true }).click();
    await expect(
      resumed.getByRole('heading', { name: 'Seu próximo estilo está esperando.' }),
    ).toBeVisible();
    await resumed.getByRole('button', { name: 'Histórico', exact: true }).click();
    await expect(resumed.locator('.appointment-card .status')).toHaveText('Cancelado');
    await resumed.setViewportSize({ width: 320, height: 750 });
    expect(await resumed.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await resumed.setViewportSize({ width: 390, height: 844 });
    expect(await resumed.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await resumed.screenshot({ path: 'test-results/guest-history-mobile.png', fullPage: true });
    await resumed.getByRole('button', { name: 'Esquecer este dispositivo', exact: true }).click();
    await resumed.getByRole('button', { name: 'Sim, esquecer dispositivo', exact: true }).click();
    await expect(resumed.getByRole('heading', { name: 'Bem-vindo ao Club.' })).toBeVisible();
    const denied = await resumed.request.get('http://127.0.0.1:4173/api/appointments');
    expect(denied.status()).toBe(401);
    // A copied old cookie is revoked server-side too; previous browser can no longer cancel.
    const replay = await page.request.patch(`/api/appointments/${appointment.id}/cancel`);
    expect(replay.status()).toBe(401);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bem-vindo ao Club.' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
