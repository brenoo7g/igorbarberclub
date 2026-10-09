export interface Visitor {
  id: string;
  name: string;
  email: string;
  phone: string;
}
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
  service_ids: string[];
  photo_url?: string | null;
}
export interface PublicSite {
  company: {
    id: string;
    name: string;
    slug: string;
    template: string;
    niche: string;
    timezone: string;
  };
  settings: {
    logo_url: string | null;
    favicon_url: string | null;
    wordmark_title: string | null;
    wordmark_subtitle: string | null;
    slogan: string | null;
    hero_image_url: string | null;
    about_image_url: string | null;
    description: string | null;
    about_detail: string | null;
    whatsapp: string | null;
    phone: string | null;
    instagram_url: string | null;
    address: string | null;
    city: string | null;
    region: string | null;
    location_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    featured_service_ids: string[];
    highlight_service_id: string | null;
  };
  counts: { services: number; professionals: number; portfolio: number };
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
  testGuestAccess?: boolean;
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
