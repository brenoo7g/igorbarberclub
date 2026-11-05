import { expect, test } from '@playwright/test';

const prefix = 'test-results/gradefy-7f4c61-r1-';
async function capture(page, name, fullPage = false) {
  await page.screenshot({ path: `${prefix}${name}.png`, fullPage });
}
async function prepare(page) {
  const email = `fidelity-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: {
          scope: 'gradefy',
          name: 'Proprietária de Teste',
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
}
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
}

test('Cadastro visual: hierarquia, prévia real, progresso e responsividade', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await expect(page.locator('.gf-business-preview')).toBeVisible();
  await expect(page.locator('.gf-business-progress')).toContainText('Pendente');
  await capture(page, 'desktop-1672x941');
  await capture(page, 'desktop-full-1672x941', true);
  await capture(page, 'preview-desktop-1672x941');
  await page.setViewportSize({ width: 390, height: 844 });
  const order = await page
    .locator('.gf-business-choices, .gf-business-preview, .gf-business-form-card')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
  expect(order[0]).toBeLessThan(order[1]);
  expect(order[1]).toBeLessThan(order[2]);
  await capture(page, 'mobile-first-390x844');
  await capture(page, 'mobile-full-390x844', true);
  await page.locator('.gf-business-preview').scrollIntoViewIfNeeded();
  await capture(page, 'preview-mobile-390x844');
  for (const [width, height] of [
    [320, 720],
    [360, 800],
    [375, 812],
    [390, 844],
    [428, 926],
    [768, 1024],
    [1024, 768],
    [1280, 720],
    [1366, 768],
    [1440, 900],
    [1672, 941],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await noOverflow(page);
    if ([320, 360, 428, 1280].includes(width)) await capture(page, `responsive-${width}x${height}`);
  }
  await page.setViewportSize({ width: 1672, height: 941 });
  const slug = `estudio-fidelity-${Date.now()}`;
  await page.getByLabel('Nome do estabelecimento', { exact: true }).fill('Estúdio Aurora');
  await page.getByLabel('Nome público / slug', { exact: true }).fill(slug);
  await page.getByLabel('Descrição', { exact: true }).fill('Cuidado e estilo com hora marcada.');
  await expect(page.locator('.gf-business-preview-site')).toContainText('Estúdio Aurora');
  await expect(page.locator('.gf-business-preview-address')).toContainText(
    `http://127.0.0.1:4173/${slug}`,
  );
  await expect(page.locator('.gf-business-progress')).toContainText('Completo');
  await capture(page, 'filled-desktop-1672x941');
  await page.getByRole('link', { name: 'Alterar plano', exact: true }).click();
  await page.goto('/app/onboarding/setup');
  await expect(page.getByLabel('Nome do estabelecimento', { exact: true })).toHaveValue(
    'Estúdio Aurora',
  );
  await expect(page.getByLabel('Nome público / slug', { exact: true })).toHaveValue(slug);
  await page.getByLabel('Telefone', { exact: true }).fill('(21) 99999-8888');
  await page.getByLabel('Cidade', { exact: true }).fill('Rio de Janeiro');
  await page.getByLabel('Estado', { exact: true }).selectOption('RJ');
  await page.getByLabel('CEP', { exact: true }).fill('123');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('CEP', { exact: true }).scrollIntoViewIfNeeded();
  await capture(page, 'location-mobile-390x844');
  await page.getByLabel('CEP', { exact: true }).fill('');
  await page
    .getByRole('button', { name: 'Criar minha empresa', exact: true })
    .scrollIntoViewIfNeeded();
  await capture(page, 'actions-mobile-390x844');
  await capture(page, 'filled-mobile-390x844', true);
  await page.getByLabel('Nome público / slug', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Criar minha empresa', exact: true }).click();
  await expect(page.getByText('Esse nome público é reservado pelo sistema.')).toBeVisible();
  await capture(page, 'errors-mobile-390x844');
  await page.getByLabel('Nome público / slug', { exact: true }).fill(slug);
  await page.setViewportSize({ width: 1672, height: 941 });
  await capture(page, 'errors-desktop-1672x941');
  await page.route('**/api/onboarding/business', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Criar minha empresa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Criando empresa…' })).toBeDisabled();
  await capture(page, 'loading-desktop-1672x941');
  await expect(page.locator('.gf-setup-summary')).toContainText('Estúdio Aurora');
  const { company } = await (await page.request.get('/api/onboarding/business')).json();
  expect(company.slug).toBe(slug);
  expect((await page.request.get(`/api/public/${slug}/site`)).status()).toBe(404);
});
