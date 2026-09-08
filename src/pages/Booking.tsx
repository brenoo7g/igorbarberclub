import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Scissors,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useApp } from '../context';
import { addDays, api, ApiError, errorMessage, formatDate, money, today } from '../lib';
import type { Appointment, Barber, Service } from '../types';
import { EmptyState, ErrorBox, Eyebrow, Spinner } from '../components/UI';
import { AuthForm } from '../components/AuthForm';

export default function Booking() {
  const [params] = useSearchParams();
  const reschedule = params.get('remarcar');
  const [step, setStep] = useState(0);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [selected, setSelected] = useState<string[]>(
    params.get('servico') ? [params.get('servico')!] : [],
  );
  const [barber, setBarber] = useState('');
  const [date, setDate] = useState(today());
  const [week, setWeek] = useState(today());
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [slotError, setSlotError] = useState('');
  const [reload, setReload] = useState(0);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [confirmed, setConfirmed] = useState<Appointment | null>(null);
  const { user, config } = useApp();
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      api<Service[]>('/services'),
      api<Barber[]>('/barbers'),
      reschedule ? api<Appointment[]>('/appointments') : Promise.resolve([]),
    ])
      .then(([s, b, appointments]) => {
        if (!alive) return;
        setServices(s);
        setBarbers(b);
        setBarber(b[0]?.id || '');
        if (reschedule) {
          const a = appointments.find((x) => x.id === reschedule);
          if (!a || a.status !== 'confirmed')
            throw new Error('Agendamento indisponível para remarcação.');
          setSelected(
            a.services
              .filter((item) => s.some((service) => service.id === item.service_id))
              .map((item) => item.service_id),
          );
          setBarber(a.barber_id);
          setStep(1);
        } else
          setSelected((previous) =>
            previous.filter((id) => s.some((service) => service.id === id)),
          );
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reschedule, catalogRetry]);
  const selectedKey = selected.join(',');
  useEffect(() => {
    setTime('');
    setSlots([]);
    setSlotError('');
    if (!barber || !selectedKey) return;
    const controller = new AbortController();
    setSlotsLoading(true);
    const query = new URLSearchParams({
      date,
      barberId: barber,
      services: selectedKey,
      ...(reschedule ? { except: reschedule } : {}),
    });
    api<{ slots: string[] }>(`/availability?${query}`, { signal: controller.signal })
      .then((r) => setSlots(r.slots))
      .catch((e) => {
        if (e.name !== 'AbortError') setSlotError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [barber, date, selectedKey, reschedule, reload]);
  const chosen = services.filter((s) => selected.includes(s.id));
  const duration = chosen.reduce((n, s) => n + s.duration, 0);
  const total = chosen.reduce((n, s) => n + s.price, 0);
  const changeStep = (value: number) => {
    setStep(value);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const a = await api<Appointment>(
        reschedule ? `/appointments/${reschedule}/reschedule` : '/appointments',
        {
          method: reschedule ? 'PATCH' : 'POST',
          body: JSON.stringify({
            services: selected,
            barberId: barber,
            date,
            time,
            expectedTotal: total,
            expectedDuration: duration,
          }),
        },
      );
      setConfirmed(a);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        setStep(1);
        setReload((r) => r + 1);
      }
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Spinner />;
  if (confirmed)
    return (
      <div className="container success-page">
        <div className="success-icon">
          <CheckCheck size={35} />
        </div>
        <Eyebrow>TUDO CERTO POR AQUI</Eyebrow>
        <h1>{reschedule ? 'Novo horário. Mesmo estilo.' : 'Seu horário está na régua.'}</h1>
        <p>Te esperamos, {user?.name.split(' ')[0]}. Agora é só chegar e deixar com a gente.</p>
        <div className="confirmation-card">
          <div className="confirmation-top">
            <span>AGENDAMENTO {confirmed.id.slice(0, 8).toUpperCase()}</span>
            <span className="status confirmed">
              <span />
              Confirmado
            </span>
          </div>
          <h2>{confirmed.services.map((s) => s.name).join(' + ')}</h2>
          <div className="confirmation-details">
            <span>
              <CalendarDays size={18} />
              {formatDate(confirmed.date, { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <span>
              <Clock3 size={18} />
              {confirmed.time} · {confirmed.end_minute - confirmed.start_minute} minutos
            </span>
            <span>
              <UserRound size={18} />
              {confirmed.barber_name}
            </span>
            <span>
              <MapPin size={18} />
              Campo Grande, Rio de Janeiro
            </span>
          </div>
          <div className="summary-total">
            <span>Pagamento na barbearia</span>
            <strong>{money(confirmed.total)}</strong>
          </div>
        </div>
        <p className="confirmation-note">
          {config?.notifications.email || config?.notifications.whatsapp
            ? 'A confirmação será enviada pelos canais disponíveis. Você também pode consultar tudo na sua conta.'
            : 'Seu agendamento está salvo. Consulte os detalhes, cancele ou remarque pela sua conta.'}
        </p>
        <Link className="button primary large" to="/minha-conta">
          Ver meus agendamentos
          <ArrowRight size={18} />
        </Link>
        <Link className="text-link" to="/">
          Voltar ao início
        </Link>
      </div>
    );
  return (
    <div className="container booking-page">
      <Link to={reschedule ? '/minha-conta' : '/'} className="back-link">
        <ArrowLeft size={15} />
        {reschedule ? 'Meus agendamentos' : 'Voltar ao início'}
      </Link>
      <div className="booking-heading">
        <Eyebrow>RESERVE SEU MOMENTO</Eyebrow>
        <h1>
          {reschedule ? 'Vamos encontrar um novo horário.' : 'Seu próximo visual começa aqui.'}
        </h1>
        <p>Escolha seu serviço. Encontre seu horário. Deixe o resto com a gente.</p>
      </div>
      <ol className="booking-steps">
        {['Serviços', 'Profissional e horário', 'Confirmação'].map((label, i) => (
          <li
            key={label}
            className={i === step ? 'current' : i < step ? 'done' : ''}
            aria-current={i === step ? 'step' : undefined}
          >
            <span>{i < step ? <Check size={15} /> : `0${i + 1}`}</span>
            {label}
            <div />
          </li>
        ))}
      </ol>
      <ErrorBox message={error} />
      {error && !services.length && (
        <button className="button ghost" onClick={() => setCatalogRetry((r) => r + 1)}>
          Tentar novamente
        </button>
      )}
      <div className="booking-layout">
        <div className="booking-content">
          {step === 0 && (
            <>
              <div className="step-heading">
                <span>01</span>
                <div>
                  <h2>Como vamos cuidar do seu estilo?</h2>
                  <p>Você pode escolher mais de um serviço.</p>
                </div>
              </div>
              <div className="booking-service-list">
                {services.map((service) => (
                  <label
                    key={service.id}
                    className={`booking-service ${selected.includes(service.id) ? 'selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      value={service.id}
                      checked={selected.includes(service.id)}
                      onChange={() =>
                        setSelected((prev) =>
                          prev.includes(service.id)
                            ? prev.filter((id) => id !== service.id)
                            : [...prev, service.id],
                        )
                      }
                    />
                    <span className="custom-check">
                      {selected.includes(service.id) && <Check size={14} />}
                    </span>
                    <span className="booking-service-info">
                      <strong>{service.name}</strong>
                      <span>{service.description}</span>
                      <small>
                        <Clock3 size={12} />
                        {service.duration} minutos
                      </small>
                    </span>
                    <strong>{money(service.price)}</strong>
                  </label>
                ))}
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="step-heading">
                <span>02</span>
                <div>
                  <h2>Com quem e quando?</h2>
                  <p>Horários de Brasília · Disponibilidade em tempo real.</p>
                </div>
              </div>
              <h3 className="field-title">Escolha o profissional</h3>
              <div className="barber-options">
                {barbers.map((b) => (
                  <button
                    key={b.id}
                    className={`barber-option ${barber === b.id ? 'selected' : ''}`}
                    onClick={() => setBarber(b.id)}
                    aria-pressed={barber === b.id}
                  >
                    <span className="barber-avatar">
                      <Scissors size={24} />
                    </span>
                    <span>
                      <strong>{b.name}</strong>
                      <small>{b.specialty}</small>
                    </span>
                    <span className="radio-check">{barber === b.id && <Check size={13} />}</span>
                  </button>
                ))}
              </div>
              <div className="date-heading">
                <h3 className="field-title">Escolha o dia</h3>
                <label className="date-picker-label">
                  <CalendarDays size={16} />
                  <input
                    type="date"
                    aria-label="Escolher outra data"
                    min={today()}
                    max={addDays(today(), 90)}
                    value={date}
                    onChange={(e) => {
                      if (e.target.value) {
                        setDate(e.target.value);
                        setWeek(e.target.value);
                      }
                    }}
                  />
                </label>
              </div>
              <div className="week-label">
                <span>{formatDate(week, { month: 'long', year: 'numeric' })}</span>
                <div>
                  <button
                    aria-label="Semana anterior"
                    className="icon-button"
                    disabled={week <= today()}
                    onClick={() =>
                      setWeek(addDays(week, -7) < today() ? today() : addDays(week, -7))
                    }
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    aria-label="Próxima semana"
                    className="icon-button"
                    disabled={addDays(week, 7) > addDays(today(), 90)}
                    onClick={() => setWeek(addDays(week, 7))}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className="date-options">
                {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => (
                  <button
                    key={d}
                    disabled={
                      new Date(`${d}T12:00:00Z`).getUTCDay() === 0 || d > addDays(today(), 90)
                    }
                    className={date === d ? 'selected' : ''}
                    onClick={() => setDate(d)}
                    aria-pressed={date === d}
                    aria-label={formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}
                  >
                    <small>{formatDate(d, { weekday: 'short' }).replace('.', '')}</small>
                    <strong>{d.slice(8)}</strong>
                    <span>
                      {d === today() ? 'Hoje' : formatDate(d, { month: 'short' }).replace('.', '')}
                    </span>
                  </button>
                ))}
              </div>
              <h3 className="field-title">
                Horários disponíveis <span>{formatDate(date)}</span>
              </h3>
              <ErrorBox message={slotError} />
              {slotError && (
                <button className="text-link" onClick={() => setReload((r) => r + 1)}>
                  Tentar novamente
                </button>
              )}
              {slotsLoading ? (
                <Spinner />
              ) : slots.length ? (
                <div className="time-options">
                  {slots.map((t) => (
                    <button
                      key={t}
                      className={time === t ? 'selected' : ''}
                      onClick={() => setTime(t)}
                      aria-pressed={time === t}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : (
                !slotError && (
                  <EmptyState icon={<CalendarDays size={28} />} title="Agenda cheia por aqui">
                    Não há horários disponíveis para esses serviços neste dia. Escolha outra data.
                  </EmptyState>
                )
              )}
            </>
          )}
          {step === 2 && (
            <>
              <div className="step-heading">
                <span>03</span>
                <div>
                  <h2>Falta só confirmar.</h2>
                  <p>
                    {user
                      ? 'Confira seu resumo e confirme o agendamento.'
                      : 'Crie sua conta ou entre para guardar seu horário.'}
                  </p>
                </div>
              </div>
              {user ? (
                <div className="client-confirmation">
                  <div className="client-avatar">{user.name.charAt(0)}</div>
                  <div>
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                    <span>{user.phone}</span>
                  </div>
                  <ShieldCheck size={22} />
                </div>
              ) : (
                <AuthForm />
              )}
              <div className="booking-policy">
                <ShieldCheck size={22} />
                <div>
                  <strong>Seu horário, sem complicação.</strong>
                  <p>
                    O pagamento é feito na barbearia. Precisa mudar os planos? Cancele ou remarque
                    pela sua conta antes do horário reservado.
                  </p>
                </div>
              </div>
            </>
          )}
          <div className="step-actions">
            {step > 0 && (
              <button className="button ghost" onClick={() => changeStep(step - 1)} disabled={busy}>
                <ArrowLeft size={16} />
                Voltar
              </button>
            )}
            {step < 2 ? (
              <button
                className="button primary"
                disabled={!chosen.length || (step === 1 && (!time || slotsLoading))}
                onClick={() => changeStep(step + 1)}
              >
                Continuar
                <ArrowRight size={17} />
              </button>
            ) : (
              user && (
                <button
                  className="button primary"
                  disabled={busy || !time || !chosen.length}
                  onClick={confirm}
                >
                  {busy
                    ? 'Confirmando...'
                    : reschedule
                      ? 'Confirmar remarcação'
                      : 'Confirmar agendamento'}
                  <Check size={17} />
                </button>
              )
            )}
          </div>
        </div>
        <aside className="booking-summary">
          <div className="summary-heading">
            <Scissors size={19} />
            <h3>Seu momento no Club</h3>
          </div>
          {chosen.length ? (
            <div className="summary-services">
              {chosen.map((s) => (
                <div key={s.id}>
                  <span>
                    {s.name}
                    <small>{s.duration} min</small>
                  </span>
                  <strong>{money(s.price)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="summary-empty">Escolha os serviços para montar o seu momento.</p>
          )}
          <div className="summary-meta">
            <span>
              <UserRound size={16} />
              {barbers.find((b) => b.id === barber)?.name || 'Profissional a escolher'}
            </span>
            <span>
              <CalendarDays size={16} />
              {step > 0
                ? formatDate(date, { day: 'numeric', month: 'long', weekday: 'short' })
                : 'Escolha o melhor dia'}
            </span>
            <span>
              <Clock3 size={16} />
              {time || 'Horário a escolher'}
              {duration > 0 && ` · ${duration} min`}
            </span>
          </div>
          <div className="summary-total">
            <span>
              Total<strong className="summary-total-note">Pagamento na barbearia</strong>
            </span>
            <strong>{money(total)}</strong>
          </div>
          <p className="summary-footer">
            <ShieldCheck size={14} />
            Seu estilo merece esse cuidado.
          </p>
        </aside>
      </div>
    </div>
  );
}
