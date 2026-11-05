import { expect, test } from '@playwright/test';

const root = 'test-results/gradefy-7f4c61-r2-';

test('prévia e progresso mobile são legíveis sem alterar o cadastro ou o desktop', async ({
  page,
}) => {
  const email = `onboarding-r2-${Date.now()}@example.com`;
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: {
          scope: 'gradefy',
          name: 'Proprietária R2',
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

  await page.setViewportSize({ width: 1672, height: 941 });
  await page.screenshot({ path: `${root}desktop-1672x941.png` });

  for (const [width, height] of [
    [312, 720],
    [320, 720],
    [360, 800],
    [375, 812],
    [390, 844],
    [428, 926],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(dimensions.scroll, `overflow em ${width}px`).toBeLessThanOrEqual(dimensions.viewport);

    const preview = page.locator('.gf-business-preview-site');
    const progress = page.locator('.gf-business-progress');
    const layout = await page.evaluate(() => {
      const site = document.querySelector('.gf-business-preview-site').getBoundingClientRect();
      const progress = document.querySelector('.gf-business-progress').getBoundingClientRect();
      const address = document.querySelector('.gf-business-preview-address');
      return {
        siteTop: site.top,
        progressTop: progress.top,
        siteWidth: site.width,
        progressWidth: progress.width,
        addressOverflow: address.scrollWidth > address.clientWidth + 1,
      };
    });
    expect(layout.progressTop).toBeGreaterThan(layout.siteTop);
    expect(layout.siteWidth).toBeGreaterThan(width - 100);
    expect(layout.progressWidth).toBeGreaterThan(width - 100);
    expect(layout.addressOverflow).toBe(false);
    await expect(preview).toContainText('Sua barbearia');
    await expect(progress).toContainText('Pendente');
    if ([320, 390, 428].includes(width)) {
      await preview.scrollIntoViewIfNeeded();
      await page.locator('.gf-business-preview').screenshot({
        path: `${root}panel-${width}x${height}.png`,
      });
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${root}mobile-full-390x844.png`, fullPage: true });
  const slug = `aurora-r2-${Date.now()}`;
  await page.getByLabel('Nome do estabelecimento', { exact: true }).fill('Estúdio Aurora');
  await page.getByLabel('Nome público / slug', { exact: true }).fill(slug);
  await expect(page.locator('.gf-business-preview-address')).toContainText(
    `http://127.0.0.1:4173/${slug}`,
  );
  await expect(page.locator('.gf-business-progress')).toContainText('Completo');
  await page.locator('.gf-business-preview').screenshot({
    path: `${root}partial-390x844.png`,
  });
  await page.getByLabel('Telefone', { exact: true }).fill('(21) 99999-8888');
  await page.getByLabel('Cidade', { exact: true }).fill('Rio de Janeiro');
  await page.getByLabel('Estado', { exact: true }).selectOption('RJ');
  await expect(page.locator('.gf-business-progress li')).toHaveCount(3);
  for (const label of ['Dados básicos', 'Contato', 'Localização'])
    await expect(page.locator('.gf-business-progress li').filter({ hasText: label })).toContainText(
      'Completo',
    );
  await page.locator('.gf-business-preview').screenshot({
    path: `${root}filled-390x844.png`,
  });
  await expect
    .poll(async () => (await (await page.request.get('/api/onboarding/business')).json()).company)
    .toBeNull();
});
