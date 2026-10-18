import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { prepareSiteEditor } from '../helpers/site-browser.js';
const section = (page, name) =>
  page
    .getByRole('navigation', { name: 'Seções do editor' })
    .getByRole('button', { name, exact: true })
    .click();
test('onboarding personalization saves identity, CEP, five images and independent business hours before explicit publication', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { company, person } = await prepareSiteEditor(page, {
    templateCode: null,
    businessDetails: {
      postal_code: '01001000',
      street: 'Praça da Sé',
      address: 'Praça da Sé',
      address_number: '100',
      neighborhood: 'Sé',
      city: 'São Paulo',
      region: 'SP',
    },
  });
  const trial = (await (await page.request.get('/api/onboarding/business')).json()).company.trial;
  const scheduleUrl = `/api/public/${company.slug}/barbers/${person.id}/schedule`;
  const routine = (await (await page.request.get('/api/onboarding/operations')).json()).schedules;
  await page.goto(`/app/onboarding/site?empresa=${company.id}`);
  await expect(
    page.getByRole('heading', { name: 'Personalize seu Mini Site', exact: true }),
  ).toBeVisible();
  await section(page, 'Identidade');
  await page.getByLabel('Nome público da empresa', { exact: true }).fill('Estúdio Aurora');
  await page.getByLabel('Slogan (opcional)', { exact: true }).fill('Seu momento de cuidado');
  await expect(page.getByText('Alterações não salvas', { exact: true })).toBeVisible();
  await section(page, 'Contatos e localização');
  await expect(page.getByLabel('Endereço', { exact: true })).toHaveValue(/Praça da Sé/);
  await expect(page.getByText(/CEP 01001000/)).toBeVisible();
  await page.getByLabel('WhatsApp', { exact: true }).fill('21987654321');
  await page.getByLabel('Instagram', { exact: true }).fill('https://instagram.com/aurora_teste/');
  await section(page, 'Identidade');
  await expect(page.getByLabel('Slogan (opcional)', { exact: true })).toHaveValue(
    'Seu momento de cuidado',
  );
  const buffer = await sharp({
    create: { width: 110, height: 100, channels: 3, background: '#6c5ce7' },
  })
    .png()
    .toBuffer();
  const image = { name: 'foto.png', mimeType: 'image/png', buffer };
  await page.getByLabel('Enviar logo', { exact: true }).setInputFiles(image);
  await expect(page.getByRole('img', { name: 'Logo da empresa', exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome público da empresa', { exact: true })).toHaveValue(
    'Estúdio Aurora',
  );
  await section(page, 'Horário de funcionamento');
  await page.getByRole('checkbox', { name: 'Definir horários comerciais', exact: true }).check();
  await page.getByRole('button', { name: 'Adicionar pausa — Segunda-feira', exact: true }).click();
  await page.getByLabel('Início da pausa 1 — Segunda-feira', { exact: true }).fill('12:20');
  await page.getByLabel('Fim da pausa 1 — Segunda-feira', { exact: true }).fill('14:00');
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(page.getByText('Tudo salvo', { exact: true })).toBeVisible();
  const state = await (await page.request.get('/api/company-site')).json();
  expect(state.addressDetails.postal_code).toBe('01001000');
  expect(state.settings.working_days[6].active).toBe(false);
  expect(state.settings.working_days[1].end_time).toBe('20:00');
  expect((await (await page.request.get('/api/onboarding/operations')).json()).schedules).toEqual(
    routine,
  );
  expect((await page.request.get(scheduleUrl)).status()).toBe(404);
  await section(page, 'Portfólio');
  for (let i = 1; i <= 5; i++) {
    await page.getByLabel('Adicionar fotografia', { exact: true }).setInputFiles(image);
    await expect(page.locator('.gf-mini-gallery img')).toHaveCount(i);
  }
  await expect(page.getByLabel('Adicionar fotografia', { exact: true })).toBeDisabled();
  const first = await page.locator('.gf-mini-gallery img').first().getAttribute('src');
  await page.getByRole('button', { name: 'Mover foto 2 para cima', exact: true }).click();
  await expect(page.locator('.gf-mini-gallery img').first()).not.toHaveAttribute('src', first);
  await page.getByRole('button', { name: 'Excluir foto 1', exact: true }).click();
  await expect(page.locator('.gf-mini-gallery img')).toHaveCount(4);
  await section(page, 'Visão geral');
  await expect(
    page
      .frameLocator('iframe[title="Prévia do Mini Site"]')
      .getByRole('heading', { name: 'Estúdio Aurora', exact: true }),
  ).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Prévia do Mini Site"]').locator('a[href*="/agendar"]'),
  ).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of [
      'Identidade',
      'Portfólio',
      'Contatos e localização',
      'Horário de funcionamento',
      'Publicação',
      'Visão geral',
    ]) {
      await section(page, name);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${name} at ${width}px`,
      ).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/minisite-editor-${width}.png`, fullPage: true });
  }
  expect((await page.request.get(`/api/public/${company.slug}/site`)).status()).toBe(404);
  expect((await (await page.request.get('/api/onboarding/business')).json()).company.trial).toEqual(
    trial,
  );
  await page.getByRole('link', { name: 'Concluir e revisar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu negócio está pronto!', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Estúdio Aurora', { exact: true })).toBeVisible();
  await expect(page.getByText('Teste grátis ativo', { exact: true })).toBeVisible();
  await expect(page.getByText('Rascunho', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir para meu painel', exact: true })).toBeVisible();
  await page.goto('/app/meu-site');
  await section(page, 'Publicação');
  await page.getByRole('button', { name: 'Publicar meu site', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu site está no ar!', exact: true }),
  ).toBeVisible();
  const publicSite = await (await page.request.get(`/api/public/${company.slug}/site`)).json();
  expect(publicSite.hours.days).toEqual(state.settings.working_days);
  await page.getByRole('button', { name: 'Retirar site do ar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar retirada', exact: true }).click();
  expect((await page.request.get(`/api/public/${company.slug}/site`)).status()).toBe(404);
  expect(errors).toEqual([]);
});
test('editor keeps draft through tabs, failed saves, stale versions and unavailable storage', async ({
  page,
}) => {
  await prepareSiteEditor(page, { templateCode: null });
  await page.getByLabel('Nome público da empresa', { exact: true }).fill('Rascunho preservado');
  await page.route('**/api/company-site', (route) =>
    route.request().method() === 'PUT' ? route.abort('failed') : route.continue(),
  );
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('conectar ao servidor');
  await expect(page.getByLabel('Nome público da empresa', { exact: true })).toHaveValue(
    'Rascunho preservado',
  );
  await section(page, 'Contatos e localização');
  await section(page, 'Identidade');
  await expect(page.getByLabel('Nome público da empresa', { exact: true })).toHaveValue(
    'Rascunho preservado',
  );
  await page.unroute('**/api/company-site');
  const current = await (await page.request.get('/api/company-site')).json();
  expect(
    (
      await page.request.put('/api/company-site', {
        data: { ...current.settings, name: 'Salvo em outra aba' },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('outra aba');
  await page.getByRole('button', { name: 'Recarregar dados', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar editando', exact: true }).click();
  await expect(page.getByLabel('Nome público da empresa', { exact: true })).toHaveValue(
    'Rascunho preservado',
  );
  await page.getByRole('button', { name: 'Recarregar dados', exact: true }).click();
  await page.getByRole('button', { name: 'Descartar e recarregar', exact: true }).click();
  await section(page, 'Identidade');
  await expect(page.getByLabel('Nome público da empresa', { exact: true })).toHaveValue(
    'Salvo em outra aba',
  );
  await page.route('**/api/company-site', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    data.storage.configured = false;
    await route.fulfill({ response, json: data });
  });
  await page.reload();
  await section(page, 'Identidade');
  await expect(page.getByLabel('Enviar logo', { exact: true })).toBeDisabled();
  await page.getByLabel('Slogan (opcional)', { exact: true }).fill('Dados continuam editáveis');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByText('Tudo salvo', { exact: true })).toBeVisible();
});
