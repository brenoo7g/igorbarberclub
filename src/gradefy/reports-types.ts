export type ReportArea = 'overview' | 'finance' | 'appointments' | 'services' | 'professionals';
export type ReportFilters = {
  area: ReportArea;
  period: string;
  from?: string;
  to?: string;
  professionalId?: string;
  serviceId?: string;
  status?: string;
  type?: string;
  method?: string;
  sort: string;
  page: number;
};
export type ReportFinancialDay = {
  date: string;
  receivedCents: number;
  paidExpensesCents: number;
  balanceCents: number;
};
export type ReportAttendance = {
  total: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  future: number;
};
export type ReportService = {
  id: string;
  name: string;
  active: number;
  quantity: number;
  valueCents: number;
  sharePercent: number | null;
};
export type ReportProfessional = {
  id: string;
  name: string;
  active: number;
  quantity: number;
  cancelled: number;
  noShow: number;
  valueCents: number;
};
export type ReportState = {
  company: { id: string; name: string; timezone: string };
  editable: boolean;
  today: string;
  from: string;
  to: string;
  filters: ReportFilters;
  page: number;
  pageSize: number;
  metrics?: {
    expectedCents: number;
    completedCents: number;
    receivedCents: number;
    paidExpensesCents: number;
    balanceCents: number;
  };
  financialSeries?: ReportFinancialDay[];
  appointments?: ReportAttendance;
  appointmentSeries?: ({ date: string } & ReportAttendance)[];
  services?: { items: ReportService[]; total: number; serviceValueCents: number };
  topServices?: ReportService[];
  professionals?: { items: ReportProfessional[]; total: number };
  catalog?: {
    professionals: { id: string; name: string; active: number }[];
    services: { id: string; name: string; active: number }[];
    truncated: boolean;
  };
};
