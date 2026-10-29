// Browser-only presentation data. Requests are intercepted in Playwright; no database is changed.
export const services = [
  ['corte', 'Corte clássico', 'Cabelo', 40, 4500],
  ['degrade', 'Degradê premium', 'Cabelo', 50, 5500],
  ['barba', 'Barba completa', 'Barba', 30, 3500],
  ['sobrancelha', 'Sobrancelha', 'Acabamento', 20, 2000],
  ['hidratacao', 'Hidratação capilar', 'Tratamentos', 45, 6500],
  ['acabamento', 'Acabamento de nuca', 'Acabamento', 20, 2500],
  ['infantil', 'Corte infantil', 'Cabelo', 35, 4000],
].map(([id, name, category, duration, price], index) => ({
  id: 'visual-' + id,
  name,
  category,
  duration,
  price,
  description: [
    'Acabamento preciso e atendimento personalizado.',
    'Estilo atual com técnica detalhada.',
    'Cuidado profissional para seu visual.',
  ][index % 3],
  active: index === 5 ? 0 : 1,
}));

export const professionals = [
  ['rafael', 'Rafael Silva', 'Cortes e acabamento', [0, 1, 6], 1, 'ready'],
  ['camila', 'Camila Costa', 'Barba e design', [2, 3], 1, 'ready'],
  ['lucas', 'Lucas Oliveira', 'Cortes masculinos', [0, 1, 5], 1, 'waiting'],
  ['ana', 'Ana Martins', 'Tratamentos capilares', [4, 6], 1, 'setup'],
  ['pedro', 'Pedro Santos', 'Cortes e barba', [0, 2], 0, 'setup'],
].map(([id, name, specialty, serviceIndexes, active, state]) => ({
  id: 'visual-' + id,
  name,
  specialty,
  photo_url: '',
  active,
  services: serviceIndexes.map((index) => services[index].id),
  user_id: id === 'rafael' || id === 'camila' ? 'visual-user-' + id : null,
  availability: { configured: state !== 'setup', state, pending: [] },
}));

const today = new Date().toISOString().slice(0, 10);
const shift = (date, delta) =>
  new Date(Date.parse(date + 'T12:00:00Z') + delta * 86400000).toISOString().slice(0, 10);
const monday = shift(today, 7 - ((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7));
export const weekly = {
  from: monday,
  to: shift(monday, 6),
  today,
  timezone: 'America/Sao_Paulo',
  truncated: false,
  people: professionals.map((person, index) => ({
    id: person.id,
    name: person.name,
    active: person.active,
    agendaMode: 'auto',
    days: Array.from({ length: 7 }, (_, day) => ({
      date: shift(monday, day),
      configured: true,
      released: true,
      active: day < 6 && person.active === 1 && !(index === 3 && day === 2),
      start: day === 5 ? '09:00' : '09:00',
      end: day === 5 ? '16:00' : '18:00',
      breaks: day < 6 ? [{ start: '12:00', end: '13:00' }] : [],
      blocks: index === 1 && day === 3 ? [{ startMinute: 840, endMinute: 960 }] : [],
    })),
  })),
};

export const team = {
  company: { id: 'business-browser-team', name: 'Clube Horizonte' },
  members: [
    {
      id: 'visual-owner',
      name: 'Gestão de Cadastros',
      email: 'owner@example.test',
      role: 'owner',
      status: 'active',
      professional_name: null,
      professional_id: null,
    },
    {
      id: 'visual-rafael',
      name: 'Rafael Silva',
      email: 'rafael@example.test',
      role: 'professional',
      status: 'active',
      professional_name: 'Rafael Silva',
      professional_id: 'visual-rafael',
    },
    {
      id: 'visual-manager',
      name: 'Marina Gestão',
      email: 'marina@example.test',
      role: 'manager',
      status: 'active',
      professional_name: null,
      professional_id: null,
    },
  ],
  invitations: [
    {
      id: 'visual-invitation',
      email: 'novo@example.test',
      role: 'professional',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      delivery: 'manual',
    },
  ],
  professionals: professionals.map((person) => ({
    id: person.id,
    name: person.name,
    active: person.active,
    user_id: person.user_id,
  })),
  linksEditable: true,
};

export const servicesReport = {
  topServices: [0, 1, 2, 6, 3].map((index, rank) => ({
    id: services[index].id,
    name: services[index].name,
    active: 1,
    quantity: [24, 18, 14, 9, 6][rank],
    valueCents: 0,
    sharePercent: null,
  })),
};
export const professionalsReport = {
  professionals: {
    items: professionals.map((person, index) => ({
      id: person.id,
      name: person.name,
      active: person.active,
      quantity: [26, 18, 12, 7, 0][index],
      cancelled: 0,
      noShow: 0,
      valueCents: 0,
    })),
    total: professionals.length,
  },
};
