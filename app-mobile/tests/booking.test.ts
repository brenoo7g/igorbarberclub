import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brazilDay,
  createBooking,
  demoTimes,
  emptyData,
  isAvailable,
  nextDays,
  parseSavedData,
} from '../src/lib/booking.ts';
const now = new Date('2026-09-28T11:00:00Z');
const input = { serviceId: 'barba', date: '2026-09-28', time: '09:00', customer: ' Breno ' };
test('datas usam Brasília mesmo perto da virada UTC', () => {
  assert.equal(brazilDay(new Date('2026-09-29T01:30:00Z')), '2026-09-28');
  assert.equal(nextDays(now).length, 21);
});
test('confirma, rejeita sobreposição e libera após cancelamento', () => {
  const booking = createBooking(input, [], now);
  assert.equal(booking.customer, 'Breno');
  assert.equal(booking.status, 'local');
  assert.throws(
    () => createBooking({ ...input, serviceId: 'combo' }, [booking], now),
    /disponível/,
  );
  assert.equal(isAvailable(input.date, '09:40', [booking], now), true);
  assert.equal(
    isAvailable(input.date, input.time, [{ ...booking, status: 'cancelled' }], now),
    true,
  );
});
test('rejeita horários passados, domingo, fora da janela e valores arbitrários', () => {
  assert.equal(isAvailable(input.date, '09:00', [], new Date('2026-09-28T12:00:00Z')), false);
  assert.equal(isAvailable('2026-10-04', '09:00', [], now), false);
  assert.equal(isAvailable('2027-10-04', '09:00', [], now), false);
  assert.equal(isAvailable(input.date, '03:00', [], now), false);
  assert.equal(isAvailable('invalid', '09:00', [], now), false);
  assert.equal(demoTimes.at(-1), '17:00');
});
test('nome e serviço são obrigatórios', () => {
  assert.throws(() => createBooking({ ...input, serviceId: 'unknown' }, [], now), /serviço/);
  assert.throws(() => createBooking({ ...input, customer: ' ' }, [], now), /nome/);
});
test('restaura persistência e detecta dados inválidos', () => {
  assert.deepEqual(parseSavedData(null), emptyData);
  const data = { ...emptyData, bookings: [createBooking(input, [], now)] };
  assert.deepEqual(parseSavedData(JSON.stringify(data)), data);
  assert.throws(() => parseSavedData('{'));
  assert.throws(() => parseSavedData('{"version":9}'));
  assert.throws(() =>
    parseSavedData(
      JSON.stringify({ ...data, bookings: [{ ...data.bookings[0], serviceId: 'deleted' }] }),
    ),
  );
});
