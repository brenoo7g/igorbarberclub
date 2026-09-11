import { test, expect } from '@playwright/test';

test('working hours, manual week release, share link and public booking on desktop/mobile', async ({
  page,
  context,
}) => {
  await page.goto('/admin/agenda');
  await page.getByRole('button', { name: 'Preencher acesso de demonstração' }).click();
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await page.getByRole('link', { name: 'Configurar agenda' }).click();
  await page.getByRole('combobox', { name: 'Profissional', exact: true }).selectOption('week-qa');
  await page.getByRole('radio', { name: /Manual por semana/ }).check();
  await page.getByRole('checkbox', { name: /Segunda-feira/ }).uncheck();
  for (const name of ['Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']) {
    const row = page
      .locator('.schedule-day')
      .filter({ has: page.getByRole('checkbox', { name: new RegExp(name) }) });
    await row.getByRole('button', { name: 'Adicionar intervalo' }).click();
    await expect(page.getByLabel(`Início do intervalo 1 ${name}`, { exact: true })).toHaveValue(
      '12:20',
    );
  }
  await expect(page.getByRole('button', { name: /Liberar próxima semana/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Configurações salvas');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/schedule-settings-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  const publicPage = await context.newPage();
  const before = (await (await page.request.get('/api/admin/barbers/week-qa/schedule')).json())
    .next_week;
  const future = new Date(`${before.week_start}T12:00:00Z`);
  future.setUTCDate(future.getUTCDate() + 8);
  const futureTuesday = future.toISOString().slice(0, 10);
  await publicPage.goto(`/agendar?semana=${futureTuesday}&profissional=week-qa&servico=corte`);
  await publicPage.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(
    publicPage.getByText(
      'A agenda para este período ainda não foi aberta pelo barbeiro. Volte em breve!',
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: /Liberar próxima semana/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: /Liberar próxima semana/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const share = await page.getByLabel('Link de agendamento', { exact: true }).inputValue();
  expect(new URL(share).searchParams.get('semana')).toBe(futureTuesday);
  const whatsapp = await page
    .getByRole('link', { name: 'Enviar no WhatsApp' })
    .getAttribute('href');
  expect(new URL(whatsapp).hostname).toBe('wa.me');
  expect(new URL(whatsapp).searchParams.get('text')).toContain(share);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copiar Link', exact: true }).click();
  await expect(page.getByText('Link copiado!', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(share);
  await publicPage.goto(share + '&servico=corte');
  await publicPage.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(publicPage.getByLabel('Escolher outra data')).toHaveValue(futureTuesday);
  await expect(publicPage.locator('.barber-option.selected')).toContainText('Agenda QA');
  await expect(publicPage.getByRole('button', { name: '11:40', exact: true })).toBeVisible();
  await expect(publicPage.getByRole('button', { name: '14:00', exact: true })).toBeVisible();
  await expect(publicPage.getByRole('button', { name: '12:00', exact: true })).toHaveCount(0);
  for (const button of await publicPage.locator('.date-options button').all()) {
    const label = await button.getAttribute('aria-label');
    if (label.includes('segunda') || label.includes('domingo')) await expect(button).toBeDisabled();
  }
  await publicPage.setViewportSize({ width: 390, height: 844 });
  expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await publicPage.screenshot({ path: 'test-results/schedule-public-mobile.png', fullPage: true });
  await publicPage.close();
});

test('invalid week links safely fall back, and a current week link keeps its calendar anchor', async ({
  page,
}) => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  for (const value of ['invalid', '2026-02-30', '2099-01-01', '2020-01-01']) {
    await page.goto(`/agendar?semana=${value}&servico=corte&profissional=missing`);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByLabel('Escolher outra data')).toHaveValue(today);
    await expect(page.locator('.barber-option.selected')).toContainText('Igor Borges');
  }
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 2);
  const anchor = start.toISOString().slice(0, 10);
  await page.goto(`/agendar?semana=${anchor}&servico=corte`);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByLabel('Escolher outra data')).toHaveValue(today);
  await expect(page.locator('.date-options button').first()).toBeDisabled();
  await expect(page.locator('.date-options button').first().locator('strong')).toHaveText(
    anchor.slice(8),
  );
});
