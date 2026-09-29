import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock3, LogOut, Scissors, UserRound } from 'lucide-react';
import { useApp } from '../context';
import { api, errorMessage, formatDate, money } from '../lib';
import type { Appointment } from '../types';
import { AuthForm } from '../components/AuthForm';
import { Avatar } from '../components/Avatar';
import {
  EmptyState,
  ErrorBox,
  Eyebrow,
  Modal,
  PageHeading,
  Spinner,
  Status,
} from '../components/UI';

export default function Account() {
  const { user, visitor, loading, logout, notify } = useApp();
  const identity = user || visitor;
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('upcoming');
  const [cancel, setCancel] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(false);
  const [forget, setForget] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const requestVersion = useRef(0);
  const refresh = useCallback(() => {
    const version = ++requestVersion.current;
    setFetching(true);
    api<Appointment[]>('/appointments')
      .then((result) => {
        if (version === requestVersion.current) setAppointments(result);
      })
      .catch((e) => {
        if (version === requestVersion.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (version === requestVersion.current) setFetching(false);
      });
  }, []);
  useEffect(() => {
    setAppointments([]);
    setCancel(null);
    if (identity) refresh();
    return () => {
      requestVersion.current++;
    };
  }, [identity, refresh]);
  async function cancelBooking() {
    if (!cancel) return;
    setBusy(true);
    setError('');
    try {
      await api(`/appointments/${cancel.id}/cancel`, { method: 'PATCH' });
      setCancel(null);
      notify('Agendamento cancelado. Quando quiser, marque um novo momento.');
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Spinner />;
  if (!identity)
    return (
      <div className="container account-login">
        <div className="auth-intro">
          <Eyebrow>SEU ESPAÇO NO CLUB</Eyebrow>
          <h1>
            Seu estilo.
            <br />
            Sua agenda.
          </h1>
          <p>
            Entre na sua conta ou use o mesmo navegador em que reservou sem login para consultar
            seus horários.
          </p>
          <Link className="button primary" to="/agendar">
            Agendar sem criar conta
          </Link>
          <span className="auth-decoration">
            <Scissors size={95} strokeWidth={1} />
          </span>
        </div>
        <div className="auth-panel">
          <h2>Bem-vindo ao Club.</h2>
          <AuthForm />
        </div>
      </div>
    );
  const upcoming = appointments.filter(
    (a) => a.status === 'confirmed' && new Date(`${a.date}T${a.time}:00-03:00`) > new Date(),
  );
  const visible =
    tab === 'upcoming'
      ? upcoming
      : [...appointments].filter((a) => !upcoming.some((u) => u.id === a.id)).reverse();
  return (
    <div className="container account-page">
      <PageHeading
        eyebrow="MEUS AGENDAMENTOS"
        title={`Chega junto, ${identity.name.split(' ')[0]}.`}
      >
        <button
          className="button ghost"
          onClick={() =>
            user ? logout().catch((e) => setError(errorMessage(e))) : setForget(true)
          }
        >
          <LogOut size={16} />
          {user ? 'Sair' : 'Esquecer este dispositivo'}
        </button>
      </PageHeading>
      {!user && (
        <p className="form-note">
          Acesso sem conta salvo neste navegador por 90 dias de inatividade. Se limpar os dados do
          navegador ou usar outro aparelho, fale com a barbearia para gerenciar as reservas feitas
          aqui.
        </p>
      )}
      {!user && (
        <button className="text-link" onClick={() => setSignIn(true)}>
          Entrar ou criar conta
        </button>
      )}
      <div className="account-profile">
        <Avatar name={identity.name} avatar={user?.avatar || null} />
        <div>
          <strong>{identity.name}</strong>
          <p>
            {identity.email} · {identity.phone}
          </p>
        </div>
        {user && (
          <Link className="text-link" to="/minha-conta/perfil">
            Editar perfil
          </Link>
        )}
        {user?.role === 'admin' && (
          <Link className="text-link" to="/admin">
            Painel administrativo
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
      <div className="account-section-heading">
        <div className="filter-tabs">
          <button
            className={tab === 'upcoming' ? 'selected' : ''}
            onClick={() => setTab('upcoming')}
          >
            Próximos horários <span>{upcoming.length}</span>
          </button>
          <button className={tab === 'history' ? 'selected' : ''} onClick={() => setTab('history')}>
            Histórico
          </button>
        </div>
        <Link className="button primary" to="/agendar">
          Novo agendamento
          <ArrowRight size={17} />
        </Link>
      </div>
      <ErrorBox message={error} />
      {fetching ? (
        <Spinner />
      ) : visible.length ? (
        <div className="appointment-cards">
          {visible.map((a) => (
            <article className="appointment-card" key={a.id}>
              <div className="appointment-date">
                <strong>{a.date.slice(8)}</strong>
                <span>{formatDate(a.date, { month: 'short' })}</span>
                <small>{a.date.slice(0, 4)}</small>
              </div>
              <div className="appointment-info">
                <Status status={a.status} />
                <h3>{a.services.map((s) => s.name).join(' + ')}</h3>
                <p>
                  <Clock3 size={14} />
                  {a.time}
                  <span>·</span>
                  <UserRound size={14} />
                  {a.barber_name}
                </p>
                <strong>{money(a.total)}</strong>
              </div>
              {tab === 'upcoming' && (
                <div className="appointment-actions">
                  <Link className="button ghost" to={`/agendar?remarcar=${a.id}`}>
                    Remarcar
                  </Link>
                  <button
                    className="text-button danger-text"
                    onClick={() => {
                      setError('');
                      setCancel(a);
                    }}
                  >
                    Cancelar horário
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarDays size={32} />}
          title={
            tab === 'upcoming' ? 'Seu próximo estilo está esperando.' : 'Sua história começa aqui.'
          }
        >
          {tab === 'upcoming'
            ? 'Você ainda não tem horários futuros. Escolha um serviço e reserve seu momento.'
            : 'Seus atendimentos anteriores aparecerão aqui.'}
        </EmptyState>
      )}
      {forget && (
        <Modal
          title="Esquecer este dispositivo?"
          onClose={() => {
            if (!busy) setForget(false);
          }}
        >
          <p>
            Isso não cancela seus agendamentos. Você perderá o acesso ao histórico e aos contatos
            salvos neste navegador. Para gerenciar suas reservas depois, entre em contato com a
            barbearia.
          </p>
          <ErrorBox message={error} />
          <div className="modal-actions">
            <button className="button ghost" disabled={busy} onClick={() => setForget(false)}>
              Manter acesso
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await logout();
                  setForget(false);
                } catch (error) {
                  setError(errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Aguarde...' : 'Sim, esquecer dispositivo'}
            </button>
          </div>
        </Modal>
      )}
      {signIn && (
        <Modal title="Entrar ou criar conta" onClose={() => setSignIn(false)}>
          <AuthForm onSuccess={() => setSignIn(false)} />
        </Modal>
      )}
      {cancel && (
        <Modal
          title="Cancelar este horário?"
          onClose={() => {
            if (!busy) setCancel(null);
          }}
        >
          <p className="muted">
            {cancel.services.map((s) => s.name).join(' + ')} em {formatDate(cancel.date)}, às{' '}
            {cancel.time}. O horário ficará disponível para outra pessoa.
          </p>
          <ErrorBox message={error} />
          <div className="modal-actions">
            <button className="button ghost" disabled={busy} onClick={() => setCancel(null)}>
              Manter horário
            </button>
            <button className="button danger" disabled={busy} onClick={cancelBooking}>
              {busy ? 'Cancelando...' : 'Sim, cancelar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
