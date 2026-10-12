import type { Appointment } from '../types';
import type { FinancialBalance } from './finance-types';
export type AgendaItem = {
  id: string;
  date: string;
  time: string;
  barberId: string;
  professionalName: string;
  clientName: string;
  duration: number;
  totalCents: number;
  status: Appointment['status'];
  services: { id: string; name: string; price: number; duration: number }[];
};
export type ExpectedAppointment = {
  date: string;
  time: string;
  barberId: string;
  status: string;
  notes: string;
};
export type AgendaDetail = {
  financial: FinancialBalance;
  item: Appointment & { notes: string; client_id: string | null };
  expected: ExpectedAppointment;
  actions: { cancel: boolean; reschedule: boolean; complete: boolean };
  editable: boolean;
  timezone: string;
};
export type AgendaState = {
  company: { id: string; name: string; timezone: string };
  today: string;
  now: string;
  from: string;
  to: string;
  view: 'day' | 'week';
  page: number;
  pageSize: number;
  total: number;
  editable: boolean;
  items: AgendaItem[];
  professionals: { id: string; name: string; active: number }[];
};
export type AgendaCatalog = {
  editable: boolean;
  services: { id: string; name: string; price: number; duration: number }[];
  professionals: { id: string; name: string; services: string[] }[];
  clients: { id: string; name: string }[];
};
