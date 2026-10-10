import { expect } from '@playwright/test';

export async function prepareSiteEditor(page) {
  const email = `editor-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: {
          scope: 'gradefy',
          name: 'Proprietária Editora',
          email,
          password: 'GradefyTeste123!',
          confirmPassword: 'GradefyTeste123!',
        },
      })
    ).status(),
  ).toBe(201);
  const created = await page.request.post('/api/onboarding/business', {
    data: {
      name: 'Espaço Editora',
      slug: `editor-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      phone: '21999998888',
      city: 'Rio de Janeiro',
      region: 'RJ',
      planCode: 'individual',
      nicheCode: 'barbershop',
      templateCode: 'barber-classic',
    },
  });
  const { company } = await created.json();
  const service = await (
    await page.request.post('/api/onboarding/operations/services', {
      data: {
        name: 'Corte',
        description: '',
        duration: 40,
        price: 3000,
        category: 'Corte',
        active: true,
      },
    })
  ).json();
  const person = await (
    await page.request.post('/api/onboarding/operations/professionals', {
      data: { name: 'Profissional', services: [service.id] },
    })
  ).json();
  expect(
    (
      await page.request.put(`/api/onboarding/operations/professionals/${person.id}/schedule`, {
        data: {
          agenda_mode: 'auto',
          max_days_ahead: 15,
          version: 0,
          days: Array.from({ length: 7 }, (_, weekday) => ({
            weekday,
            active: weekday === 2,
            start_time: '09:00',
            end_time: '19:00',
            breaks: [],
          })),
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await page.request.post('/api/onboarding/operations/complete', { data: {} })).status(),
  ).toBe(200);
  await page.goto('/app/meu-site');
  await expect(page.getByRole('heading', { name: 'Meu Site', exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome público da empresa', { exact: true })).toHaveValue(
    'Espaço Editora',
  );
  return { company, email, service, person };
}
