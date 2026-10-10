import { test, expect } from '@playwright/test';

const media = async (page) =>
  page.route('https://media.example.test/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#1a1a1a"/></svg>',
    }),
  );

test('Igor legacy and slug use the same template and preserve original marketing', async ({
  page,
}) => {
  for (const path of ['/', '/igor-barber-club']) {
    await page.goto(path);
    await expect(
      page.getByRole('link', { name: 'Igor Barber Club — início' }).first(),
    ).toBeVisible();
    await expect(page.locator('#hero-title')).toHaveText(/NÃO É SÓ.*UM CORTE.*É SOBRE VOCÊ/s);
    await expect(page.locator('.service-card')).toHaveCount(4);
    await expect(page.locator('.portfolio-card')).toHaveCount(5);
    await expect(page.locator('.hero-photo img')).toHaveAttribute('src', '/images/hero.webp');
    await expect(page.locator('.about-copy')).toContainText('Igor Borges');
    await expect(page.getByText('[Sua logo]', { exact: true })).toHaveCount(0);
  }
});

test('company identity, media, contacts and catalogue switch without crossing scope; mobile and reload', async ({
  page,
}) => {
  await media(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [slug, name] of [
    ['barbearia-imperial', 'Barbearia Imperial'],
    ['navalha-club', 'Navalha Club'],
  ]) {
    await page.goto(`/${slug}`);
    await expect(page.getByRole('img', { name: `Logo ${name}` }).first()).toBeVisible();
    await expect(page.locator('.service-card')).toHaveCount(1);
    await expect(page.locator('.service-card')).toContainText(`Corte ${name}`);
    await expect(page.locator('.portfolio-card')).toHaveCount(1);
    await expect(page.locator('.portfolio-card img')).toHaveAttribute(
      'src',
      new RegExp(`/api/public/${slug}/portfolio/`),
    );
    await expect(page.locator('.contact-details')).toContainText(`Rua ${name}, 123`);
    await expect(page.locator('.contact-social').filter({ hasText: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/5521999999999',
    );
    await expect(page.locator('body')).not.toContainText('Igor');
    await expect(page.locator('body')).not.toContainText('[Sua');
    for (const width of [1440, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.reload();
    await expect(page.locator('.service-card')).toContainText(name);
    await page.locator('.service-card').click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/agendar\?`));
    await expect(page.getByRole('radio', { name: new RegExp(`Corte ${name}`) })).toBeChecked();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.locator('.barber-options')).toContainText(`Equipe ${name}`);
    await expect(page.locator('.barber-options img')).toHaveAttribute('src', new RegExp(slug));
    await expect(page.locator('.barber-options')).not.toContainText('Igor');
  }
  await page.goto('/not-a-company');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expect(page.locator('.brand,.service-card,.portfolio-card')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Igor');
  expect(errors).toEqual([]);
});

test('template preview uses placeholders and never calls a business API', async ({ page }) => {
  const apiRequests = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api')) apiRequests.push(r.url());
  });
  await page.goto('/preview/barber-classic');
  await expect(page.getByText('[Sua logo]', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('[Nome da sua barbearia]', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('[Sua localização]', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('[Seus serviços]', { exact: true })).toBeVisible();
  await expect(page.getByText('[Sua equipe]', { exact: true })).toBeVisible();
  await expect(page.getByText('[Seu portfólio]', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Igor');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.service-card').click();
  await expect(page).toHaveURL(/preview\/barber-classic\/agendar/);
  expect(apiRequests).toEqual([]);
});

test('published missing optional content is hidden and never shows preview placeholders', async ({
  page,
}) => {
  await page.route('**/api/public/barbearia-imperial/site', async (route) => {
    const response = await route.fetch();
    const site = await response.json();
    for (const key of Object.keys(site.settings))
      site.settings[key] = key === 'featured_service_ids' ? [] : null;
    site.counts = { services: 0, professionals: 0, portfolio: 0 };
    await route.fulfill({ response, json: site });
  });
  await page.route('**/api/public/barbearia-imperial/portfolio', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto('/barbearia-imperial');
  await expect(
    page.getByRole('link', { name: 'Barbearia Imperial — início' }).first(),
  ).toBeVisible();
  await expect(page.locator('#sobre,#servicos,#galeria,.instagram-link,.company-logo')).toHaveCount(
    0,
  );
  await expect(page.locator('body')).not.toContainText('[Sua');
  await expect(page.locator('body')).not.toContainText('Campo Grande');
});
