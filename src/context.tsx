import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Config, User } from './types';
import { api } from './lib';

interface AppContext {
  user: User | null;
  loading: boolean;
  config: Config | null;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  notify: (text: string) => void;
}
const Context = createContext<AppContext | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  useEffect(() => {
    Promise.allSettled([
      api<{ user: User | null }>('/auth/me').then((r) => setUser(r.user)),
      api<Config>('/config').then(setConfig),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const notify = useCallback((text: string) => setToast(text), []);
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }
  return (
    <Context.Provider value={{ user, loading, config, setUser, logout, notify }}>
      {children}
      {toast && (
        <div role="status" className="toast">
          <span className="status-dot" />
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast('')}>
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('AppProvider necessário');
  return value;
}
