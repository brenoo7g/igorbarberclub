import { useEffect, useState } from 'react';
import { useApp } from '../context';
import { errorMessage } from '../lib';
import type { PendingBusiness } from './business-types';
export type Company = { id: string; name: string; role: string };
// Read-only membership lookup shared by the account and onboarding gates.
export function useCompanies() {
  const { user, api } = useApp();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [business, setBusiness] = useState<PendingBusiness | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setCompanies(null);
    setError('');
    Promise.all([
      api<Company[]>('/companies'),
      api<{ company: PendingBusiness | null }>('/onboarding/business'),
    ])
      .then(([value, pending]) => {
        if (active) {
          setCompanies(value);
          setBusiness(pending.company);
          setResolvedUserId(user.id);
        }
      })
      .catch((failure) => {
        if (active) {
          setError(errorMessage(failure));
          setResolvedUserId(user.id);
        }
      });
    return () => {
      active = false;
    };
  }, [user?.id, api, revision]);
  return {
    companies: resolvedUserId === user?.id ? companies : null,
    business: resolvedUserId === user?.id ? business : null,
    error: resolvedUserId === user?.id ? error : '',
    retry: () => setRevision((value) => value + 1),
  };
}
