import test from 'node:test';
import assert from 'node:assert/strict';
import { availableSlots, calculateMetrics, overlaps } from '../server/domain.js';

test('availability considers full combined duration, touching boundaries, closing time and Sunday', () => {
  assert.equal(overlaps(540, 600, [{ start_minute: 600, end_minute: 660 }]), false);
  assert.equal(overlaps(540, 601, [{ start_minute: 600, end_minute: 660 }]), true);
  const args = {
    date: '2030-01-07',
    duration: 70,
    occupied: [{ start_minute: 600, end_minute: 660 }],
    now: new Date('2030-01-07T11:00:00Z'),
  };
  const slots = availableSlots(args);
  assert.equal(slots.includes('09:00'), false);
  assert.equal(slots.includes('11:00'), true);
  assert.equal(slots.includes('18:00'), false);
  assert.equal(slots.includes('17:30'), true);
  assert.deepEqual(availableSlots({ ...args, date: '2030-01-06' }), []);
  assert.deepEqual(availableSlots({ ...args, now: new Date('2030-01-08T12:00:00Z') }), []);
});

test('finance uses completed visits, cents, distinct clients and calendar boundaries', () => {
  const rows = [
    { id: '1', user_id: 'a', date: '2030-01-07', total: 3500, status: 'completed' },
    { id: '2', user_id: 'a', date: '2030-01-08', total: 5500, status: 'completed' },
    { id: '3', user_id: 'b', date: '2030-01-08', total: 99900, status: 'cancelled' },
    { id: '4', user_id: 'c', date: '2030-01-08', total: 99900, status: 'confirmed' },
    { id: '5', user_id: 'd', date: '2030-01-08', total: 99900, status: 'no-show' },
    { id: '6', user_id: 'b', date: '2029-12-31', total: 2500, status: 'completed' },
  ];
  const items = [
    { appointment_id: '1', service_id: 'cut', name: 'Corte', price: 3500 },
    { appointment_id: '2', service_id: 'cut', name: 'Corte', price: 3500 },
    { appointment_id: '3', service_id: 'fake', name: 'Cancelado', price: 99900 },
  ];
  const m = calculateMetrics(rows, items, '2030-01-08');
  assert.equal(m.daily, 5500);
  assert.equal(m.weekly, 9000);
  assert.equal(m.monthly, 9000);
  assert.equal(m.yearly, 9000);
  assert.equal(m.averageTicket, 3833);
  assert.equal(m.clients, 2);
  assert.equal(m.visits, 3);
  assert.equal(m.bestRevenueDay.name, 'Segunda-feira');
  assert.equal(m.bestVolumeDay.count, 2);
  assert.deepEqual(m.topServices, [{ name: 'Corte', count: 2, revenue: 7000 }]);
  assert.equal(m.chart.length, 14);
  assert.equal(calculateMetrics([], [], '2030-01-08').averageTicket, 0);
  assert.equal(calculateMetrics([], [], '2030-01-08').bestRevenueDay, null);
});
