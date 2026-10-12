import { expect, test } from '@playwright/test';

for (const width of [320, 390, 768, 1440]) {
  test(`responsive layout and assets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(
      await page.evaluate(() =>
        [...document.images]
          .filter((img) => img.loading !== 'lazy')
          .every((img) => img.complete && img.naturalWidth > 0),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.fonts.check('600 20px Sora') && document.fonts.check('400 16px Inter'),
      ),
    ).toBe(true);
    await expect(page.getByRole('heading', { name: 'Barbearias', exact: true })).toBeVisible();
    await page.locator('#lancamento').scrollIntoViewIfNeeded();
    await expect(page.getByRole('link', { name: 'Acompanhar no Instagram' })).toBeVisible();
    expect(
      await page.evaluate(() =>
        [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    expect(requests.every((url) => url.startsWith('http://127.0.0.1:4175/'))).toBe(true);
    expect(requests.some((url) => url.includes('/api/'))).toBe(false);
    await page.screenshot({
      path: `test-results/screenshots/landing-${width}.png`,
      fullPage: true,
    });
  });
}

test('mobile menu supports navigation, Escape and keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('button', { name: 'Fechar menu' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Segmentos', exact: true })
    .click();
  await expect(page).toHaveURL(/#segmentos$/);
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('anchor buttons and official Instagram links work without private paths', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Conhecer o Gradefy' }).click();
  await expect(page).toHaveURL(/#recursos$/);
  for (const link of await page.locator('a[href^="#"]').all()) {
    const href = await link.getAttribute('href');
    await expect(page.locator(href!)).toHaveCount(1);
  }
  const socialLinks = page.locator('a[href^="https:"]');
  expect(await socialLinks.count()).toBe(3);
  for (const link of await socialLinks.all()) {
    await expect(link).toHaveAttribute('href', 'https://www.instagram.com/gradefyapp/');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await page
    .context()
    .route('https://www.instagram.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Official social channel</h1>' }),
    );
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Acompanhar no Instagram' }).click();
  const instagram = await popup;
  await expect(instagram).toHaveURL('https://www.instagram.com/gradefyapp/');
  await instagram.close();
  await expect(page.locator('form, iframe, input')).toHaveCount(0);
});

test('SEO is present without JavaScript and preview headers are scoped correctly', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://gradefyapp.com.br/',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://gradefyapp.com.br/og-gradefy.png',
  );
  const official = await request.get('/', { headers: { Host: 'gradefyapp.com.br' } });
  expect(official.status()).toBe(200);
  expect(official.headers()['x-robots-tag']).toBeUndefined();
  for (const hostname of ['fixture.pages.dev', 'preview.fixture.pages.dev']) {
    const response = await request.get('/', { headers: { Host: hostname } });
    expect(response.headers()['x-robots-tag']).toContain('noindex');
  }
  for (const pathname of ['/api/plans', '/app/login', '/admin', '/missing']) {
    const response = await request.get(pathname);
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('Página não encontrada');
  }
  await context.close();
});

test('reduced motion, skip link and local preview index protection', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  expect(
    await page
      .locator('.floating-booking')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe(
    'auto',
  );
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#conteudo$/);
});
