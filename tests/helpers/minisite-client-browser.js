import { expect } from '@playwright/test';
export async function registerMiniCustomer(
  target,
  email = `mini-client-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
) {
  const response = await target.request.post('/api/public/minisite-browser/auth/register', {
    data: {
      name: 'Cliente Mini Site',
      email,
      phone: '21988776655',
      password: 'ClienteMini2026!',
      confirmPassword: 'ClienteMini2026!',
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).user;
}
