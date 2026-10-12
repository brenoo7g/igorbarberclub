export type FinancialBalance = {
  totalCents: number;
  receivedCents: number;
  remainingCents: number;
  canReceive: boolean;
};
export type PaymentRecord = {
  id: string;
  appointment_id: string;
  amount_cents: number;
  received_at: string;
  method: string;
  notes: string;
  created_by: string;
  created_by_name: string;
  reversal_id: string | null;
  reversal_reason: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reversed_by_name: string | null;
};
export type PaymentDetail = FinancialBalance & {
  appointment: {
    id: string;
    date: string;
    total: number;
    status: string;
    client_name: string;
    professional_name: string;
  };
  editable: boolean;
  timezone: string;
  localNow: string;
  items: PaymentRecord[];
  total: number;
  page: number;
  pageSize: number;
};
export type FinancialEntry = {
  id: string;
  type: 'payment' | 'payment-reversal' | 'expense' | 'expense-reversal';
  description: string;
  appointment_id: string | null;
  amount_cents: number;
  date: string;
  occurred_at: string;
  status: string;
  method: string | null;
  version: number | null;
  category: string | null;
};
export type FinanceState = {
  company: { id: string; name: string; timezone: string };
  editable: boolean;
  today: string;
  localNow: string;
  from: string;
  to: string;
  page: number;
  total: number;
  items: FinancialEntry[];
  metrics: {
    expectedCents: number;
    completedCents: number;
    receivedCents: number;
    paidExpensesCents: number;
    balanceCents: number;
  };
};
export type ExpenseRecord = {
  id: string;
  description: string;
  category: string;
  amount_cents: number;
  date: string;
  status: 'pending' | 'paid' | 'void';
  paid_at: string | null;
  paid_date: string | null;
  notes: string;
  version: number;
};
export type ExpenseDetail = {
  expense: ExpenseRecord;
  events: {
    id: string;
    action: string;
    created_by: string;
    actor_name: string;
    created_at: string;
    reason: string;
    before_json: string | null;
    after_json: string;
  }[];
  total: number;
  page: number;
  pageSize: number;
  editable: boolean;
  localNow: string;
  timezone: string;
};
