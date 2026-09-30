export type Service = {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  category: string;
};
export const services: Service[] = [
  {
    id: 'barba',
    name: 'Barba Simples',
    description: 'Contornos precisos. Sua barba no lugar.',
    price: 1500,
    duration: 40,
    category: 'Barba',
  },
  {
    id: 'barba-pigmentacao',
    name: 'Barba + Pigmentação',
    description: 'Preenchimento e definição em cada detalhe.',
    price: 2500,
    duration: 40,
    category: 'Barba',
  },
  {
    id: 'combo',
    name: 'Corte + Barba + Pigmentação',
    description: 'A experiência completa para renovar seu visual.',
    price: 5500,
    duration: 40,
    category: 'Combos',
  },
  {
    id: 'acabamento',
    name: 'Acabamento ou Sobrancelha',
    description: 'O toque final que faz toda a diferença.',
    price: 1000,
    duration: 40,
    category: 'Acabamento',
  },
];
export const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
export const instagram = 'https://www.instagram.com/igor_barber_club/';
