import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Pencil,
  Plus,
  Scissors,
  Search,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Users,
  UserRound,
  X,
} from 'lucide-react';
import { useApp } from '../context';
import { addDays, api, clock, errorMessage, formatDate, money, statusLabels, today } from '../lib';
import type { Appointment, Barber, Block, Metrics, Service } from '../types';
import { AuthForm } from '../components/AuthForm';
import { Avatar } from '../components/Avatar';
import { ProfileSettings } from './Profile';
import { Brand, EmptyState, ErrorBox, Modal, PageHeading, Spinner, Status } from '../components/UI';

function RevenueChart({ metrics }: { metrics: Metrics }) {
  const max = Math.max(...metrics.chart.map((d) => d.revenue), 10000);
  return (
    <div className="panel revenue-panel">
      <div className="panel-heading">
        <div>
          <h3>Evolução do faturamento</h3>
          <p>Atendimentos concluídos nos últimos 14 dias</p>
        </div>
        <span className="chart-key">
          <i />
          Receita
        </span>
      </div>
      <div
        className="chart"
        role="img"
        aria-label="Gráfico de faturamento diário. Valores disponíveis na tabela abaixo."
      >
        <div className="chart-y">
          <span>{money(max)}</span>
          <span>{money(max / 2)}</span>
          <span>R$ 0</span>
        </div>
        <div className="chart-bars">
          {metrics.chart.map((day) => (
            <div className="chart-column" key={day.date}>
              <div className="chart-bar-space">
                <div
                  className="chart-bar"
                  style={{ height: `${Math.max((day.revenue / max) * 100, day.revenue ? 2 : 0)}%` }}
                  title={`${formatDate(day.date)}: ${money(day.revenue)}`}
                >
                  <span>{money(day.revenue)}</span>
                </div>
              </div>
              <small>{day.date.slice(8)}</small>
            </div>
          ))}
        </div>
      </div>
      <details className="chart-data">
        <summary>Ver dados do gráfico</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Atendimentos</th>
                <th>Receita</th>
              </tr>
            </thead>
            <tbody>
              {metrics.chart.map((d) => (
                <tr key={d.date}>
                  <td>{formatDate(d.date)}</td>
                  <td>{d.count}</td>
                  <td>{money(d.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function AppointmentTable({
  appointments,
  onChange,
  compact = false,
}: {
  appointments: Appointment[];
  onChange: () => void;
  compact?: boolean;
}) {
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [change, setChange] = useState<{ a: Appointment; status: string } | null>(null);
  const { notify } = useApp();
  async function update() {
    if (!change) return;
    setPending(change.a.id);
    setError('');
    try {
      await api(`/admin/appointments/${change.a.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: change.status }),
      });
      setChange(null);
      notify('Status do atendimento atualizado.');
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending('');
    }
  }
  return (
    <>
      <ErrorBox message={error} />
      {!appointments.length ? (
        <EmptyState icon={<CalendarDays size={28} />} title="Agenda livre neste dia">
          Os agendamentos recebidos aparecerão aqui.
        </EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="appointments-table">
            <thead>
              <tr>
                <th>Horário</th>
                <th>Cliente</th>
                <th>Serviço</th>
                <th>Valor</th>
                <th>Status</th>
                {!compact && <th>Ação</th>}
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.time}</strong>
                    <small>{clock(a.end_minute)}</small>
                  </td>
                  <td>
                    <div className="table-client">
                      <span>
                        {a.client_name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                      <div>
                        <strong>{a.client_name}</strong>
                        <small>{a.client_phone}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {a.services.map((s) => s.name).join(' + ')}
                    <small>{a.barber_name}</small>
                  </td>
                  <td>{money(a.total)}</td>
                  <td>
                    <Status status={a.status} />
                  </td>
                  {!compact && (
                    <td>
                      {a.status === 'confirmed' ? (
                        <select
                          aria-label={`Alterar status de ${a.client_name} às ${a.time}`}
                          value=""
                          disabled={pending === a.id}
                          onChange={(e) => {
                            if (e.target.value) {
                              setError('');
                              setChange({ a, status: e.target.value });
                            }
                          }}
                        >
                          <option value="">Atualizar</option>
                          <option value="completed">Concluir</option>
                          <option value="cancelled">Cancelar</option>
                          <option value="no-show">Não compareceu</option>
                        </select>
                      ) : (
                        <span className="muted">Finalizado</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {change && (
        <Modal
          title="Atualizar atendimento"
          onClose={() => {
            if (!pending) setChange(null);
          }}
        >
          <p className="muted">
            Alterar o atendimento de <strong>{change.a.client_name}</strong>, às {change.a.time},
            para <strong>{statusLabels[change.status as Appointment['status']]}</strong>? Esta ação
            finaliza o agendamento.
          </p>
          <ErrorBox message={error} />
          <div className="modal-actions">
            <button className="button ghost" disabled={!!pending} onClick={() => setChange(null)}>
              Voltar
            </button>
            <button className="button primary" disabled={!!pending} onClick={update}>
              {pending ? 'Atualizando...' : 'Confirmar alteração'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Overview({ financial = false }: { financial?: boolean }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState('');
  const { user, config } = useApp();
  const refresh = useCallback(() => {
    Promise.all([
      api<Metrics>('/admin/metrics'),
      api<Appointment[]>(`/admin/appointments?from=${today()}`),
    ])
      .then(([m, a]) => {
        setMetrics(m);
        setAppointments(a);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(refresh, [refresh]);
  function exportCSV() {
    if (!metrics) return;
    const content =
      '\uFEFFData;Atendimentos;Receita (R$)\r\n' +
      metrics.chart
        .map((d) => `${d.date};${d.count};${(d.revenue / 100).toFixed(2).replace('.', ',')}`)
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `faturamento-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeading
        eyebrow={financial ? 'CONTROLE FINANCEIRO' : 'VISÃO GERAL'}
        title={financial ? 'Seu negócio, em números.' : `Bom te ver, ${user?.name.split(' ')[0]}.`}
      >
        <span className="admin-today">
          <CalendarDays size={16} />
          {formatDate(today(), { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </PageHeading>
      <p className="admin-page-subtitle">
        {financial
          ? 'Receita reconhecida somente em atendimentos concluídos.'
          : 'Um olhar sobre a sua barbearia. Tudo no seu controle.'}
      </p>
      <ErrorBox message={error} />
      {!metrics ? (
        <Spinner />
      ) : (
        <>
          <div className="kpi-grid">
            {[
              {
                label: 'Faturamento hoje',
                value: metrics.daily,
                note: 'Atendimentos concluídos',
                icon: CircleDollarSign,
              },
              {
                label: 'Nesta semana',
                value: metrics.weekly,
                note: 'Desde segunda-feira',
                icon: CalendarDays,
              },
              {
                label: 'Neste mês',
                value: metrics.monthly,
                note: 'Mês atual até hoje',
                icon: TrendingUp,
              },
              { label: 'Neste ano', value: metrics.yearly, note: 'Acumulado no ano', icon: Trophy },
            ].map((kpi, i) => (
              <div className={`kpi-card ${i === 0 ? 'accent' : ''}`} key={kpi.label}>
                <div>
                  <span>{kpi.label}</span>
                  <kpi.icon size={18} />
                </div>
                <strong>{money(kpi.value)}</strong>
                <small>{kpi.note}</small>
              </div>
            ))}
          </div>
          <div className="dashboard-charts">
            <RevenueChart metrics={metrics} />
            <div className="panel popular-panel">
              <div className="panel-heading">
                <div>
                  <h3>Os favoritos do Club</h3>
                  <p>Serviços mais vendidos · 30 dias</p>
                </div>
                <Scissors size={19} />
              </div>
              {metrics.topServices.length ? (
                metrics.topServices.slice(0, 4).map((s, i) => (
                  <div className="popular-service" key={s.name}>
                    <span className="rank">0{i + 1}</span>
                    <div>
                      <strong>{s.name}</strong>
                      <small>{s.count} atendimentos</small>
                      <div className="mini-track">
                        <span
                          style={{ width: `${(s.count / metrics.topServices[0].count) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span>{money(s.revenue)}</span>
                  </div>
                ))
              ) : (
                <EmptyState title="Sem dados ainda">
                  Conclua atendimentos para acompanhar seus serviços.
                </EmptyState>
              )}
            </div>
          </div>
          <div className="insight-grid">
            <div className="panel insight">
              <CircleDollarSign />
              <div>
                <span>Ticket médio por atendimento</span>
                <strong>{money(metrics.averageTicket)}</strong>
                <small>Últimos 30 dias · {metrics.visits} atendimentos</small>
              </div>
            </div>
            <div className="panel insight">
              <Trophy />
              <div>
                <span>Melhor dia em faturamento</span>
                <strong>{metrics.bestRevenueDay?.name || 'Sem dados'}</strong>
                <small>
                  {metrics.bestRevenueDay
                    ? `${money(metrics.bestRevenueDay.revenue)} nos últimos 30 dias`
                    : 'Aguardando atendimentos'}
                </small>
              </div>
            </div>
            <div className="panel insight">
              <Users />
              <div>
                <span>Maior movimento</span>
                <strong>{metrics.bestVolumeDay?.name || 'Sem dados'}</strong>
                <small>
                  {metrics.bestVolumeDay
                    ? `${metrics.bestVolumeDay.count} atendimentos · ${metrics.clients} clientes únicos no período`
                    : 'Aguardando atendimentos'}
                </small>
              </div>
            </div>
          </div>
          {financial ? (
            <div className="panel financial-notes">
              <div>
                <h3>Dados claros para boas decisões.</h3>
                <p>
                  Valores em reais. Cancelamentos e ausências não entram no faturamento. O ticket
                  médio divide a receita pelo número de atendimentos concluídos nos últimos 30 dias.
                </p>
              </div>
              <button className="button ghost" onClick={exportCSV}>
                <ArrowDownToLine size={16} />
                Exportar 14 dias (CSV)
              </button>
            </div>
          ) : (
            <div className="panel today-panel">
              <div className="panel-heading">
                <div>
                  <h3>
                    Na agenda de hoje <span className="count-pill">{appointments.length}</span>
                  </h3>
                  <p>Seus clientes, horários e próximos atendimentos.</p>
                </div>
                <Link className="text-link" to="/admin/agenda">
                  Ver agenda completa
                  <ArrowUpRight size={16} />
                </Link>
              </div>
              <AppointmentTable appointments={appointments} onChange={refresh} compact />
            </div>
          )}
          <div className="integration-note">
            <Mail size={16} />
            <span>
              Confirmações automáticas: e-mail{' '}
              {config?.notifications.email ? 'configurado' : 'aguardando configuração'} · WhatsApp{' '}
              {config?.notifications.whatsapp ? 'configurado' : 'aguardando configuração'}.
            </span>
          </div>
        </>
      )}
    </>
  );
}

function Agenda() {
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('day');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [blocking, setBlocking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blockError, setBlockError] = useState('');
  const { config, notify } = useApp();
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const firstOfMonth = `${date.slice(0, 7)}-01`;
  const from =
    mode === 'day'
      ? date
      : mode === 'week'
        ? addDays(date, -((dow + 6) % 7))
        : addDays(firstOfMonth, -((new Date(`${firstOfMonth}T12:00:00Z`).getUTCDay() + 6) % 7));
  const to = mode === 'day' ? date : addDays(from, mode === 'week' ? 6 : 41);
  const refresh = useCallback(() => {
    setLoading(true);
    setError('');
    return Promise.all([
      api<Appointment[]>(`/admin/appointments?from=${from}&to=${to}`),
      api<Block[]>(`/admin/blocks?from=${from}&to=${to}`),
      api<Barber[]>('/barbers'),
    ])
      .then(([a, b, people]) => {
        setAppointments(a);
        setBlocks(b);
        setBarbers(people);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [from, to]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const selected = appointments.filter((a) => a.date === date);
  function move(direction: number) {
    if (mode !== 'month') setDate(addDays(date, direction * (mode === 'week' ? 7 : 1)));
    else {
      const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setDate(d.toISOString().slice(0, 10));
    }
  }
  async function addBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setBlockError('');
    try {
      await api('/admin/blocks', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form)),
      });
      setBlocking(false);
      notify('Horário bloqueado na agenda.');
      await refresh();
    } catch (e) {
      setBlockError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function removeBlock(id: string) {
    try {
      await api(`/admin/blocks/${id}`, { method: 'DELETE' });
      notify('Horário liberado.');
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <PageHeading eyebrow="GESTÃO DE AGENDAMENTOS" title="Agenda organizada. Dia na régua.">
        <button
          className="button primary"
          onClick={() => {
            setBlockError('');
            setBlocking(true);
          }}
        >
          <Ban size={17} />
          Bloquear horário
        </button>
      </PageHeading>
      <div className="panel agenda-panel">
        <div className="agenda-toolbar">
          <div className="agenda-date-nav">
            <button className="icon-button" aria-label="Período anterior" onClick={() => move(-1)}>
              <ChevronLeft size={18} />
            </button>
            <label>
              <input
                aria-label="Data da agenda"
                type="date"
                value={date}
                onChange={(e) => {
                  if (e.target.value) setDate(e.target.value);
                }}
              />
            </label>
            <button className="icon-button" aria-label="Próximo período" onClick={() => move(1)}>
              <ChevronRight size={18} />
            </button>
            <button className="button ghost small-button" onClick={() => setDate(today())}>
              Hoje
            </button>
          </div>
          <div className="segmented">
            {(
              [
                { id: 'day', label: 'Dia' },
                { id: 'week', label: 'Semana' },
                { id: 'month', label: 'Mês' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                className={mode === m.id ? 'selected' : ''}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <ErrorBox message={error} />
        {loading ? (
          <Spinner />
        ) : (
          <>
            {mode !== 'day' && (
              <div className={`calendar-grid ${mode}`}>
                <div className="calendar-day-labels">
                  {['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="calendar-days">
                  {Array.from({ length: mode === 'week' ? 7 : 42 }, (_, i) => addDays(from, i)).map(
                    (d) => {
                      const list = appointments.filter(
                        (a) => a.date === d && a.status !== 'cancelled',
                      );
                      const blocked = blocks.filter((b) => b.date === d);
                      return (
                        <button
                          className={`calendar-cell ${d === date ? 'selected' : ''} ${d === today() ? 'is-today' : ''} ${mode === 'month' && d.slice(0, 7) !== date.slice(0, 7) ? 'outside' : ''}`}
                          key={d}
                          onClick={() => setDate(d)}
                          aria-label={`${formatDate(d)}: ${list.length} agendamentos`}
                        >
                          <strong>{d.slice(8)}</strong>
                          {list.slice(0, mode === 'week' ? 6 : 2).map((a) => (
                            <span className="calendar-event" key={a.id}>
                              {a.time} <span>{a.client_name.split(' ')[0]}</span>
                            </span>
                          ))}
                          {list.length > (mode === 'week' ? 6 : 2) && (
                            <small>+{list.length - (mode === 'week' ? 6 : 2)} horários</small>
                          )}
                          {blocked.length > 0 && (
                            <small className="danger-text">{blocked.length} bloqueio(s)</small>
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            )}
            <div className="panel-heading">
              <div>
                <h3>{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                <p>
                  {selected.filter((a) => a.status === 'confirmed').length} confirmados ·{' '}
                  {selected.filter((a) => a.status === 'completed').length} concluídos
                </p>
              </div>
              <Clock3 size={19} />
            </div>
            <AppointmentTable
              appointments={selected}
              onChange={() => {
                void refresh();
              }}
            />
            {blocks
              .filter((b) => b.date === date)
              .map((b) => (
                <div className="block-row" key={b.id}>
                  <Ban size={16} />
                  <div>
                    <strong>
                      {clock(b.start_minute)}–{clock(b.end_minute)} · {b.reason}
                    </strong>
                    <small>{barbers.find((barber) => barber.id === b.barber_id)?.name}</small>
                  </div>
                  <button className="text-link" onClick={() => removeBlock(b.id)}>
                    Liberar horário
                    <X size={14} />
                  </button>
                </div>
              ))}
          </>
        )}
      </div>
      {blocking && (
        <Modal
          title="Bloquear um horário"
          onClose={() => {
            if (!busy) setBlocking(false);
          }}
        >
          <form onSubmit={addBlock} className="form-stack">
            <p className="muted">
              Reserve um intervalo, almoço ou folga. Horários com agendamentos não podem ser
              bloqueados.
            </p>
            <ErrorBox message={blockError} />
            <label>
              Profissional
              <select name="barberId" required>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data
              <input
                type="date"
                name="date"
                defaultValue={date < today() ? today() : date}
                min={today()}
                max={addDays(today(), 90)}
                required
              />
            </label>
            <div className="form-row">
              <label>
                Início
                <input
                  type="time"
                  name="start"
                  defaultValue={`${String(config?.open || 9).padStart(2, '0')}:00`}
                  required
                />
              </label>
              <label>
                Fim
                <input
                  type="time"
                  name="end"
                  defaultValue={`${String(config?.close || 19).padStart(2, '0')}:00`}
                  required
                />
              </label>
            </div>
            <label>
              Motivo
              <input
                name="reason"
                placeholder="Ex.: almoço, compromisso, folga"
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <button className="button primary full" disabled={busy}>
              {busy ? 'Bloqueando...' : 'Confirmar bloqueio'}
              <Ban size={16} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const { notify } = useApp();
  const refresh = useCallback(() => {
    api<Service[]>('/services')
      .then(setServices)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(refresh, [refresh]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    const data = {
      name: form.get('name'),
      description: form.get('description'),
      category: form.get('category'),
      duration: Number(form.get('duration')),
      price: Math.round(Number(String(form.get('price')).replace(',', '.')) * 100),
    };
    try {
      await api(
        editing === 'new' ? '/admin/services' : `/admin/services/${(editing as Service).id}`,
        { method: editing === 'new' ? 'POST' : 'PUT', body: JSON.stringify(data) },
      );
      setEditing(null);
      notify('Serviço salvo com sucesso.');
      refresh();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setFormError('');
    try {
      await api(`/admin/services/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      notify('Serviço removido do catálogo.');
      refresh();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const item = typeof editing === 'object' ? editing : null;
  return (
    <>
      <PageHeading eyebrow="CATÁLOGO DE SERVIÇOS" title="O cuidado tem a sua assinatura.">
        <button
          className="button primary"
          onClick={() => {
            setFormError('');
            setEditing('new');
          }}
        >
          <Plus size={18} />
          Novo serviço
        </button>
      </PageHeading>
      <p className="admin-page-subtitle">
        Gerencie preços, duração e os serviços disponíveis para seus clientes.
      </p>
      <div className="panel">
        <div className="panel-heading">
          <h3>
            Seus serviços <span className="count-pill">{services.length}</span>
          </h3>
          <label className="search-field">
            <Search size={17} />
            <input
              placeholder="Buscar serviço..."
              aria-label="Buscar serviço"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <ErrorBox message={error} />
        {loading ? (
          <Spinner />
        ) : (
          <div className="admin-services-list">
            {services
              .filter((s) => `${s.name} ${s.category}`.toLowerCase().includes(search.toLowerCase()))
              .map((s) => (
                <div className="admin-service-row" key={s.id}>
                  <span className="admin-service-icon">
                    <Scissors size={20} />
                  </span>
                  <div className="admin-service-info">
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                    <span className="category-tag">{s.category}</span>
                  </div>
                  <span className="admin-service-duration">
                    <Clock3 size={14} />
                    {s.duration} min
                  </span>
                  <strong className="admin-service-price">{money(s.price)}</strong>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`Editar ${s.name}`}
                      onClick={() => {
                        setFormError('');
                        setEditing(s);
                      }}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="icon-button danger-text"
                      aria-label={`Excluir ${s.name}`}
                      onClick={() => {
                        setFormError('');
                        setDeleting(s);
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ))}
            {!services.some((s) =>
              `${s.name} ${s.category}`.toLowerCase().includes(search.toLowerCase()),
            ) && (
              <EmptyState title="Nenhum serviço encontrado">
                Altere sua busca ou crie um novo serviço.
              </EmptyState>
            )}
          </div>
        )}
      </div>
      {editing && (
        <Modal
          title={editing === 'new' ? 'Novo serviço' : 'Editar serviço'}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <form className="form-stack" onSubmit={save}>
            <ErrorBox message={formError} />
            <label>
              Nome do serviço
              <input
                name="name"
                defaultValue={item?.name}
                minLength={2}
                maxLength={80}
                placeholder="Ex.: Corte degradê"
                required
              />
            </label>
            <label>
              Descrição
              <textarea
                name="description"
                defaultValue={item?.description}
                maxLength={250}
                placeholder="Descreva o cuidado oferecido"
                rows={3}
              />
            </label>
            <div className="form-row">
              <label>
                Duração (min)
                <input
                  name="duration"
                  type="number"
                  min={10}
                  max={480}
                  step={1}
                  defaultValue={item?.duration || 30}
                  required
                />
              </label>
              <label>
                Preço (R$)
                <input
                  name="price"
                  type="number"
                  min={0}
                  max={10000}
                  step="0.01"
                  defaultValue={item ? (item.price / 100).toFixed(2) : ''}
                  placeholder="35,00"
                  required
                />
              </label>
            </div>
            <label>
              Categoria
              <input
                name="category"
                defaultValue={item?.category}
                list="categories"
                minLength={2}
                maxLength={40}
                placeholder="Ex.: Cabelo"
                required
              />
              <datalist id="categories">
                {['Cabelo', 'Barba', 'Combos', 'Acabamento', 'Coloração'].map((c) => (
                  <option value={c} key={c} />
                ))}
              </datalist>
            </label>
            <button className="button primary full" disabled={busy}>
              {busy ? 'Salvando...' : 'Salvar serviço'}
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Remover serviço do catálogo?"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p className="muted">
            O serviço <strong>{deleting.name}</strong> deixará de aceitar novos agendamentos. Os
            atendimentos já marcados e o histórico financeiro serão preservados.
          </p>
          <ErrorBox message={formError} />
          <div className="modal-actions">
            <button className="button ghost" disabled={busy} onClick={() => setDeleting(null)}>
              Voltar
            </button>
            <button className="button danger" disabled={busy} onClick={remove}>
              {busy ? 'Removendo...' : 'Remover serviço'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default function Admin() {
  const { user, loading, logout, config } = useApp();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  if (loading) return <Spinner />;
  if (!user)
    return (
      <div className="admin-login">
        <div className="admin-login-top">
          <Brand />
          <Link className="text-link" to="/">
            <ArrowLeft size={15} />
            Voltar ao site
          </Link>
        </div>
        <div className="admin-login-panel">
          <span className="login-shield">
            <ShieldCheck size={28} />
          </span>
          <h1>O Club nas suas mãos.</h1>
          <p>Entre para cuidar da agenda e do seu negócio.</p>
          <AuthForm admin />
        </div>
        <p className="admin-login-footer">IGOR BARBER CLUB · ÁREA RESTRITA</p>
      </div>
    );
  if (user.role !== 'admin')
    return (
      <div className="access-denied">
        <ShieldCheck size={40} />
        <h1>Acesso da administração</h1>
        <p>Você está conectado como cliente. Use uma conta administrativa para acessar o painel.</p>
        <ErrorBox message={error} />
        <button
          className="button primary"
          onClick={() => logout().catch((e) => setError(errorMessage(e)))}
        >
          Sair e trocar de conta
        </button>
        <Link className="text-link" to="/minha-conta">
          Voltar para minha conta
        </Link>
      </div>
    );
  const nav = [
    { to: '/admin', name: 'Visão geral', icon: LayoutDashboard },
    { to: '/admin/agenda', name: 'Agenda', icon: CalendarDays },
    { to: '/admin/servicos', name: 'Serviços', icon: Scissors },
    { to: '/admin/financeiro', name: 'Financeiro', icon: TrendingUp },
    { to: '/admin/perfil', name: 'Meu perfil', icon: UserRound },
  ];
  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${menu ? 'open' : ''}`}>
        <Brand />
        <span className="sidebar-caption">GESTÃO DA BARBEARIA</span>
        <nav aria-label="Navegação administrativa">
          {nav.map((n) => (
            <NavLink
              end
              key={n.to}
              to={n.to}
              onClick={() => setMenu(false)}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <n.icon size={19} />
              {n.name}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/">
            <ArrowUpRight size={18} />
            Visitar o site
          </Link>
          <button onClick={() => logout().catch((e) => setError(errorMessage(e)))}>
            <LogOut size={18} />
            Sair da conta
          </button>
          <div className="sidebar-profile">
            <Avatar name={user.name} avatar={user.avatar} />
            <div>
              <strong>{user.name}</strong>
              <small>Administrador</small>
            </div>
            <span className="status-dot" />
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMenu(false)}
          aria-label="Fechar menu"
        />
      )}
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <button
              className="icon-button admin-menu"
              aria-label="Abrir menu administrativo"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </button>
            <span>
              Painel de controle<span className="breadcrumb-slash">/</span>
              <strong>{nav.find((n) => n.to === pathname)?.name || 'Visão geral'}</strong>
            </span>
          </div>
          <span className="admin-location">
            <span className="status-dot" />
            Igor Barber Club<span>Campo Grande, RJ</span>
          </span>
        </header>
        <div className="admin-content">
          {config?.demo && (
            <div className="demo-banner">
              <ShieldCheck size={15} />
              Ambiente de demonstração · Clientes, preços e agendamentos de exemplo.
            </div>
          )}
          <ErrorBox message={error} />
          {pathname === '/admin/agenda' ? (
            <Agenda />
          ) : pathname === '/admin/servicos' ? (
            <Services />
          ) : pathname === '/admin/perfil' ? (
            <ProfileSettings key={user.id} user={user} />
          ) : (
            <Overview financial={pathname === '/admin/financeiro'} />
          )}
        </div>
        <footer className="admin-footer">
          <span>IGOR BARBER CLUB</span>
          <span>Feito para quem leva o estilo a sério.</span>
        </footer>
      </div>
    </div>
  );
}
