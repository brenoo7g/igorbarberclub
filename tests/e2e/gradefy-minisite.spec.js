import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { prepareSiteEditor } from '../helpers/site-browser.js';

const slug = 'minisite-browser';
async function decodeImages(page) {
  await page.evaluate(async () => {
    for (const image of document.images) image.loading = 'eager';
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
    await document.fonts.ready;
  });
}

test('Mini Site: responsive composition, scoped links, five images and keyboard lightbox', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${slug}`);
  await expect(
    page.getByRole('heading', { name: 'Barbearia Horizonte', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.ms-photo-grid button')).toHaveCount(5);
  await expect(page.getByRole('link', { name: 'Agendar horário', exact: true })).toHaveAttribute(
    'href',
    `/${slug}/agendar`,
  );
  await expect(page.getByRole('link', { name: /Fale no WhatsApp/ })).toHaveAttribute(
    'href',
    'https://wa.me/5521987654321',
  );
  await expect(page.getByRole('link', { name: /Nosso Instagram/ })).toHaveAttribute(
    'href',
    'https://www.instagram.com/barbeariahorizonte_demo/',
  );
  await expect(page.getByRole('link', { name: /Como chegar/ })).toHaveAttribute(
    'href',
    /https:\/\/www.google.com\/maps/,
  );
  await expect(page.locator('#ms-hours')).toContainText('12:20');
  await expect(page.locator('#ms-hours')).toContainText('America/Sao Paulo');
  await expect(page.getByRole('heading', { name: 'Serviços em destaque' })).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await decodeImages(page);
    expect(
      await page
        .locator('.ms-photo-grid img')
        .evaluateAll((images) => images.every((i) => i.complete && i.naturalWidth > 0)),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/minisite-${width}.png`, fullPage: true });
  }
  const first = page.getByRole('button', { name: /Ampliar foto 1:/ });
  await first.click();
  await expect(page.getByRole('dialog')).toContainText('1 / 5');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog')).toContainText('2 / 5');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('dialog')).toContainText('1 / 5');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(first).toBeFocused();
  await page.getByRole('button', { name: /Ver serviços/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Corte personalizado');
  await expect(page.getByRole('dialog')).toContainText('40 min');
  await expect(
    page.getByRole('dialog').getByRole('link', { name: 'Agendar', exact: true }),
  ).toHaveAttribute('href', `/${slug}/agendar?servico=minisite-service`);
  expect(errors).toEqual([]);
});

test('missing identity/links/hours and portfolio failure have safe fallbacks and retry', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`**/api/public/${slug}/site`, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    Object.assign(data.settings, {
      logo_url: '/missing-test-logo.png',
      hero_image_url: '/missing-test-banner.png',
      whatsapp: 'invalid',
      instagram_url: 'javascript:alert(1)',
      address: null,
      city: null,
      region: null,
      location_url: 'https://evil.example',
      slogan: 'S'.repeat(120),
    });
    data.hours = null;
    await route.fulfill({ response, json: data });
  });
  let attempts = 0;
  await page.route(`**/api/public/${slug}/portfolio`, async (route) => {
    attempts++;
    await route.fulfill({
      status: attempts === 1 ? 503 : 200,
      json: attempts === 1 ? { error: 'Teste' } : [],
    });
  });
  await page.goto(`/${slug}`);
  await expect(page.locator('.ms-initials')).toHaveText('BH');
  await expect(page.locator('.ms-actions a')).toHaveCount(0);
  await expect(page.locator('.ms-action-unavailable')).toHaveCount(3);
  await expect(page.locator('.ms-open-status')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#ms-hours')).toContainText('Consulte os horários ao agendar.');
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar o portfólio.');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.ms-portfolio')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('paused public site and demo preview do not expose booking links', async ({ page }) => {
  await page.route(`**/api/public/${slug}/site`, async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.settings.online_booking_enabled = false;
    await route.fulfill({ response, json: data });
  });
  await page.goto(`/${slug}`);
  await expect(page.getByText(/Os agendamentos online estão pausados/)).toBeVisible();
  await expect(page.locator('a[href*="/agendar"]')).toHaveCount(0);
  await page.getByRole('button', { name: /Ver serviços/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Corte personalizado');
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0);
  await page.goto('/preview/gradefy-minisite');
  await expect(
    page.getByText('Demonstração · Imagens ilustrativas · Agendamentos desativados'),
  ).toBeVisible();
  await expect(page.locator('.ms-photo-grid button')).toHaveCount(5);
  await expect(page.locator('a[href*="/agendar"]')).toHaveCount(0);
  await page.getByRole('button', { name: /Ver serviços/ }).click();
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await decodeImages(page);
  await page.locator('.ms-home').screenshot({ path: 'test-results/minisite-catalog-preview.png' });
});

