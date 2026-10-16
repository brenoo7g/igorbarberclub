export interface PendingBusiness {
  id: string;
  name: string;
  slug: string;
  onboardingStatus: 'pending' | 'completed';
  currentStep: 'services' | 'professionals' | 'schedule' | 'review';
  completedAt: string | null;
  trial: { status: string; trial_started_at: string; trial_ends_at: string } | null;
  plan: { code: string; name: string };
  niche: { code: string; name: string };
  template: { code: string; name: string };
  settings: {
    description: string;
    phone: string;
    whatsapp: string;
    instagram: string;
    city: string;
    region: string;
    address: string;
    postal_code?: string | null;
    street?: string | null;
    neighborhood?: string | null;
    address_number?: string | null;
    address_complement?: string | null;
  };
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes?: string;
  version: number;
  created_at?: string;
}
export interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  duration: number;
  price: number;
  active: number;
}
export interface Professional {
  id: string;
  name: string;
  specialty: string;
  photo_url: string;
  services: string[];
  user_id: string | null;
  active: number;
  upcoming_appointments?: number;
}
export interface ClientHistory {
  id: string;
  date: string;
  time: string;
  professionalName: string;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  totalCents: number;
  services: string[];
}
export interface ClientList {
  items: Client[];
  total: number;
  page: number;
  pageSize: number;
  editable: boolean;
}
export interface ClientDetail {
  timezone: string;
  client: Client;
  history: ClientHistory[];
  next: ClientHistory | null;
  editable: boolean;
  total: number;
  page: number;
  pageSize: number;
}
export interface BusinessAccess {
  plan: { name: string; priceCents: number } | null;
  company: { id: string; name: string; timezone: string };
  editable: boolean;
  entitlement: { planCode: string | null; maxProfessionals: number | null; valid: boolean };
}
export interface WorkingDay {
  weekday: number;
  active: boolean;
  start_time: string;
  end_time: string;
  breaks: { start_time: string; end_time: string }[];
}
export interface WorkingSchedule {
  settings: { agenda_mode: 'auto' | 'manual'; max_days_ahead: number; version: number };
  days: WorkingDay[];
  next_week: { week_start: string; start_date: string; end_date: string } | null;
}
