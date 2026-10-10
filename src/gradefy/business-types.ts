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
  };
}