test('real client registration via Mini Site retains company, duration, history and cancellation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const schedule = await (
    await page.request.get(`/api/public/${slug}/barbers/minisite-person/schedule`)
  ).json();
  const date = schedule.dates.find((d) => d > new Date().toISOString().slice(0, 10));
  expect(date).toBeTruthy();
  await page.goto(`/${slug}`);
  await page.getByRole('button', { name: /Ver serviços/ }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Agendar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/entrar\\?`));
  await page.getByRole('link', { name: 'Criar minha conta', exact: true }).click();
  await page.getByLabel('Nome e sobrenome', { exact: true }).fill('Cliente Mini Site');
  await page.getByLabel('Telefone', { exact: true }).fill('21988887777');
  await page
    .getByLabel('E-mail', { exact: true })
    .fill(`minisite-client-${Date.now()}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill('ClienteMini2026!');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('ClienteMini2026!');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page).toHaveURL(`/${slug}/agendar?servico=minisite-service`);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Escolher outra data').fill(date);
  await expect(page.locator('.time-options button').first()).toBeEnabled();
  await page.locator('.time-options button').first().click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/api/public/${slug}/appointments`) && r.status() === 201,
  );
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  const appointment = await (await saved).json();
  expect(appointment.company_id).toBe(slug);
  expect(appointment.end_minute - appointment.start_minute).toBe(40);
  await page.getByRole('link', { name: 'Ver meus agendamentos', exact: true }).click();
  await expect(page).toHaveURL(`/${slug}/minha-conta`);
  await expect(page.locator('.ms-reservation-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.ms-reservation-card')).toContainText('Corte personalizado');
  await page.getByRole('button', { name: 'Cancelar horário', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, cancelar', exact: true }).click();
  await expect(page.locator('.ms-reservation-card')).toHaveCount(0);
});

test('new default Mini Site: editor, five photos, private preview, publish and unpublish', async ({
  page,
}) => {
  const { company } = await prepareSiteEditor(page, { templateCode: null });
  expect(company.template.code).toBe('gradefy-minisite');
  await expect(page.getByLabel('Cor principal', { exact: true })).toHaveValue('#6c5ce7');
  await page.getByLabel('Nome público da empresa', { exact: true }).fill('Espaço Mini Site');
  await page.getByLabel('Slogan (opcional)', { exact: true }).fill('Sua identidade em destaque');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByText('Alterações salvas.', { exact: true })).toBeVisible();
  const buffer = await sharp({
    create: { width: 100, height: 120, channels: 3, background: '#6c5ce7' },
  })
    .png()
    .toBuffer();
  const file = { name: 'trabalho.png', mimeType: 'image/png', buffer };
  for (const label of ['Enviar logo', 'Enviar banner']) {
    await page.getByLabel(label, { exact: true }).setInputFiles(file);
    await expect(
      page.getByRole('img', {
        name: label === 'Enviar logo' ? 'Logo da empresa' : 'Banner da empresa',
        exact: true,
      }),
    ).toBeVisible();
  }
  await page
    .getByRole('navigation', { name: 'Seções do editor' })
    .getByRole('button', { name: 'Portfólio', exact: true })
    .click();
  for (let i = 1; i <= 5; i++) {
    await page.getByLabel('Adicionar fotografia', { exact: true }).setInputFiles(file);
    await expect(page.locator('.gf-editor-gallery img')).toHaveCount(i);
  }
  await expect(page.getByLabel('Adicionar fotografia', { exact: true })).toBeDisabled();
  const first = await page.locator('.gf-editor-gallery img').first().getAttribute('src');
  await page.getByRole('button', { name: 'Mover foto 2 para cima', exact: true }).click();
  await expect(page.locator('.gf-editor-gallery img').first()).not.toHaveAttribute('src', first);
  await page.getByRole('button', { name: 'Excluir foto 1', exact: true }).click();
  await expect(page.locator('.gf-editor-gallery img')).toHaveCount(4);
  await page.getByLabel('Adicionar fotografia', { exact: true }).setInputFiles(file);
  await expect(page.locator('.gf-editor-gallery img')).toHaveCount(5);
  await page
    .getByRole('navigation', { name: 'Seções do editor' })
    .getByRole('button', { name: 'Publicação', exact: true })
    .click();
  await page.getByRole('link', { name: 'Visualizar meu site', exact: true }).click();
  await expect(page.locator('.ms-photo-grid button')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'Espaço Mini Site', exact: true })).toBeVisible();
  await expect(page.locator('a[href*="/agendar"]')).toHaveCount(0);
  expect((await page.request.get(`/api/public/${company.slug}/site`)).status()).toBe(404);
  await page.getByRole('link', { name: 'Voltar ao Meu Site', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Seções do editor' })
    .getByRole('button', { name: 'Publicação', exact: true })
    .click();
  await page.getByRole('button', { name: 'Publicar meu site', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu site está no ar!', exact: true }),
  ).toBeVisible();
  await page.goto(`/${company.slug}`);
  await expect(page.locator('.ms-photo-grid button')).toHaveCount(5);
  await expect(page.getByRole('link', { name: 'Agendar horário', exact: true })).toHaveAttribute(
    'href',
    `/${company.slug}/agendar`,
  );
  await page.goto('/app/meu-site');
  await page
    .getByRole('navigation', { name: 'Seções do editor' })
    .getByRole('button', { name: 'Publicação', exact: true })
    .click();
  await page.getByRole('button', { name: 'Retirar site do ar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar retirada', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publicar meu site', exact: true })).toBeVisible();
  expect((await page.request.get(`/api/public/${company.slug}/site`)).status()).toBe(404);
  await page.goto(`/${company.slug}`);
  await expect(
    page.getByRole('heading', { name: 'Página não encontrada', exact: true }),
  ).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NÃO É SÓ');
});

test('onboarding catalog preselects real default Mini Site and persists it after reload', async ({
  page,
}) => {
  const email = `minisite-catalog-${Date.now()}@example.com`;
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: {
          scope: 'gradefy',
          name: 'Nova Proprietária',
          email,
          password: 'GradefyTeste123!',
          confirmPassword: 'GradefyTeste123!',
        },
      })
    ).status(),
  ).toBe(201);
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
  await expect(page).toHaveURL('/app/onboarding/setup');
  await expect(page.locator('body')).not.toContainText('Barber Classic');
  await page.reload();
  await expect(page.locator('.gf-business-choices')).toContainText('Gradefy Mini Site');
  expect((await page.request.get('/api/onboarding/business')).status()).toBe(200);
});
