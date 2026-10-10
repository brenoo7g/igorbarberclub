export type PlanCode = 'individual' | 'team';
export interface Plan {
  code: PlanCode;
  name: string;
  priceCents: number;
  currency: 'BRL';
  billingInterval: 'month';
  trialDays: number;
  maxProfessionals: number | null;
}
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (userId: string) => `gradefy:onboarding:v1:${userId}`;
export interface PendingSelection {
  version: 1;
  planCode: PlanCode;
  nicheCode?: string;
  templateCode?: string;
}
export function readPendingSelection(userId: string, storage?: Store): PendingSelection | null {
  try {
    const draft = JSON.parse((storage || localStorage).getItem(key(userId)) || 'null');
    if (draft?.version !== 1 || !isPlanCode(draft.planCode)) {
      (storage || localStorage).removeItem(key(userId));
      return null;
    }
    return {
      version: 1,
      planCode: draft.planCode,
      ...(typeof draft.nicheCode === 'string' ? { nicheCode: draft.nicheCode } : {}),
      ...(typeof draft.templateCode === 'string' ? { templateCode: draft.templateCode } : {}),
    };
  } catch {
    return null;
  }
}
function saveSelection(userId: string, draft: PendingSelection, storage?: Store) {
  try {
    (storage || localStorage).setItem(key(userId), JSON.stringify(draft));
  } catch {
    throw new Error('Não foi possível guardar sua escolha neste navegador. Tente novamente.');
  }
}
export function savePendingNiche(userId: string, nicheCode: string, storage?: Store) {
  const draft = readPendingSelection(userId, storage);
  if (!draft) throw new Error('Escolha seu plano primeiro.');
  // A changed niche always drops the previous template, even a manipulated one.
  const { templateCode, ...rest } = draft;
  saveSelection(
    userId,
    {
      ...rest,
      nicheCode,
      ...(draft.nicheCode === nicheCode && templateCode ? { templateCode } : {}),
    },
    storage,
  );
}
export function savePendingTemplate(
  userId: string,
  nicheCode: string,
  templateCode: string,
  storage?: Store,
) {
  const draft = readPendingSelection(userId, storage);
  if (!draft || draft.nicheCode !== nicheCode) throw new Error('Escolha seu segmento primeiro.');
  saveSelection(userId, { ...draft, templateCode }, storage);
}
export const isPlanCode = (value: unknown): value is PlanCode =>
  value === 'individual' || value === 'team';
export function readPendingPlan(userId: string, storage?: Store): PlanCode | null {
  return readPendingSelection(userId, storage)?.planCode ?? null;
}
export function savePendingPlan(userId: string, code: PlanCode, storage?: Store) {
  if (!isPlanCode(code)) throw new Error('Escolha um plano disponível.');
  saveSelection(
    userId,
    { ...readPendingSelection(userId, storage), version: 1, planCode: code },
    storage,
  );
}
