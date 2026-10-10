export interface DashboardAppointment {
  id: string;
  date: string;
  time: string;
  duration: number;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  clientName: string;
  professionalName: string;
  professionalId: string;
  services: string[];
  totalCents: number;
}
export interface DashboardState {
  company: { id: string; name: string; slug: string; timezone: string; logo: string | null };
  clock: { now: string; today: string; greeting: string };
  period: { code: 'day' | 'week' | 'month'; start: string; end: string };
  metrics: { todayAppointments: number; completedAppointments: number; expectedValueCents: number };
  nextAppointment: DashboardAppointment | null;
  agenda: {
    date: string;
    professionalId: string | null;
    page: number;
    pageSize: number;
    total: number;
    items: DashboardAppointment[];
  };
  professionals: { id: string; name: string; active: number }[];
  site: { templateName: string; published: boolean; path: string | null };
  subscription: {
    planName: string | null;
    planCode: string | null;
    status: string | null;
    subscriptionStatus: string | null;
    valid: boolean;
    reason: string | null;
    trialEndsAt: string | null;
    trialDaysRemaining: number;
  };
}
