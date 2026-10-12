import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  RefreshCw,
  UserRound,
  CheckCheck,
} from 'lucide-react';
import { useApp } from '../context';
import { addDays, ApiError, errorMessage, money, newIdempotencyKey, statusLabels } from '../lib';
import { Modal } from '../components/UI';
import { Button, ButtonLink, Card, Feedback, Input, Loading } from './components';
import { CompanySelector, ManagementAccess } from './management';
import type { ManagementProps } from './management';
import type { AgendaCatalog, AgendaDetail, AgendaState } from './agenda-types';
import { BusinessNav } from './business-nav';
import { PaymentPanel } from './finance-payment';
import './dashboard.css';
import './agenda.css';

export const agendaDateLabel = (date: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00Z'));
const monday = (date: string) => addDays(date, -((new Date(date + 'T12:00Z').getUTCDay() + 6) % 7));
export default function Agenda() {
  return <ManagementAccess>{(props) => <AgendaContent {...props} />}</ManagementAccess>;
}
function AgendaContent({ companyId, companies, choose }: ManagementProps) {
  const { api } = useApp(),
    [query, setQuery] = useSearchParams();
  const [data, setData] = useState<AgendaState | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [notice, setNotice] = useState('');
  const [date, setDate] = useState(''),
    [view, setView] = useState<'day' | 'week'>('day'),
    [professional, setProfessional] = useState(query.get('professionalId') || ''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [detailId, setDetailId] = useState(query.get('atendimento') || ''),
    [create, setCreate] = useState(query.get('novo') === '1'),
    [reschedule, setReschedule] = useState<AgendaDetail | null>(null);
  const dashboard = '/app/dashboard?empresa=' + encodeURIComponent(companyId);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError('');
    const params = new URLSearchParams({ view, page: String(page) });
    if (date) params.set('from', date);
    if (professional) params.set('professionalId', professional);
    if (status) params.set('status', status);
    api<AgendaState>('/admin/agenda?' + params, {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted) {
          setData(next);
          const lastPage = Math.max(1, Math.ceil(next.total / next.pageSize));
          if (next.page > lastPage) setPage(lastPage);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [api, companyId, date, view, professional, status, page, revision]);
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1),
      timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  function close() {
    setDetailId('');
    setCreate(false);
    setReschedule(null);
    setQuery({ empresa: companyId }, { replace: true });
  }
  function changed(message: string) {
    close();
    setNotice(message);
    setRevision((n) => n + 1);
    window.dispatchEvent(new Event('gradefy-agenda-changed'));
  }
  function changeDate(value: string) {
    setDate(value);
    setPage(1);
  }
  return (
    <div className="gf-dashboard gf-agenda">
      <BusinessNav companyId={companyId} />
      <div className="gf-dashboard-main" aria-busy={busy}>
        <div className="gf-agenda-heading">
          <div>
            <div className="gf-kicker">SEU TEMPO BEM CUIDADO</div>
            <h1>Minha agenda</h1>
            <p>{data?.company.name || companies.find((c) => c.id === companyId)?.name}</p>
          </div>
          <Button disabled={busy || !data?.editable} onClick={() => setCreate(true)}>
            <Plus size={18} />
            Novo agendamento
          </Button>
        </div>
        {companies.length > 1 && (
          <CompanySelector companies={companies} value={companyId} choose={choose} />
        )}
        <Feedback>{error}</Feedback>
        <Feedback success>{notice}</Feedback>
        {!data ? (
          <Card>
            {busy ? (
              <Loading />
            ) : (
              <>
                <h2>Não foi possível carregar a agenda</h2>
                <Button onClick={() => setRevision((n) => n + 1)}>Tentar novamente</Button>
                <ButtonLink to={dashboard} variant="secondary">
                  Voltar ao painel
                </ButtonLink>
              </>
            )}
          </Card>
        ) : (
          <>
            {!data.editable && (
              <Feedback>
                A agenda está disponível para consulta. A assinatura atual não permite alterações.
              </Feedback>
            )}
            <Card className="gf-agenda-toolbar">
              <div className="gf-agenda-navigation">
                <div className="gf-agenda-views" role="group" aria-label="Visualização da agenda">
                  <button
                    aria-pressed={view === 'day'}
                    disabled={busy}
                    onClick={() => {
                      setView('day');
                      setPage(1);
                    }}
                  >
                    Dia
                  </button>
                  <button
                    aria-pressed={view === 'week'}
                    disabled={busy}
                    onClick={() => {
                      setView('week');
                      changeDate(monday(date || data.today));
                    }}
                  >
                    Semana
                  </button>
                </div>
                <div className="gf-agenda-date-nav">
                  <Button
                    variant="secondary"
                    aria-label="Período anterior"
                    disabled={busy}
                    onClick={() => changeDate(addDays(data.from, view === 'week' ? -7 : -1))}
                  >
                    <ChevronLeft size={18} />
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => changeDate(view === 'week' ? monday(data.today) : data.today)}
                  >
                    Hoje
                  </Button>
                  <Button
                    variant="secondary"
                    aria-label="Próximo período"
                    disabled={busy}
                    onClick={() => changeDate(addDays(data.from, view === 'week' ? 7 : 1))}
                  >
                    <ChevronRight size={18} />
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  aria-label="Atualizar agenda"
                  disabled={busy}
                  onClick={() => setRevision((n) => n + 1)}
                >
                  <RefreshCw size={17} />
                </Button>
              </div>
              <div className="gf-agenda-filters">
                <div className="gf-field">
                  <label htmlFor="agenda-date">Data da agenda</label>
                  <input
                    id="agenda-date"
                    type="date"
                    min="1900-01-01"
                    max="2199-12-25"
                    disabled={busy}
                    value={date || data.from}
                    onChange={(e) =>
                      changeDate(
                        view === 'week' && e.target.value ? monday(e.target.value) : e.target.value,
                      )
                    }
                  />
                </div>
                <div className="gf-field">
                  <label htmlFor="agenda-pro">Profissional</label>
                  <select
                    id="agenda-pro"
                    value={professional}
                    disabled={busy}
                    onChange={(e) => {
                      setProfessional(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">Todos os profissionais</option>
                    {data.professionals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {!p.active ? ' (inativo)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="gf-field">
                  <label htmlFor="agenda-status">Status</label>
                  <select
                    id="agenda-status"
                    disabled={busy}
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">Todos os status</option>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="gf-agenda-range">
                {agendaDateLabel(data.from)}
                {view === 'week' ? ' a ' + agendaDateLabel(data.to) : ''} · {data.total}{' '}
                {data.total === 1 ? 'atendimento' : 'atendimentos'} · {data.company.timezone}
              </p>
            </Card>
            {!data.items.length ? (
              <Card className="gf-dashboard-empty">
                <CalendarDays size={30} />
                <h2>Nenhum atendimento neste período</h2>
                <p>
                  Consulte outra data ou ajuste os filtros.
                  {data.editable ? ' Você também pode registrar um novo atendimento.' : ''}
                </p>
                {data.editable && (
                  <Button onClick={() => setCreate(true)}>
                    <Plus size={17} />
                    Novo agendamento
                  </Button>
                )}
              </Card>
            ) : (
              <div className="gf-agenda-days">
                {Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) =>
                  addDays(data.from, i),
                ).map((day) => {
                  const items = data.items.filter((a) => a.date === day);
                  if (!items.length) return null;
                  return (
                    <Card key={day} className="gf-agenda-day">
                      <div className="gf-dashboard-section-heading">
                        <h2>{agendaDateLabel(day)}</h2>
                        <CalendarDays size={20} />
                      </div>
                      <div className="gf-agenda-table-heading">
                        <span>Horário</span>
                        <span>Cliente e serviço</span>
                        <span>Profissional</span>
                        <span>Status</span>
                      </div>
                      {items.map((a) => (
                        <button
                          key={a.id}
                          className="gf-agenda-row"
                          aria-label={'Ver atendimento de ' + a.clientName + ' às ' + a.time}
                          onClick={() => setDetailId(a.id)}
                        >
                          <time dateTime={a.date + 'T' + a.time}>{a.time}</time>
                          <span className="gf-agenda-client">
                            <strong>{a.clientName}</strong>
                            <span>{a.services.map((s) => s.name).join(' + ')}</span>
                            <small>
                              <Clock3 size={12} />
                              {a.duration} min · {money(a.totalCents)}
                            </small>
                          </span>
                          <span className="gf-agenda-professional">
                            <UserRound size={13} />
                            {a.professionalName}
                          </span>
                          <span className={'gf-appointment-status gf-status-' + a.status}>
                            <i />
                            {statusLabels[a.status]}
                          </span>
                        </button>
                      ))}
                    </Card>
                  );
                })}
              </div>
            )}
            {data.total > data.pageSize && (
              <nav className="gf-dashboard-pagination" aria-label="Páginas da agenda">
                <Button
                  variant="secondary"
                  aria-label="Página anterior"
                  disabled={busy || page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span>
                  Página {page} de {Math.ceil(data.total / data.pageSize)}
                </span>
                <Button
                  variant="secondary"
                  aria-label="Próxima página"
                  disabled={busy || page * data.pageSize >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
      <BusinessNav companyId={companyId} mobile />
      {detailId && (
        <AppointmentDetails
          id={detailId}
          companyId={companyId}
          close={close}
          changed={changed}
          reschedule={(d) => {
            setDetailId('');
            setReschedule(d);
          }}
        />
      )}
      {(create || reschedule) && data && (
        <AppointmentForm
          companyId={companyId}
          today={data?.today || ''}
          original={reschedule}
          close={close}
          changed={changed}
        />
      )}
    </div>
  );
}
function AppointmentDetails({
  id,
  companyId,
  close,
  changed,
  reschedule,
}: {
  id: string;
  companyId: string;
  close: () => void;
  changed: (message: string) => void;
  reschedule: (d: AgendaDetail) => void;
}) {
  const { api } = useApp(),
    [detail, setDetail] = useState<AgendaDetail | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [revision, setRevision] = useState(0);
  const working = useRef(false),
    attempt = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    api<AgendaDetail>('/admin/agenda/' + encodeURIComponent(id), {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setDetail(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setDetail(null);
          setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [api, id, companyId, revision]);
  async function transition(status: 'completed' | 'cancelled') {
    if (!detail || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    const body = JSON.stringify({ status, expected: detail.expected });
    if (attempt.current?.payload !== body)
      attempt.current = { payload: body, key: newIdempotencyKey() };
    try {
      await api('/admin/agenda/' + encodeURIComponent(id) + '/status', {
        method: 'PATCH',
        headers: { 'X-Gradefy-Company-Id': companyId, 'Idempotency-Key': attempt.current.key },
        body,
      });
      changed(
        status === 'completed'
          ? 'Atendimento concluído. O valor permanece previsto; não foi registrado pagamento.'
          : 'Agendamento cancelado. O histórico foi preservado.',
      );
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && [400, 409].includes(e.status)) setConfirm(false);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="gf-agenda-modal">
      <Modal
        title="Detalhes do atendimento"
        onClose={() => {
          if (!working.current) close();
        }}
      >
        <Feedback>{error}</Feedback>
        {loading ? (
          <Loading />
        ) : detail ? (
          <>
            <div className="gf-agenda-detail-client">
              <UserRound />
              <div>
                <h3>{detail.item.client_name}</h3>
                {detail.item.client_id && (
                  <Link
                    to={
                      '/app/clientes?empresa=' +
                      encodeURIComponent(companyId) +
                      '&cliente=' +
                      encodeURIComponent(detail.item.client_id)
                    }
                  >
                    Ver cadastro e histórico do cliente
                  </Link>
                )}
                <p>
                  {detail.item.client_phone} · {detail.item.client_email}
                </p>
              </div>
            </div>
            <span className={'gf-appointment-status gf-status-' + detail.item.status}>
              <i />
              {statusLabels[detail.item.status]}
            </span>
            <dl className="gf-agenda-detail-grid">
              <div>
                <dt>Serviço</dt>
                <dd>{detail.item.services.map((s) => s.name).join(' + ')}</dd>
              </div>
              <div>
                <dt>Profissional</dt>
                <dd>{detail.item.barber_name}</dd>
              </div>
              <div>
                <dt>Data e horário</dt>
                <dd>
                  {agendaDateLabel(detail.item.date)} · {detail.item.time}
                </dd>
              </div>
              <div>
                <dt>Duração</dt>
                <dd>{detail.item.end_minute - detail.item.start_minute} minutos</dd>
              </div>
              <div>
                <dt>Valor previsto</dt>
                <dd>{money(detail.item.total)}</dd>
              </div>
              <div>
                <dt>Fuso horário</dt>
                <dd>{detail.timezone}</dd>
              </div>
            </dl>
            {detail.item.notes && (
              <div className="gf-agenda-notes">
                <h3>Observações</h3>
                <p>{detail.item.notes}</p>
              </div>
            )}
            <p className="gf-agenda-payment-note">
              Concluir atendimento não registra pagamento recebido.
            </p>
            <PaymentPanel companyId={companyId} appointmentId={id} />
            {confirm ? (
              <Card className="gf-agenda-confirm">
                <h3>Cancelar este agendamento?</h3>
                <p>
                  A notificação seguirá os canais já configurados. A reserva permanece no histórico.
                </p>
                <div className="gf-agenda-actions">
                  <Button disabled={busy} variant="secondary" onClick={() => setConfirm(false)}>
                    Manter agendamento
                  </Button>
                  <Button busy={busy} onClick={() => transition('cancelled')}>
                    Sim, cancelar
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="gf-agenda-actions">
                {detail.actions.reschedule && (
                  <Button disabled={busy} variant="secondary" onClick={() => reschedule(detail)}>
                    Reagendar
                  </Button>
                )}
                {detail.actions.cancel && (
                  <Button disabled={busy} variant="secondary" onClick={() => setConfirm(true)}>
                    Cancelar agendamento
                  </Button>
                )}
                {detail.actions.complete && (
                  <Button busy={busy} onClick={() => transition('completed')}>
                    <CheckCheck size={18} />
                    Concluir atendimento
                  </Button>
                )}
              </div>
            )}
            {
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => {
                  setConfirm(false);
                  setRevision((n) => n + 1);
                }}
              >
                Atualizar detalhes
              </Button>
            }
          </>
        ) : (
          <Button onClick={() => setRevision((n) => n + 1)}>Tentar novamente</Button>
        )}
      </Modal>
    </div>
  );
}
function AppointmentForm({
  companyId,
  today,
  original,
  close,
  changed,
}: {
  companyId: string;
  today: string;
  original: AgendaDetail | null;
  close: () => void;
  changed: (message: string) => void;
}) {
  const { api } = useApp(),
    [catalog, setCatalog] = useState<AgendaCatalog | null>(null),
    [error, setError] = useState(''),
    [catalogBusy, setCatalogBusy] = useState(true),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const [service, setService] = useState(''),
    [professional, setProfessional] = useState(original?.item.barber_id || ''),
    [date, setDate] = useState(original?.item.date || today),
    [time, setTime] = useState(''),
    [notes, setNotes] = useState(original?.item.notes || ''),
    [clientMode, setClientMode] = useState('new'),
    [userId, setUserId] = useState('');
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [phone, setPhone] = useState('');
  const [slots, setSlots] = useState<string[]>([]),
    [slotBusy, setSlotBusy] = useState(false),
    [slotMessage, setSlotMessage] = useState(''),
    [slotRevision, setSlotRevision] = useState(0);
  const working = useRef(false),
    attempt = useRef<{ payload: string; key: string } | null>(null);
  const ids = original ? original.item.services.map((s) => s.service_id).join(',') : service;
  useEffect(() => {
    const c = new AbortController();
    setCatalogBusy(true);
    api<AgendaCatalog>('/admin/agenda/catalog', {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setCatalog(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setCatalogBusy(false);
      });
    return () => c.abort();
  }, [api, companyId, revision]);
  useEffect(() => {
    const c = new AbortController();
    setSlots([]);
    setSlotMessage('');
    setTime('');
    if (!ids || !professional || !date) {
      setSlotBusy(false);
      return;
    }
    setSlotBusy(true);
    const params = new URLSearchParams({ services: ids, barberId: professional, date });
    if (original) params.set('except', original.item.id);
    api<{ slots: string[]; message: string | null }>('/admin/agenda/availability?' + params, {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) {
          setSlots(d.slots);
          setSlotMessage(
            d.message ||
              (!d.slots.length
                ? 'Não há horários disponíveis nesta data. Escolha outro dia ou profissional.'
                : ''),
          );
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setSlotMessage(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setSlotBusy(false);
      });
    return () => c.abort();
  }, [api, companyId, ids, professional, date, original, slotRevision]);
  const selected = catalog?.services.find((s) => s.id === service),
    duration = original
      ? original.item.end_minute - original.item.start_minute
      : selected?.duration,
    total = original ? original.item.total : selected?.price;
  const eligible =
    catalog?.professionals.filter((p) => ids.split(',').every((id) => p.services.includes(id))) ||
    [];
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (working.current || !time || !catalog?.editable) return;
    const body = JSON.stringify({
      services: ids.split(','),
      barberId: professional,
      date,
      time,
      notes,
      expectedTotal: total,
      expectedDuration: duration,
      ...(original
        ? { expected: original.expected }
        : clientMode === 'existing'
          ? { clientId: userId }
          : { guest: { name, email, phone } }),
    });
    if (attempt.current?.payload !== body)
      attempt.current = { payload: body, key: newIdempotencyKey() };
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await api(
        '/admin/agenda' +
          (original ? '/' + encodeURIComponent(original.item.id) + '/reschedule' : ''),
        {
          method: original ? 'PATCH' : 'POST',
          headers: { 'X-Gradefy-Company-Id': companyId, 'Idempotency-Key': attempt.current.key },
          body,
        },
      );
      changed(
        original ? 'Agendamento reagendado com sucesso.' : 'Agendamento registrado com sucesso.',
      );
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && [409, 412].includes(e.status)) {
        setSlotRevision((n) => n + 1);
        if (e.status === 412) setRevision((n) => n + 1);
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="gf-agenda-modal">
      <Modal
        title={original ? 'Reagendar atendimento' : 'Novo agendamento'}
        onClose={() => {
          if (!working.current) close();
        }}
      >
        <Feedback>{error}</Feedback>
        {catalogBusy ? (
          <Loading />
        ) : !catalog ? (
          <Button
            onClick={() => {
              setError('');
              setRevision((n) => n + 1);
            }}
          >
            Tentar novamente
          </Button>
        ) : !catalog.editable ? (
          <Feedback>A assinatura atual não permite registrar ou reagendar atendimentos.</Feedback>
        ) : (
          <form onSubmit={submit} className="gf-agenda-form">
            <fieldset disabled={busy}>
              {original ? (
                <div className="gf-agenda-original">
                  <strong>{original.item.client_name}</strong>
                  <p>
                    {original.item.services.map((s) => s.name).join(' + ')} ·{' '}
                    {money(original.item.total)} · {duration} min
                  </p>
                  <small>O reagendamento preserva os serviços e o valor da reserva.</small>
                </div>
              ) : (
                <>
                  {catalog.clients.length > 0 && (
                    <div
                      className="gf-agenda-client-mode"
                      role="group"
                      aria-label="Tipo de cliente"
                    >
                      <button
                        type="button"
                        aria-pressed={clientMode === 'new'}
                        onClick={() => setClientMode('new')}
                      >
                        Novo cliente / sem conta
                      </button>
                      <button
                        type="button"
                        aria-pressed={clientMode === 'existing'}
                        onClick={() => setClientMode('existing')}
                      >
                        Cliente existente
                      </button>
                    </div>
                  )}
                  {clientMode === 'existing' ? (
                    <div className="gf-field">
                      <label htmlFor="manual-client">Cliente existente</label>
                      <select
                        id="manual-client"
                        required
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                      >
                        <option value="">Selecione o cliente</option>
                        {catalog.clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="gf-agenda-contact-fields">
                      <Input
                        label="Nome e sobrenome"
                        required
                        minLength={3}
                        maxLength={100}
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <Input
                        label="Telefone"
                        type="tel"
                        required
                        maxLength={30}
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                      <Input
                        label="E-mail"
                        type="email"
                        required
                        maxLength={200}
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="gf-field">
                    <label htmlFor="manual-service">Serviço</label>
                    <select
                      id="manual-service"
                      required
                      value={service}
                      onChange={(e) => {
                        setService(e.target.value);
                        setProfessional('');
                      }}
                    >
                      <option value="">Selecione um serviço</option>
                      {catalog.services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.duration} min · {money(s.price)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div className="gf-agenda-contact-fields">
                <div className="gf-field">
                  <label htmlFor="manual-professional">Profissional</label>
                  <select
                    id="manual-professional"
                    required
                    value={professional}
                    onChange={(e) => setProfessional(e.target.value)}
                  >
                    <option value="">Selecione o profissional</option>
                    {eligible.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {ids && !eligible.length && (
                    <p className="gf-hint">Nenhum profissional ativo realiza este serviço.</p>
                  )}
                </div>
                <Input
                  label="Data do atendimento"
                  type="date"
                  required
                  min={today}
                  max={today ? addDays(today, 730) : undefined}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="gf-agenda-slots">
                <h3>Horário disponível</h3>
                {slotBusy ? (
                  <p role="status">Consultando horários…</p>
                ) : (
                  <>
                    {slotMessage && <p role="status">{slotMessage}</p>}
                    {!ids || !professional ? (
                      <p>Escolha serviço, profissional e data para consultar a agenda.</p>
                    ) : (
                      <div role="group" aria-label="Horários disponíveis">
                        {slots.map((slot) => (
                          <button
                            type="button"
                            key={slot}
                            aria-pressed={time === slot}
                            onClick={() => setTime(slot)}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {professional && date && (
                  <button
                    className="gf-agenda-slot-refresh"
                    type="button"
                    disabled={slotBusy}
                    onClick={() => setSlotRevision((n) => n + 1)}
                  >
                    Atualizar horários
                  </button>
                )}
              </div>
              <div className="gf-field">
                <label htmlFor="manual-notes">Observações (opcional)</label>
                <textarea
                  id="manual-notes"
                  maxLength={1000}
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </fieldset>
            {total !== undefined && (
              <p className="gf-agenda-form-total">
                Valor previsto: <strong>{money(total)}</strong> · {duration} minutos
              </p>
            )}
            <div className="gf-agenda-actions">
              <Button type="button" variant="secondary" disabled={busy} onClick={close}>
                Voltar
              </Button>
              <Button type="submit" busy={busy} disabled={!time || slotBusy || !professional}>
                {original ? 'Confirmar reagendamento' : 'Confirmar agendamento'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
