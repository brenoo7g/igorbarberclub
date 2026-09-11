export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'client' | 'admin';
  avatar: string | null;
  profileVersion: number;
}
export interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  category: string;
  active: number;
}
export interface Barber {
  id: string;
  name: string;
  specialty: string;
}
export interface WorkingDay {
  weekday: number;
  active: boolean;
  start_time: string;
  end_time: string;
  breaks: { start_time: string; end_time: string }[];
}
export interface ReleasedWeek {
  week_start: string;
  start_date: string;
  end_date: string;
}
export interface ScheduleSettings {
  settings: { agenda_mode: 'auto' | 'manual'; max_days_ahead: number; version: number };
  days: WorkingDay[];
  released_weeks: ReleasedWeek[];
  next_week: ReleasedWeek | null;
}
export interface PublicSchedule {
  mode: 'auto' | 'manual';
  active_days: number[];
  dates: string[];
  max_date: string;
}
export interface WeekShare extends ReleasedWeek {
  url: string;
  text: string;
  whatsapp_url: string;
}
export interface Appointment {
  id: string;
  user_id: string | null;
  barber_id: string;
  barber_name: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  date: string;
  time: string;
  start_minute: number;
  end_minute: number;
  total: number;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  services: { service_id: string; name: string; price: number; duration: number }[];
}
export interface Block {
  id: string;
  barber_id: string;
  date: string;
  start_minute: number;
  end_minute: number;
  reason: string;
}
export interface Config {
  demo: boolean;
  open: number;
  close: number;
  timezone: string;
  notifications: { email: boolean; whatsapp: boolean };
}
export interface Metrics {
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
  averageTicket: number;
  clients: number;
  visits: number;
  bestRevenueDay: { name: string; revenue: number } | null;
  bestVolumeDay: { name: string; count: number } | null;
  topServices: { name: string; count: number; revenue: number }[];
  chart: { date: string; revenue: number; count: number }[];
}
