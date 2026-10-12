import { useRef, useState } from 'react';
import { useApp } from '../context';
import { errorMessage, newIdempotencyKey } from '../lib';
import { Button } from './components';
export const paymentMethods: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  debit: 'Cartão de débito',
  credit: 'Cartão de crédito',
  transfer: 'Transferência',
  other: 'Outro',
};
export const expenseCategories: Record<string, string> = {
  rent: 'Aluguel',
  materials: 'Materiais',
  products: 'Produtos',
  equipment: 'Equipamentos',
  utilities: 'Energia e água',
  marketing: 'Marketing',
  other: 'Outras despesas',
};
export function financialCents(value: string) {
  if (!/^\d{1,7}([,.]\d{1,2})?$/.test(value.trim()))
    throw new Error('Informe um valor positivo com até duas casas decimais.');
  const [whole, fraction = ''] = value.trim().replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents < 1 || cents > 100000000)
    throw new Error('Informe um valor entre R$ 0,01 e R$ 1.000.000,00.');
  return cents;
}
export const financialDate = (date: string) => date.split('-').reverse().join('/');
export const financialTime = (date: string, timezone: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(date));
export function useFinancialMutation(companyId: string, done: () => void) {
  const { api } = useApp(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const working = useRef(false),
    attempt = useRef<{ signature: string; key: string } | null>(null);
  async function submit(path: string, data: object, method = 'POST') {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    const body = JSON.stringify(data),
      signature = method + path + body;
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: newIdempotencyKey() };
    try {
      await api(path, {
        method,
        headers: { 'X-Gradefy-Company-Id': companyId, 'Idempotency-Key': attempt.current.key },
        body,
      });
      attempt.current = null;
      done();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return { submit, busy, error, setError };
}
export function FinancialPagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (n: number) => void;
}) {
  return total > 30 ? (
    <div className="gf-finance-pagination">
      <Button variant="secondary" disabled={page === 1} onClick={() => onPage(page - 1)}>
        Anterior
      </Button>
      <span>
        Página {page} de {Math.ceil(total / 30)}
      </span>
      <Button variant="secondary" disabled={page * 30 >= total} onClick={() => onPage(page + 1)}>
        Próxima
      </Button>
    </div>
  ) : null;
}
