import { test, expect } from '@playwright/test';
test('navegação, filtros, galeria, reserva persistida e cancelamento', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-09-28T11:00:00Z'));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Agendar meu horário', exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images, (img) => img.decode().catch(() => {})));
  });
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });
  await page.getByRole('tab', { name: 'Serviços', exact: true }).click();
  await page.getByRole('button', { name: 'Combos', exact: true }).click();
  await expect(page.getByRole('button', { name: /Corte \+ Barba \+ Pigmentação,/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Barba Simples,/ })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Galeria', exact: true }).click();
  await page.getByRole('button', { name: 'Disfarçado', exact: true }).click();
  await page.getByRole('button', { name: 'Ampliar Disfarçado na régua' }).click();
  await expect(page.getByRole('button', { name: 'Fechar foto' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar foto' }).click();
  await page.getByRole('tab', { name: 'Serviços', exact: true }).click();
  await page.getByRole('button', { name: /^Barba Simples,/ }).click();
  await page.getByRole('button', { name: 'Horário 09:00', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar agendamento' }).click();
  await page.getByRole('textbox', { name: 'Seu nome', exact: true }).fill('Breno');
  await page.getByRole('button', { name: 'Confirmar agendamento local' }).click();
  await expect(page.getByText('Salvo somente neste aparelho.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Ver meus agendamentos' }).click();
  await expect(page.getByRole('textbox', { name: 'Nome do perfil' })).toHaveValue('Breno');
  await page.reload();
  await page.getByRole('tab', { name: 'Perfil', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nome do perfil' })).toHaveValue('Breno');
  await expect(page.getByText('Barba Simples', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Serviços', exact: true }).click();
  await page.getByRole('button', { name: /^Barba Simples,/ }).click();
  await expect(page.getByRole('button', { name: 'Horário 09:00', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar agendamento local' }).click();
  await page.getByRole('button', { name: 'Sim, cancelar localmente' }).click();
  await expect(page.getByText('CANCELADO LOCALMENTE')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Serviços', exact: true }).click();
  await page.getByRole('button', { name: /^Barba Simples,/ }).click();
  await expect(page.getByRole('button', { name: 'Horário 09:00', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
test('layout compacto e perfil editável', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Agendar meu horário', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('tab', { name: 'Perfil', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome do perfil' }).fill('Igor');
  await page.getByRole('button', { name: 'Salvar perfil', exact: true }).click();
  await expect(page.getByText('Perfil salvo neste aparelho.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Salve, Igor.', { exact: true })).toBeVisible();
});
