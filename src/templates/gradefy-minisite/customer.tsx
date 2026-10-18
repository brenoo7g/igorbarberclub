import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Eye,
  EyeOff,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useApp } from '../../context';
import { SiteLink, scopedPath, useSite } from '../../site-context';
import { errorMessage, formatDate, money, statusLabels } from '../../lib';
import type { Appointment, Service, User } from '../../types';
import { customerDestination, customerQuery } from './customer-navigation';
import { Hours } from './index';
import { Modal } from '../../components/UI';
import './customer.css';

export function MiniClientGate({ children }: { children: ReactNode }) {
  const { user, loading } = useApp();
  const { basePath } = useSite();
  const location = useLocation();
  if (loading)
    return (
      <div className="ms-client-loading" role="status">
        Verificando sua sessão de cliente…
      </div>
    );
  if (!user)
    return (
      <Navigate
        replace
        to={scopedPath(
          '/entrar' +
            customerQuery(
              location.search,
              location.pathname.includes('agendar') ? 'agendar' : 'reservas',
            ),
          basePath,
        )}
      />
    );
  return children;
}

function CustomerHeading({ children, description }: { children: ReactNode; description?: string }) {
  const { site } = useSite();
  const [failed, setFailed] = useState(false);
  return (
    <header className="ms-client-heading">
      {site.settings.logo_url && !failed ? (
        <img src={site.settings.logo_url} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="ms-client-monogram" aria-hidden="true">
          {site.company.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="ms-client-establishment">{site.company.name}</span>
      <h1 tabIndex={-1}>{children}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
function Notice({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return children ? (
    <div
      className={'ms-client-notice' + (success ? ' ms-client-success' : '')}
      role={success ? 'status' : 'alert'}
    >
      {children}
    </div>
  ) : null;
}
function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  return (
    <label className="ms-client-field">
      <span>{label}</span>
      <span className="ms-client-input">
        <input
          type={password && visible ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          maxLength={password ? 72 : 200}
        />
        {password && (
          <button
            type="button"
            aria-label={(visible ? 'Ocultar ' : 'Mostrar ') + label.toLowerCase()}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </span>
    </label>
  );
}

function CustomerAuth({ mode }: { mode: 'login' | 'register' | 'forgot' | 'reset' }) {
  const { user, setUser, api } = useApp();
  const { basePath } = useSite();
  const location = useLocation(),
    navigate = useNavigate();
  const query = customerQuery(location.search);
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [phone, setPhone] = useState('');
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const working = useRef(false);
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const invalidReset = mode === 'reset' && !/^[a-f0-9]{64}$/.test(token);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working.current) return;
    setError('');
    setMessage('');
    if (
      ['register', 'reset'].includes(mode) &&
      (password.length < 8 || new TextEncoder().encode(password).length > 72)
    ) {
      setError('Use uma senha com pelo menos 8 caracteres e no máximo 72 bytes.');
      return;
    }
    if (['register', 'reset'].includes(mode) && password !== confirmation) {
      setError('As senhas não coincidem.');
      return;
    }
    working.current = true;
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const result = await api<{ message: string }>('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email, destination: new URLSearchParams(query).get('destino') }),
        });
        setMessage(result.message);
      } else if (mode === 'reset') {
        await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token, password, confirmPassword: confirmation }),
        });
        setUser(null);
        navigate(scopedPath('/entrar' + query, basePath), {
          replace: true,
          state: { passwordReset: true },
        });
      } else {
        const result = await api<{ user: User }>('/auth/' + mode, {
          method: 'POST',
          body: JSON.stringify(
            mode === 'login'
              ? { email, password }
              : { name, email, phone, password, confirmPassword: confirmation },
          ),
        });
        setUser(result.user);
        navigate(scopedPath(customerDestination(query), basePath), { replace: true });
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  if (user && ['login', 'register'].includes(mode))
    return <Navigate replace to={scopedPath(customerDestination(query), basePath)} />;
  return (
    <div className="ms-client-auth">
      <section className="ms-client-card">
        <CustomerHeading
          description={
            mode === 'login'
              ? 'Entre como cliente para reservar seu horário.'
              : mode === 'register'
                ? 'Uma conta para acompanhar seus agendamentos.'
                : undefined
          }
        >
          {
            {
              login: 'Entrar ou criar conta',
              register: 'Criar minha conta',
              forgot: 'Esqueceu sua senha?',
              reset: 'Crie sua nova senha',
            }[mode]
          }
        </CustomerHeading>
        {location.state?.passwordReset && (
          <Notice success>Senha redefinida. Entre com sua nova senha.</Notice>
        )}
        <Notice>{error}</Notice>
        <Notice success>{message}</Notice>
        {invalidReset ? (
          <>
            <Notice>Este link é inválido ou expirou. Solicite um novo link de recuperação.</Notice>
            <SiteLink className="ms-client-button ms-client-primary" to={'/esqueci-senha' + query}>
              Solicitar novo link
            </SiteLink>
          </>
        ) : (
          <form className="ms-client-form" onSubmit={submit}>
            <fieldset disabled={busy}>
              {mode === 'register' && (
                <Field
                  label="Nome e sobrenome"
                  value={name}
                  onChange={setName}
                  autoComplete="name"
                />
              )}
              {mode !== 'reset' && (
                <Field
                  label="E-mail"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  autoComplete="email"
                />
              )}
              {mode === 'register' && (
                <Field
                  label="Telefone"
                  type="tel"
                  value={phone}
                  onChange={setPhone}
                  autoComplete="tel"
                />
              )}
              {mode !== 'forgot' && (
                <Field
                  label={mode === 'reset' ? 'Nova senha' : 'Senha'}
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              )}
              {['register', 'reset'].includes(mode) && (
                <Field
                  label="Confirmar senha"
                  type="password"
                  value={confirmation}
                  onChange={setConfirmation}
                  autoComplete="new-password"
                />
              )}
              {mode === 'login' && (
                <SiteLink className="ms-client-link" to={'/esqueci-senha' + query}>
                  Esqueci minha senha
                </SiteLink>
              )}
              <button
                className="ms-client-button ms-client-primary"
                type="submit"
                disabled={busy}
                aria-busy={busy}
              >
                {busy
                  ? 'Aguarde…'
                  : {
                      login: 'Entrar',
                      register: 'Criar conta',
                      forgot: 'Enviar link de recuperação',
                      reset: 'Redefinir senha',
                    }[mode]}
                <ArrowRight size={18} />
              </button>
            </fieldset>
          </form>
        )}
        <SiteLink
          className="ms-client-button"
          to={(mode === 'login' ? '/cadastro' : '/entrar') + query}
        >
          {mode === 'login' ? 'Criar minha conta' : 'Já tenho uma conta'}
        </SiteLink>
        <p className="ms-client-reassurance">
          <ShieldCheck size={17} />
          Seu acesso de cliente é separado do painel do estabelecimento.
        </p>
      </section>
    </div>
  );
}

function Services() {
  const { api } = useApp(),
    { site, preview } = useSite();
  const [items, setItems] = useState<Service[] | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setError('');
    api<Service[]>('/services', { signal: c.signal })
      .then((r) => {
        if (!c.signal.aborted) setItems(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [api, revision]);
  return (
    <section className="ms-client-page">
      <CustomerHeading description="Escolha como quer cuidar de você.">Serviços</CustomerHeading>
      <Notice>{error}</Notice>
      {error && (
        <button className="ms-client-button" onClick={() => setRevision((r) => r + 1)}>
          Tentar novamente
        </button>
      )}
      {!items && !error && <p role="status">Carregando serviços…</p>}
      <div className="ms-client-services">
        {items?.map((s) => (
          <article className="ms-client-card" key={s.id}>
            <div>
              <span className="ms-client-kicker">{s.category}</span>
              <h2>{s.name}</h2>
              {s.description && <p>{s.description}</p>}
              <span className="ms-client-meta">
                <Clock3 size={16} />
                {s.duration} min
              </span>
            </div>
            <strong>{money(s.price)}</strong>
            {!preview && site.settings.online_booking_enabled !== false && (
              <SiteLink
                className="ms-client-button ms-client-primary"
                to={'/agendar?servico=' + encodeURIComponent(s.id)}
              >
                Agendar horário
                <ArrowRight size={18} />
              </SiteLink>
            )}
          </article>
        ))}
      </div>
      {items?.length === 0 && <p>Nenhum serviço disponível no momento.</p>}
    </section>
  );
}

function BusinessHours() {
  const { site, preview } = useSite();
  const labels = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ];
  return (
    <section className="ms-client-page">
      <CustomerHeading description="Expediente geral do estabelecimento.">
        Horários de funcionamento
      </CustomerHeading>
      <Hours />
      {site.hours && (
        <div className="ms-client-card ms-client-week">
          {[1, 2, 3, 4, 5, 6, 0].map((w) => {
            const day = site.hours?.days.find((d) => d.weekday === w);
            return (
              <div key={w}>
                <strong>{labels[w]}</strong>
                <span>{day?.active ? day.start_time + ' às ' + day.end_time : 'Fechado'}</span>
                {day?.active && day.breaks.length > 0 && (
                  <small>
                    Intervalos:{' '}
                    {day.breaks.map((b) => b.start_time + ' às ' + b.end_time).join(', ')}
                  </small>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p>Os horários disponíveis de cada profissional são consultados ao agendar.</p>
      {!preview && site.settings.online_booking_enabled !== false && (
        <SiteLink className="ms-client-button ms-client-primary" to="/agendar">
          Agendar horário
          <ArrowRight size={18} />
        </SiteLink>
      )}
    </section>
  );
}

function Reservations() {
  const { api, user, logout } = useApp();
  const { site } = useSite();
  const [items, setItems] = useState<Appointment[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [history, setHistory] = useState(false),
    [cancel, setCancel] = useState<Appointment | null>(null),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<Appointment | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    api<Appointment[]>('/appointments', { signal: c.signal })
      .then((r) => {
        if (!c.signal.aborted) setItems(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [api, user?.id, revision]);
  function close() {
    if (busy) return;
    setCancel(null);
    setDetail(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  const local = new Intl.DateTimeFormat('sv-SE', {
    timeZone: site.company.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date())
    .replace(' ', 'T');
  const upcoming = (a: Appointment) => a.status === 'confirmed' && a.date + 'T' + a.time > local;
  const visible = items.filter((a) => (history ? !upcoming(a) : upcoming(a)));
  async function confirmCancel() {
    if (!cancel || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/appointments/' + encodeURIComponent(cancel.id) + '/cancel', { method: 'PATCH' });
      setCancel(null);
      setRevision((r) => r + 1);
      requestAnimationFrame(() =>
        document.querySelector<HTMLHeadingElement>('.ms-client-page h1')?.focus(),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ms-client-page">
      <CustomerHeading
        description={user ? `Olá, ${user.name.split(' ')[0]}. Acompanhe seus horários.` : undefined}
      >
        Minhas reservas
      </CustomerHeading>
      <div className="ms-client-toolbar">
        <SiteLink className="ms-client-button ms-client-primary" to="/agendar">
          Novo agendamento
        </SiteLink>
        <SiteLink className="ms-client-button" to="/minha-conta/perfil">
          Dados da conta
        </SiteLink>
        <button
          className="ms-client-button"
          onClick={() => void logout().catch((e) => setError(errorMessage(e)))}
        >
          <LogOut size={17} />
          Sair da conta
        </button>
      </div>
      <div className="ms-client-tabs" aria-label="Período das reservas">
        <button aria-pressed={!history} onClick={() => setHistory(false)}>
          Próximos horários
        </button>
        <button aria-pressed={history} onClick={() => setHistory(true)}>
          Histórico
        </button>
      </div>
      <Notice>{error}</Notice>
      {error && (
        <button className="ms-client-button" onClick={() => setRevision((r) => r + 1)}>
          Tentar novamente
        </button>
      )}
      {loading ? (
        <p role="status">Carregando reservas…</p>
      ) : !visible.length ? (
        <div className="ms-client-card ms-client-empty">
          <CalendarDays size={32} />
          <h2>{history ? 'Nenhum atendimento anterior' : 'Nenhuma reserva futura'}</h2>
          <p>Seus agendamentos neste estabelecimento aparecem aqui.</p>
        </div>
      ) : (
        <div className="ms-client-reservations">
          {visible.map((a) => (
            <article className="ms-client-card ms-reservation-card" key={a.id}>
              <span className={'ms-client-status ms-client-status-' + a.status}>
                {statusLabels[a.status]}
              </span>
              <h2>{a.services.map((s) => s.name).join(' + ')}</h2>
              <p className="ms-client-meta">
                <CalendarDays size={17} />
                {formatDate(a.date)}
                <Clock3 size={17} />
                {a.time}
              </p>
              <p className="ms-client-meta">
                <UserRound size={17} />
                {a.barber_name}
              </p>
              <strong>{money(a.total)}</strong>
              <div className="ms-client-toolbar">
                <button
                  className="ms-client-button"
                  onClick={(e) => {
                    trigger.current = e.currentTarget;
                    setDetail(a);
                  }}
                >
                  Ver detalhes
                </button>
                {!history && (
                  <>
                    <SiteLink
                      className="ms-client-button"
                      to={'/agendar?remarcar=' + encodeURIComponent(a.id)}
                    >
                      Remarcar
                    </SiteLink>
                    <button
                      className="ms-client-button ms-client-danger"
                      onClick={(e) => {
                        trigger.current = e.currentTarget;
                        setCancel(a);
                      }}
                    >
                      Cancelar horário
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {(cancel || detail) && (
        <Modal
          className="ms-client-dialog"
          title={cancel ? 'Cancelar este horário?' : 'Detalhes da reserva'}
          onClose={close}
        >
          <div>
            <p>{(cancel || detail)!.services.map((s) => s.name).join(' + ')}</p>
            <p>
              {formatDate((cancel || detail)!.date)} às {(cancel || detail)!.time} ·{' '}
              {(cancel || detail)!.barber_name}
            </p>
            <strong>{money((cancel || detail)!.total)}</strong>
            <Notice>{error}</Notice>
            {cancel && (
              <button
                className="ms-client-button ms-client-danger"
                disabled={busy}
                onClick={() => void confirmCancel()}
              >
                {busy ? 'Cancelando…' : 'Sim, cancelar'}
              </button>
            )}
            <button className="ms-client-button" disabled={busy} onClick={close}>
              {cancel ? 'Manter horário' : 'Fechar'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function CustomerProfile() {
  const { user, setUser, api } = useApp();
  const [name, setName] = useState(user?.name || ''),
    [email, setEmail] = useState(user?.email || ''),
    [phone, setPhone] = useState(user?.phone || ''),
    [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const result = await api<{ user: User }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          email,
          phone,
          avatar: user.avatar,
          profileVersion: user.profileVersion,
          ...(email !== user.email ? { currentPassword: password } : {}),
        }),
      });
      setUser(result.user);
      setSaved('Dados atualizados.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ms-client-auth">
      <section className="ms-client-card">
        <CustomerHeading>Dados da conta</CustomerHeading>
        <Notice>{error}</Notice>
        <Notice success>{saved}</Notice>
        <form className="ms-client-form" onSubmit={save}>
          <fieldset disabled={busy}>
            <Field label="Nome e sobrenome" value={name} onChange={setName} autoComplete="name" />
            <Field
              label="E-mail"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
            <Field
              label="Telefone"
              type="tel"
              value={phone}
              onChange={setPhone}
              autoComplete="tel"
            />
            {email !== user?.email && (
              <Field
                label="Senha atual"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
            )}
            <button className="ms-client-button ms-client-primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar dados'}
            </button>
          </fieldset>
        </form>
        <SiteLink className="ms-client-link" to="/esqueci-senha?destino=reservas">
          Redefinir minha senha
        </SiteLink>
        <SiteLink className="ms-client-button" to="/minha-conta">
          Voltar para Minhas reservas
        </SiteLink>
      </section>
    </div>
  );
}

export default function MiniCustomerPage({
  kind,
}: {
  kind:
    'login' | 'register' | 'forgot' | 'reset' | 'services' | 'hours' | 'reservations' | 'profile';
}) {
  if (kind === 'services') return <Services />;
  if (kind === 'hours') return <BusinessHours />;
  if (kind === 'reservations')
    return (
      <MiniClientGate>
        <Reservations />
      </MiniClientGate>
    );
  if (kind === 'profile')
    return (
      <MiniClientGate>
        <CustomerProfile />
      </MiniClientGate>
    );
  return <CustomerAuth key={kind} mode={kind} />;
}
