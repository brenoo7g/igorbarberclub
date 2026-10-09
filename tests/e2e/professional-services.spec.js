import { test, expect } from '@playwright/test';

test('service selection filters professionals and clears an incompatible previous choice', async ({
  page,
}) => {
  await page.goto('/agendar?servico=barba');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const specialist = page.getByRole('button', { name: /Somente Barba QA/ });
  await expect(specialist).toBeVisible();
  await specialist.click();
  await expect(specialist).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByRole('radio', { name: /Corte masculino/ }).check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(specialist).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Igor Borges/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
