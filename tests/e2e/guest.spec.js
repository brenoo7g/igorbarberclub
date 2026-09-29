import { test, expect } from '@playwright/test';

test('guest can book with three contact fields, recover errors and stay logged out', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/agendar?servico=corte');
  await page.getByRole('radio', { name: /Barba completa/ }).check();
  await expect(page.getByRole('radio', { name: /Corte masculino/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const date = new Date();
  date.setDate(date.getDate() + 70);
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  await page.getByLabel('Escolher outra data').fill(date.toISOString().slice(0, 10));
  await page.locator('.time-options button').first().click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar Sem Login', exact: true }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveCount(0);
  await expect(page.locator('#guest-booking-form input')).toHaveCount(3);
  await page.getByLabel('Nome + Sobrenome', { exact: true }).fill('Visitante');
  await page.getByLabel('Telefone', { exact: true }).fill('21987654321');
  await page.getByLabel('E-mail', { exact: true }).fill('cliente@example.com');
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  expect(
    await page.getByLabel('Nome + Sobrenome').evaluate((input) => input.validity.patternMismatch),
  ).toBe(true);
  await page.getByLabel('Nome + Sobrenome').fill('Visitante Navegador');
  await page.getByRole('button', { name: 'Já tenho conta', exact: true }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar Sem Login', exact: true }).click();
  await expect(page.getByLabel('Nome + Sobrenome')).toHaveValue('Visitante Navegador');
  await page.screenshot({ path: 'test-results/guest-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/guest-mobile.png', fullPage: true });
  await page.route(
    '**/api/appointments/guest',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Falha temporária de teste.' }),
      }),
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Falha temporária de teste.');
  await expect(page.getByLabel('Nome + Sobrenome')).toHaveValue('Visitante Navegador');
  const posted = page.waitForResponse(
    (response) => response.url().endsWith('/api/appointments/guest') && response.status() === 201,
  );
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  const appointment = await (await posted).json();
  expect(appointment.services).toHaveLength(1);
  expect(appointment.services[0].service_id).toBe('barba');
  await expect(page.getByRole('heading', { name: 'Seu horário está na régua.' })).toBeVisible();
  await expect(page.getByText('Te esperamos, Visitante.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver meus agendamentos' })).toHaveAttribute(
    'href',
    '/minha-conta',
  );
  expect((await (await page.request.get('/api/auth/me')).json()).user).toBeNull();
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Preencher acesso de demonstração' }).click();
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await page.getByRole('button', { name: 'Abrir menu administrativo' }).click();
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  await page.getByLabel('Data da agenda').fill(appointment.date);
  await expect(page.locator('.appointments-table')).toContainText('Visitante Navegador');
  await expect(page.locator('.appointments-table')).toContainText('21987654321');
  const result = await page.request.patch(`/api/admin/appointments/${appointment.id}/status`, {
    data: { status: 'cancelled' },
  });
  expect(result.status()).toBe(200);
  expect(errors).toEqual([]);
});
