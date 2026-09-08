export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(
      'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
      0,
    );
  }
  const unavailable =
    'O agendamento online está temporariamente indisponível. Tente novamente em instantes.';
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(unavailable, response.status);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(unavailable, response.status);
  }
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/register')
      window.dispatchEvent(new Event('session-expired'));
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : unavailable;
    throw new ApiError(message, response.status);
  }
  return data as T;
}
export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const formatDate = (
  date: string,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long' },
) =>
  new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'America/Sao_Paulo' }).format(
    new Date(`${date}T12:00:00Z`),
  );
export const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Algo deu errado. Tente novamente.';
export const statusLabels = {
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  'no-show': 'Não compareceu',
};
