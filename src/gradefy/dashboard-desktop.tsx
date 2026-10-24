import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Search,
  RefreshCw,
  Scissors,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context';
import { errorMessage, money, statusLabels } from '../lib';
import { BusinessNav } from './business-nav';
import { Button, Card, Feedback, Loading } from './components';
import { EmailNotifications } from './email-notifications';
import type { ManagementProps } from './management';
import type { DashboardAppointment, DashboardState } from './dashboard-types';
import type { ReportFinancialDay, ReportState } from './reports-types';
import './dashboard-desktop.css';

const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
const appointmentUrl = (companyId: string, id: string) =>
  `/app/agenda?empresa=${encodeURIComponent(companyId)}&atendimento=${encodeURIComponent(id)}`;
const companyUrl = (path: string, companyId: string) =>
  `${path}?empresa=${encodeURIComponent(companyId)}`;

export function DesktopDashboard({ companyId, companies, choose }: ManagementProps) {
  const { api, user } = useApp();
  const [dataState, setData] = useState<DashboardState | null>(null);
  const [reportState, setReport] = useState<ReportState | null>(null);
  const [error, setError] = useState('');
  const [reportError, setReportError] = useState('');
  const [busy, setBusy] = useState(true);
  const [date, setDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState('');
  const [professional, setProfessional] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setDate('');
    setCalendarMonth('');
    setProfessional('');
    setPage(1);
    setLogoFailed(false);
    setSearch('');
  }, [companyId]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), period: 'month' });
    if (date) params.set('date', date);
    if (professional) params.set('professionalId', professional);
    setBusy(true);
    setError('');
    api<DashboardState>(`/dashboard?${params}`, {
      signal: controller.signal,
      headers: { 'X-Gradefy-Company-Id': companyId },
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [api, companyId, date, professional, page, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setReportError('');
    api<ReportState>('/admin/reports?area=overview&period=month', {
      signal: controller.signal,
      headers: { 'X-Gradefy-Company-Id': companyId },
    })
      .then((result) => {
        if (!controller.signal.aborted) setReport(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setReport(null);
          setReportError(errorMessage(cause));
        }
      });
    return () => controller.abort();
  }, [api, companyId, revision]);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('gradefy-agenda-changed', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('gradefy-agenda-changed', refresh);
    };
  }, []);

  const data = dataState?.company.id === companyId ? dataState : null;
  const report = reportState?.company.id === companyId ? reportState : null;
  const switchingCompany = Boolean(dataState && dataState.company.id !== companyId);
  const company = data?.company.name || companies.find((item) => item.id === companyId)?.name;
  const plan = data?.subscription;
  const subscription = !plan
    ? ''
    : plan.reason === 'TRIAL_EXPIRED'
      ? 'Teste grátis encerrado'
      : plan.reason === 'SUBSCRIPTION_EXPIRED'
        ? 'Assinatura expirada'
        : plan.valid && plan.subscriptionStatus === 'trialing'
          ? `Teste grátis · ${plan.trialDaysRemaining} ${plan.trialDaysRemaining === 1 ? 'dia restante' : 'dias restantes'}`
          : plan.valid && plan.subscriptionStatus === 'active'
            ? 'Assinatura ativa'
            : plan.status === 'pending'
              ? 'Assinatura pendente'
              : plan.status === 'cancelled'
                ? 'Assinatura cancelada'
                : plan.status === 'expired'
                  ? 'Assinatura expirada'
                  : plan.planName
                    ? 'Plano sem assinatura vigente'
                    : 'Sem assinatura vinculada';
  const activeProfessionals = data?.professionals.filter((item) => item.active === 1) || [];
  const filteredAgenda =
    data?.agenda.items.filter((item) =>
      `${item.clientName} ${item.professionalName} ${item.services.join(' ')}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.trim().toLocaleLowerCase('pt-BR')),
    ) || [];
  const localTime = data
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: data.company.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(data.clock.now))
    : '';
  const nextItems = data
    ? [
        ...data.agenda.items.filter(
          (item) =>
            item.date === data.clock.today && item.time > localTime && item.status === 'confirmed',
        ),
        ...(data.nextAppointment ? [data.nextAppointment] : []),
      ]
        .filter((item, index, items) => items.findIndex((other) => other.id === item.id) === index)
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
        .slice(0, 3)
    : [];
  const openNotifications = () => {
    const panel = document.querySelector<HTMLDetailsElement>(
      '#dashboard-email-notifications details',
    );
    if (panel) {
      panel.open = true;
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div
      className={`gf-dashboard gf-desktop-dashboard${data && filteredAgenda.length < 3 ? ' gf-desktop-sparse' : ''}`}
    >
      <BusinessNav
        companyId={companyId}
        companyName={company}
        planName={plan?.planName}
        showPlanPromo
        subscriptionLabel={subscription}
        sitePublished={data?.site.published}
      />
      <div className="gf-dashboard-main" aria-busy={busy || switchingCompany}>
        <header className="gf-desktop-topbar">
          <div>
            <h1>
              Olá, {user?.name?.trim().split(/\s+/)[0] || 'bem-vindo'}!{' '}
              <span aria-hidden="true">👋</span>
            </h1>
            <p>
              {data
                ? `Aqui está o resumo de ${company} em ${dateLabel(data.clock.today, { day: '2-digit', month: 'long', year: 'numeric' })}.`
                : 'Confira a rotina do seu estabelecimento.'}
            </p>
          </div>
          <div className="gf-desktop-top-actions">
            <label className="gf-desktop-search">
              <Search size={19} aria-hidden="true" />
              <span className="gf-sr-only">Buscar nesta agenda</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nesta agenda..."
                aria-label="Buscar nesta agenda"
              />
            </label>
            <button
              type="button"
              className="gf-desktop-bell"
              aria-label="Abrir notificações"
              onClick={openNotifications}
            >
              <Bell size={20} />
            </button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setRevision((value) => value + 1)}
              aria-label="Atualizar dashboard"
            >
              <RefreshCw size={17} /> Atualizar
            </Button>
            <div className="gf-desktop-company" title={company}>
              {data?.company.logo && !logoFailed ? (
                <img src={data.company.logo} alt="" onError={() => setLogoFailed(true)} />
              ) : (
                <span aria-hidden="true">{company?.slice(0, 1).toUpperCase()}</span>
              )}
              <div>
                <strong>{company}</strong>
                <small>{subscription || 'Estabelecimento selecionado'}</small>
              </div>
              {companies.length > 1 && (
                <>
                  <ChevronDown
                    className="gf-desktop-company-chevron"
                    size={16}
                    aria-hidden="true"
                  />
                  <select
                    aria-label="Empresa"
                    className="gf-desktop-company-select"
                    value={companyId}
                    onChange={(event) => choose(event.target.value)}
                  >
                    {companies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
        </header>
        <Feedback>{error}</Feedback>
        {!data ? (
          <Card className="gf-desktop-error">
            {busy || switchingCompany ? (
              <Loading label="Carregando o painel empresarial…" />
            ) : (
              <>
                <h2>Não foi possível carregar seu painel</h2>
                <p>Confira a conexão e as permissões do estabelecimento selecionado.</p>
                <Button onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button>
              </>
            )}
          </Card>
        ) : (
          <>
            <section className="gf-desktop-metrics" aria-label="Indicadores reais da empresa">
              <Metric
                icon={CalendarDays}
                color="indigo"
                title="Agendamentos hoje"
                value={String(data.metrics.todayAppointments)}
                detail="Confirmados e concluídos"
              />
              <Metric
                icon={Wallet}
                color="cyan"
                title="Faturamento do mês"
                value={report?.metrics ? money(report.metrics.receivedCents) : '—'}
                detail={
                  reportError
                    ? 'Dados indisponíveis'
                    : report?.metrics
                      ? 'Recebimentos registrados'
                      : 'Carregando recebimentos'
                }
              />
              <Metric
                icon={UsersRound}
                color="purple"
                title="Clientes ativos"
                value="—"
                detail="Dados indisponíveis"
              />
              <Metric
                icon={ChartNoAxesCombined}
                color="blue"
                title="Taxa de ocupação"
                value="—"
                detail="Dados indisponíveis"
              />
            </section>

            <div className="gf-desktop-board">
              <Card className="gf-desktop-agenda">
                <div className="gf-desktop-section-heading">
                  <div>
                    <h2>
                      <CalendarDays size={22} />{' '}
                      {data.agenda.date === data.clock.today
                        ? 'Agenda de hoje'
                        : `Agenda de ${dateLabel(data.agenda.date, { day: '2-digit', month: '2-digit' })}`}
                    </h2>
                    <span>
                      {data.agenda.total} {data.agenda.total === 1 ? 'agendamento' : 'agendamentos'}{' '}
                      · {data.company.timezone}
                    </span>
                  </div>
                  <span className="gf-desktop-date-chip">
                    <CalendarDays size={15} />
                    {dateLabel(data.agenda.date, {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'long',
                    })}
                  </span>
                  <Link className="gf-desktop-link" to={companyUrl('/app/agenda', companyId)}>
                    Ver agenda completa <ArrowRight size={16} />
                  </Link>
                </div>
                <details className="gf-desktop-filter-panel">
                  <summary>
                    Filtrar agenda <ChevronDown size={14} />
                  </summary>
                  <div className="gf-desktop-agenda-filters">
                    <label>
                      Data{' '}
                      <input
                        aria-label="Data da agenda"
                        type="date"
                        min="1900-01-01"
                        max="2199-12-31"
                        value={date || data.agenda.date}
                        disabled={busy}
                        onChange={(event) => {
                          setDate(event.target.value);
                          setPage(1);
                        }}
                      />
                    </label>
                    <label>
                      Profissional{' '}
                      <select
                        aria-label="Filtrar profissional"
                        value={professional}
                        disabled={busy}
                        onChange={(event) => {
                          setProfessional(event.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">Todos</option>
                        {data.professionals.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {item.active === 0 ? ' (inativo)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </details>
                {filteredAgenda.length ? (
                  <ol className="gf-desktop-timeline">
                    {filteredAgenda.map((item) => (
                      <li key={item.id}>
                        <AppointmentRow item={item} companyId={companyId} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="gf-desktop-empty">
                    <CalendarDays size={28} />
                    <strong>
                      {search ? 'Nenhum resultado nesta agenda' : 'Nenhum agendamento nesta data'}
                    </strong>
                    <p>{search ? 'Tente outro termo.' : 'Escolha outra data ou profissional.'}</p>
                    <Link to={companyUrl('/app/agenda', companyId)}>
                      Consultar agenda <ArrowRight size={15} />
                    </Link>
                  </div>
                )}
                {data.agenda.total > data.agenda.pageSize && (
                  <div className="gf-desktop-pagination">
                    <Button
                      variant="secondary"
                      disabled={busy || page <= 1}
                      onClick={() => setPage((value) => value - 1)}
                      aria-label="Página anterior"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span>
                      Página {data.agenda.page} de{' '}
                      {Math.ceil(data.agenda.total / data.agenda.pageSize)}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={busy || page * data.agenda.pageSize >= data.agenda.total}
                      onClick={() => setPage((value) => value + 1)}
                      aria-label="Próxima página"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                )}
              </Card>
              <CalendarCard
                today={data.clock.today}
                selected={date || data.agenda.date}
                month={calendarMonth || data.clock.today.slice(0, 7)}
                changeMonth={setCalendarMonth}
                chooseDate={(value) => {
                  setDate(value);
                  setPage(1);
                }}
              />
              <Card className="gf-desktop-finance">
                <div className="gf-desktop-section-heading">
                  <h2>
                    <ChartNoAxesCombined size={20} /> Recebimentos registrados
                  </h2>
                  <Link className="gf-desktop-link" to={companyUrl('/app/financeiro', companyId)}>
                    Ver financeiro <ArrowRight size={15} />
                  </Link>
                </div>
                {report?.metrics ? (
                  <>
                    <strong className="gf-desktop-finance-total">
                      {money(report.metrics.receivedCents)}
                    </strong>
                    <small>Mês atual · registros manuais líquidos de reversões</small>
                    <RevenueChart rows={report.financialSeries || []} />
                  </>
                ) : reportError || report ? (
                  <p role="alert">
                    Não foi possível consultar os recebimentos:{' '}
                    {reportError || 'dados indisponíveis.'}
                  </p>
                ) : (
                  <Loading label="Carregando recebimentos…" />
                )}
              </Card>
              <Card className="gf-desktop-next">
                <div className="gf-desktop-section-heading">
                  <h2>Próximos agendamentos</h2>
                  <Link className="gf-desktop-link" to={companyUrl('/app/agenda', companyId)}>
                    Ver todos <ArrowRight size={15} />
                  </Link>
                </div>
                {nextItems.length ? (
                  <div className="gf-desktop-next-list">
                    {nextItems.map((item) => (
                      <AppointmentRow
                        key={item.id}
                        item={item}
                        companyId={companyId}
                        showDate={item.date !== data.clock.today}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="gf-desktop-next-empty">
                    <CalendarDays size={22} />
                    <p>Nenhum atendimento futuro confirmado.</p>
                    <Link to={companyUrl('/app/agenda', companyId)}>
                      Consultar agenda <ArrowRight size={14} />
                    </Link>
                  </div>
                )}
              </Card>
              <Card className="gf-desktop-payments">
                <div className="gf-desktop-section-heading">
                  <h2>
                    <CreditCard size={19} /> Resumo de pagamentos
                  </h2>
                  <Link className="gf-desktop-link" to={companyUrl('/app/financeiro', companyId)}>
                    Ver mais <ArrowRight size={15} />
                  </Link>
                </div>
                {report?.metrics ? (
                  <div className="gf-desktop-payment-totals">
                    <div>
                      <strong>{money(report.metrics.receivedCents)}</strong>
                      <span>Recebidos no mês</span>
                    </div>
                    <div>
                      <strong>{money(report.metrics.paidExpensesCents)}</strong>
                      <span>Despesas pagas</span>
                    </div>
                    <div>
                      <strong>{money(report.metrics.balanceCents)}</strong>
                      <span>Saldo registrado</span>
                    </div>
                  </div>
                ) : reportError || report ? (
                  <p role="alert">Resumo indisponível.</p>
                ) : (
                  <Loading label="Carregando pagamentos…" />
                )}
                <p className="gf-desktop-quiet">Registros manuais; sem pagamentos online.</p>
              </Card>
              <div className="gf-desktop-bottom">
                <Card className="gf-desktop-team">
                  <div className="gf-desktop-section-heading">
                    <h2>
                      <UsersRound size={18} /> Equipe de hoje
                    </h2>
                    <Link
                      className="gf-desktop-link"
                      to={companyUrl('/app/profissionais', companyId)}
                    >
                      Ver equipe <ArrowRight size={15} />
                    </Link>
                  </div>
                  {activeProfessionals.length ? (
                    <div className="gf-desktop-team-list">
                      {activeProfessionals.slice(0, 5).map((item) => (
                        <span key={item.id}>
                          <span aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span>
                          <strong>{item.name}</strong>
                          <small>Ativo</small>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="gf-desktop-team-empty">
                      <UsersRound size={22} />
                      <p>Nenhum profissional ativo cadastrado.</p>
                    </div>
                  )}
                </Card>
                <Card className="gf-desktop-services">
                  <div className="gf-desktop-section-heading">
                    <h2>
                      <Scissors size={18} /> Serviços mais realizados
                    </h2>
                    <Link className="gf-desktop-link" to={companyUrl('/app/relatorios', companyId)}>
                      Relatórios <ArrowRight size={15} />
                    </Link>
                  </div>
                  {report ? (
                    report.services?.items.some((item) => item.quantity > 0) ? (
                      <ol>
                        {[...(report.services?.items || [])]
                          .filter((item) => item.quantity > 0)
                          .sort((a, b) => b.quantity - a.quantity)
                          .slice(0, 4)
                          .map((item) => (
                            <li key={item.id}>
                              <span className="gf-desktop-service-rank">
                                {[...(report.services?.items || [])].filter(
                                  (s) => s.quantity > item.quantity,
                                ).length + 1}
                              </span>
                              <span>{item.name}</span>
                              <span className="gf-desktop-service-track">
                                <i
                                  style={{
                                    width: `${Math.max(5, Math.round((item.quantity / Math.max(1, ...(report.services?.items || []).map((s) => s.quantity))) * 100))}%`,
                                  }}
                                />
                              </span>
                              <strong>{item.quantity}</strong>
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <div className="gf-desktop-services-empty">
                        <Scissors size={23} />
                        <p>Os serviços concluídos neste mês aparecerão aqui.</p>
                      </div>
                    )
                  ) : reportError ? (
                    <p role="alert">Relatório indisponível.</p>
                  ) : (
                    <Loading label="Carregando serviços…" />
                  )}
                </Card>
                <div id="dashboard-email-notifications">
                  <EmailNotifications companyId={companyId} preview />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  color,
  title,
  value,
  detail,
}: {
  icon: typeof CalendarDays;
  color: string;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className={`gf-desktop-metric gf-desktop-metric-${color}`}>
      <span className="gf-desktop-metric-icon">
        <Icon size={25} />
      </span>
      <div>
        <small>{title}</small>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </Card>
  );
}

function AppointmentRow({
  item,
  companyId,
  showDate = false,
}: {
  item: DashboardAppointment;
  companyId: string;
  showDate?: boolean;
}) {
  return (
    <Link className="gf-desktop-appointment" to={appointmentUrl(companyId, item.id)}>
      <time dateTime={`${item.date}T${item.time}`}>
        {showDate && <small>{dateLabel(item.date, { day: '2-digit', month: '2-digit' })}</small>}
        {item.time}
      </time>
      <span className="gf-desktop-avatar" aria-hidden="true">
        {item.clientName
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
          .toUpperCase()}
      </span>
      <div>
        <strong>{item.clientName}</strong>
        <span>
          {item.services.join(' + ') || 'Serviço registrado'} · {item.duration} min
        </span>
        <small>{item.professionalName}</small>
      </div>
      <span className={`gf-appointment-status gf-status-${item.status}`}>
        <i />
        {statusLabels[item.status]}
      </span>
      <ArrowRight className="gf-desktop-row-arrow" size={16} />
    </Link>
  );
}

function CalendarCard({
  today,
  selected,
  month,
  changeMonth,
  chooseDate,
}: {
  today: string;
  selected: string;
  month: string;
  changeMonth: (value: string) => void;
  chooseDate: (value: string) => void;
}) {
  const [year, number] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const heading = dateLabel(`${month}-01`, { month: 'long', year: 'numeric' });
  const move = (offset: number) =>
    changeMonth(new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7));
  return (
    <Card className="gf-desktop-calendar">
      <div className="gf-desktop-section-heading">
        <h2>{heading}</h2>
        <div>
          <button
            type="button"
            aria-label="Mês anterior"
            disabled={month <= '1900-01'}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            disabled={month >= '2199-12'}
            onClick={() => move(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div
        className="gf-desktop-calendar-grid"
        role="group"
        aria-label={`Calendário de ${heading}`}
      >
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, index) => (
          <span className="gf-desktop-weekday" key={index}>
            {day}
          </span>
        ))}
        {Array.from({ length: first }, (_, index) => (
          <span aria-hidden="true" key={`empty-${index}`} />
        ))}
        {Array.from({ length: days }, (_, index) => {
          const value = `${month}-${String(index + 1).padStart(2, '0')}`;
          return (
            <button
              type="button"
              key={value}
              aria-label={dateLabel(value, { weekday: 'long', day: 'numeric', month: 'long' })}
              aria-pressed={value === selected}
              className={value === today ? 'gf-desktop-today' : ''}
              onClick={() => chooseDate(value)}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <p>Selecione um dia para consultar os atendimentos.</p>
    </Card>
  );
}

function RevenueChart({ rows }: { rows: ReportFinancialDay[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const values = rows.map((item) => item.receivedCents);
  const high = Math.max(...values, 0);
  if (!rows.length || high === 0)
    return <p className="gf-desktop-quiet">Nenhum recebimento registrado neste período.</p>;
  const points = values.map((value, index) => ({
    x: 45 + (index / Math.max(1, values.length - 1)) * 545,
    y: 145 - (value / high) * 115,
  }));
  const line = `M${points.map(({ x, y }) => `${x},${y}`).join(' L')}`;
  const area = `${line} L590,145 L45,145 Z`;
  const hovered = hoverIndex === null ? null : points[hoverIndex];
  return (
    <div className="gf-desktop-chart">
      <svg
        role="img"
        aria-label={`Recebimentos registrados por dia no mês: ${rows.length} dias`}
        viewBox="0 0 600 170"
        preserveAspectRatio="none"
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - bounds.left) / bounds.width) * 600;
          const index = Math.round(((x - 45) / 545) * (rows.length - 1));
          setHoverIndex(Math.max(0, Math.min(rows.length - 1, index)));
        }}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="gf-desktop-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#00d4ff" stopOpacity=".35" />
            <stop offset="1" stopColor="#6c5ce7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gf-desktop-chart-line">
            <stop stopColor="#8e4cff" />
            <stop offset="1" stopColor="#00d4ff" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((index) => (
          <g key={index}>
            <line
              x1="45"
              y1={30 + index * 38.3}
              x2="590"
              y2={30 + index * 38.3}
              stroke="#365384"
              strokeOpacity=".3"
            />
            <text x="0" y={35 + index * 38.3} fill="#9cadce" fontSize="15">
              {Math.round((((3 - index) / 3) * high) / 100)}
            </text>
          </g>
        ))}
        {[0, 1, 2, 3, 4].map((index) => (
          <line
            key={index}
            x1={45 + index * 136.25}
            y1="30"
            x2={45 + index * 136.25}
            y2="145"
            stroke="#365384"
            strokeOpacity=".22"
          />
        ))}
        <path d={area} fill="url(#gf-desktop-chart-fill)" />
        <path
          d={line}
          fill="none"
          stroke="url(#gf-desktop-chart-line)"
          strokeWidth="4"
          vectorEffect="non-scaling-stroke"
        />
        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1="30"
              y2="145"
              stroke="#8e86ff"
              strokeOpacity=".75"
            />
            <circle
              cx={hovered.x}
              cy={hovered.y}
              r="6"
              fill="#7059ff"
              stroke="white"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
      {hovered && hoverIndex !== null && (
        <div
          className="gf-desktop-chart-tooltip"
          style={{ left: `${(hovered.x / 600) * 100}%` }}
          role="status"
        >
          <strong>{money(rows[hoverIndex].receivedCents)}</strong>
          <span>{dateLabel(rows[hoverIndex].date, { day: '2-digit', month: '2-digit' })}</span>
        </div>
      )}
      <div>
        <span>{dateLabel(rows[0].date, { day: '2-digit', month: '2-digit' })}</span>
        <span>{dateLabel(rows[rows.length - 1].date, { day: '2-digit', month: '2-digit' })}</span>
      </div>
    </div>
  );
}
