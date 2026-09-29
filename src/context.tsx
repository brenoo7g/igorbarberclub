import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Config, User, Visitor } from './types';
import { api } from './lib';

interface AppContext {
  user: User | null;
  visitor: Visitor | null;
  setVisitor: (visitor: Visitor | null) => void;
  loading: boolean;
  config: Config | null;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  notify: (text: string) => void;
}
const Context = createContext<AppContext | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, updateUser] = useState<User | null>(null);
  const [visitor, updateVisitor] = useState<Visitor | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const revision = useRef(0);
  const setUser = useCallback((next: User | null) => {
    revision.current++;
    updateUser(next);
    channel.current?.postMessage('account-changed');
  }, []);
  const setVisitor = useCallback((next: Visitor | null) => {
    revision.current++;
    updateVisitor(next);
    channel.current?.postMessage('account-changed');
  }, []);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  useEffect(() => {
    let active = true;
    async function refreshUser() {
      const requestRevision = ++revision.current;
      try {
        const result = await api<{ user: User | null; visitor?: Visitor | null }>('/auth/me');
        if (active && requestRevision === revision.current) {
          updateUser(result.user);
          updateVisitor(result.visitor || null);
        }
      } catch {
        /* Preserve the current view during a temporary network failure. */
      }
    }
    Promise.allSettled([refreshUser(), api<Config>('/config').then(setConfig)]).finally(() => {
      if (active) setLoading(false);
    });
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('igor-account');
      channel.current.onmessage = () => void refreshUser();
    }
    const expired = () => {
      setUser(null);
      setVisitor(null);
      setToast('Sua sessão expirou. Entre novamente para continuar.');
    };
    window.addEventListener('focus', refreshUser);
    window.addEventListener('session-expired', expired);
    return () => {
      active = false;
      channel.current?.close();
      channel.current = null;
      window.removeEventListener('focus', refreshUser);
      window.removeEventListener('session-expired', expired);
    };
  }, [setUser, setVisitor]);
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
    setVisitor(null);
  }
  return (
    <Context.Provider
      value={{ user, visitor, setVisitor, loading, config, setUser, logout, notify }}
    >
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
