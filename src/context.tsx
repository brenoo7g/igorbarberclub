import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Config, User, Visitor } from './types';
import { ApiError, api as request, errorMessage } from './lib';
import { useOptionalSite } from './site-context';

interface AppContext {
  api: typeof request;
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
export function AppProvider({
  children,
  api: override,
  loadConfig = true,
  sessionScope: explicitScope,
}: {
  children: ReactNode;
  api?: typeof request;
  loadConfig?: boolean;
  sessionScope?: string;
}) {
  const site = useOptionalSite();
  const api = override || site?.api || request;
  const sessionScope =
    explicitScope ||
    'public:' +
      (site?.basePath && !site.preview
        ? `/api/public/${encodeURIComponent(site.site.company.slug)}`
        : '/api');
  const [user, updateUser] = useState<User | null>(null);
  const customerScope = sessionScope.startsWith('client:');
  const [visitor, updateVisitor] = useState<Visitor | null>(null);
  const identity = useRef({ user, visitor });
  identity.current = { user, visitor };
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
  const [sessionError, setSessionError] = useState('');
  const [sessionRevision, setSessionRevision] = useState(0);
  const [toast, setToast] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSessionError('');
    let checking: Promise<void> | null = null;
    let lastUnauthorizedCheck = -Infinity;
    let delayedCheck: ReturnType<typeof setTimeout> | undefined;
    function refreshUser() {
      if (checking) return checking;
      const requestRevision = ++revision.current;
      checking = (async () => {
        try {
          const result = await api<{ user: User | null; visitor?: Visitor | null }>('/auth/me');
          if (active && requestRevision === revision.current) {
            setSessionError('');
            if (
              !result.user &&
              !result.visitor &&
              (identity.current.user || identity.current.visitor)
            )
              setToast('Sua sessão expirou. Entre novamente para continuar.');
            updateUser(result.user);
            updateVisitor(result.visitor || null);
          }
        } catch (error) {
          if (!active || requestRevision !== revision.current) return;
          if (error instanceof ApiError && error.status === 401) {
            setSessionError('');
            updateUser(null);
            updateVisitor(null);
            setToast('Sua sessão expirou. Entre novamente para continuar.');
          } else if (
            !identity.current.user &&
            !identity.current.visitor &&
            (sessionScope === 'gradefy' || customerScope)
          )
            setSessionError(errorMessage(error));
          else if (!loadConfig) setToast(errorMessage(error));
        } finally {
          checking = null;
        }
      })();
      return checking;
    }
    Promise.allSettled([
      refreshUser(),
      ...(loadConfig ? [api<Config>('/config').then(setConfig)] : []),
    ]).finally(() => {
      if (active) setLoading(false);
    });
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel(
        customerScope ? 'gradefy-client-account' : 'igor-account',
      );
      channel.current.onmessage = () => {
        revision.current++;
        if (checking)
          void checking.then(() => {
            if (active) void refreshUser();
          });
        else void refreshUser();
      };
    }
    const checkSession = (event: Event) => {
      if ((event as CustomEvent<{ scope: string }>).detail?.scope !== sessionScope) return;
      // Concurrent failures share a single canonical request; a burst must not
      // produce a retry storm. Failed business writes are never replayed here.
      const remaining = 1000 - (performance.now() - lastUnauthorizedCheck);
      if (remaining > 0) {
        if (!delayedCheck)
          delayedCheck = setTimeout(() => {
            delayedCheck = undefined;
            lastUnauthorizedCheck = performance.now();
            if (active) void refreshUser();
          }, remaining);
        return;
      }
      lastUnauthorizedCheck = performance.now();
      void refreshUser();
    };
    window.addEventListener('focus', refreshUser);
    window.addEventListener('session-check', checkSession);
    return () => {
      active = false;
      clearTimeout(delayedCheck);
      channel.current?.close();
      channel.current = null;
      window.removeEventListener('focus', refreshUser);
      window.removeEventListener('session-check', checkSession);
    };
  }, [setUser, setVisitor, api, loadConfig, sessionScope, sessionRevision]);
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
      value={{ api, user, visitor, setVisitor, loading, config, setUser, logout, notify }}
    >
      {!loading && sessionError && !user && (sessionScope === 'gradefy' || customerScope) ? (
        <div className={customerScope ? 'ms-client-boundary' : 'gf-ready'}>
          <div className={customerScope ? 'ms-panel' : 'gf-card'}>
            <h1>Não foi possível verificar sua sessão</h1>
            <p role="alert">{sessionError}</p>
            <button
              className={
                customerScope ? 'ms-client-button ms-client-primary' : 'gf-button gf-primary'
              }
              onClick={() => setSessionRevision((n) => n + 1)}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      ) : (
        children
      )}
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
