// Destinations are a finite set, never an arbitrary URL from query/localStorage.
export function customerQuery(search: string, destination?: 'agendar' | 'reservas') {
  const source = new URLSearchParams(search);
  const result = new URLSearchParams({
    destino: destination || (source.get('destino') === 'reservas' ? 'reservas' : 'agendar'),
  });
  for (const key of ['servico', 'profissional', 'semana', 'remarcar']) {
    const value = source.get(key);
    if (value && /^[a-zA-Z0-9_-]{1,200}$/.test(value)) result.set(key, value);
  }
  return '?' + result.toString();
}
export function customerDestination(search: string) {
  const source = new URLSearchParams(customerQuery(search));
  if (source.get('destino') === 'reservas') return '/minha-conta';
  source.delete('destino');
  const query = source.toString();
  return '/agendar' + (query ? '?' + query : '');
}
