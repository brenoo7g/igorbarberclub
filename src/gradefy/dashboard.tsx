import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowRight,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Globe,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Settings2,
  Scissors,
  UserRound,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import { useApp } from '../context';
import { errorMessage, money, statusLabels } from '../lib';
import { CompanySelector, ManagementAccess } from './management';
import type { Company } from './company-access';
import { Button, ButtonLink, Card, Feedback, Loading } from './components';
import type { DashboardState } from './dashboard-types';
import { businessLinks, BusinessNav } from './business-nav';
import './dashboard.css';
import { EmailNotifications } from './email-notifications';
import { DesktopDashboard } from './dashboard-desktop';
import { MobileBusinessHeader } from './mobile-business-header';
import { ReportChart } from './reports-charts';
import type { ReportState } from './reports-types';
import './dashboard-mobile.css';

const briefDate = (date: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'));
const compactLocalDate = (iso: string, timezone: string) => {
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(new Date(iso));
  return formatted.replace(
    /^([a-zá-ú]+)\./i,
    (_, day: string) => day.charAt(0).toUpperCase() + day.slice(1),
  );
};
const pending = [
  {
    key: 'settings',
    label: 'Configurações',
    icon: Settings2,
    description:
      'A configuração completa estará disponível em uma próxima etapa. Para alterar a identidade e os contatos do estabelecimento, acesse Meu Site.',
  },
];
export default function Dashboard() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 801px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 801px)');
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return (
    <ManagementAccess>
      {(props) => (desktop ? <DesktopDashboard {...props} /> : <DashboardContent {...props} />)}
    </ManagementAccess>
  );
}
function DashboardContent({
  companyId,
  companies,
  choose,
}: {
  companyId: string;
  companies: Company[];
  choose: (id: string) => void;
}) {
  const { api, user } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardState | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true);
  const [reportState, setReport] = useState<ReportState | null>(null);
  const [reportError, setReportError] = useState('');
  const report = reportState?.company.id === companyId ? reportState : null;
  const [date, setDate] = useState(''),
    [period, setPeriod] = useState('month'),
    [professional, setProfessional] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [info, setInfo] = useState<string | null>(null),
    [failedLogo, setFailedLogo] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError('');
    const params = new URLSearchParams({ period, page: String(page) });
    if (date) params.set('date', date);
    if (professional) params.set('professionalId', professional);
    api<DashboardState>('/dashboard?' + params, {
      signal: controller.signal,
      headers: { 'X-Gradefy-Company-Id': companyId },
    })
      .then((next) => {
        if (!controller.signal.aborted) setData(next);
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
  }, [api, companyId, date, period, professional, page, revision]);
  useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('gradefy-agenda-changed', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('gradefy-agenda-changed', refresh);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setReportError('');
    api<ReportState>('/admin/reports?area=overview&period=month', {
      signal: controller.signal,
      headers: { 'X-Gradefy-Company-Id': companyId },
    })
      .then((next) => {
        if (!controller.signal.aborted) setReport(next);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setReport(null);
          setReportError(errorMessage(cause));
        }
      });
    return () => controller.abort();
  }, [api, companyId, revision]);
  const editor = '/app/meu-site?empresa=' + encodeURIComponent(companyId);
  function agenda() {
    navigate('/app/agenda?empresa=' + encodeURIComponent(companyId));
  }
  const plan = data?.subscription;
  const subscriptionText = !plan
    ? ''
    : plan.reason === 'TRIAL_EXPIRED'
      ? 'Teste grátis encerrado'
      : plan.reason === 'SUBSCRIPTION_EXPIRED'
        ? 'Assinatura expirada'
        : plan.valid && plan.subscriptionStatus === 'trialing'
          ? `Teste grátis ativo · ${plan.trialDaysRemaining} ${plan.trialDaysRemaining === 1 ? 'dia restante' : 'dias restantes'}`
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
  const mobileSubscriptionText = !plan
    ? 'Sem assinatura vinculada'
    : plan.valid && plan.subscriptionStatus === 'trialing'
      ? `Teste: ${plan.trialDaysRemaining} ${plan.trialDaysRemaining === 1 ? 'dia' : 'dias'}`
      : subscriptionText;
  const panel = pending.find((p) => p.key === info);
  return (
    <div className="gf-dashboard">
      <aside className="gf-dashboard-sidebar" aria-label="Navegação empresarial">
        <div className="gf-sidebar-caption">ESPAÇO DE GESTÃO</div>
        <nav>
          <button
            className={!info ? 'gf-nav-active' : ''}
            onClick={() => setInfo(null)}
            aria-current={!info ? 'page' : undefined}
          >
            <LayoutDashboard size={19} />
            Visão geral
          </button>
          <button onClick={agenda}>
            <CalendarDays size={19} />
            Minha agenda
          </button>
          {businessLinks.slice(2, 8).map((p) => (
            <Link key={p.path} to={p.path + '?empresa=' + encodeURIComponent(companyId)}>
              <p.icon size={19} />
              {p.label}
            </Link>
          ))}
          <Link to={editor}>
            <Globe size={19} />
            Meu Site
          </Link>
          {pending.map((p) => (
            <button key={p.key} onClick={() => setInfo(p.key)} aria-expanded={info === p.key}>
              <p.icon size={19} />
              {p.label}
              <span>Em breve</span>
            </button>
          ))}
        </nav>
        <div className="gf-sidebar-bottom">
          <ShieldNote />
          <Link to="/app/conta">
            <UserRound size={18} />
            Minha conta
          </Link>
        </div>
      </aside>
      <div className="gf-dashboard-main" aria-busy={busy}>
        <MobileBusinessHeader companyId={companyId} />
        <div className={'gf-dashboard-top' + (companies.length > 1 ? ' has-company-switcher' : '')}>
          <div className="gf-dashboard-business">
            {data?.company.logo && failedLogo !== data.company.logo ? (
              <img
                src={data.company.logo}
                alt={'Logo ' + data.company.name}
                onError={() => setFailedLogo(data.company.logo)}
              />
            ) : (
              <span className="gf-business-icon">
                <Building2 size={23} />
              </span>
            )}
            <div>
              <small>SEU ESTABELECIMENTO</small>
              <strong>
                {data?.company.name || companies.find((c) => c.id === companyId)?.name}
              </strong>
              {data && (
                <span
                  className="gf-mobile-business-plan"
                  aria-label={`Plano e assinatura: ${plan?.planName ? `Plano ${plan.planName}, ` : ''}${subscriptionText}`}
                >
                  {plan?.planName && <span>Plano {plan.planName}</span>}
                  <span className={plan?.valid ? 'is-valid' : 'is-restricted'}>
                    {mobileSubscriptionText}
                  </span>
                </span>
              )}
            </div>
          </div>
          <Link className="gf-dashboard-account" to="/app/conta" aria-label="Acessar minha conta">
            <span>
              {user?.name
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((v) => v[0])
                .join('')}
            </span>
            <span>
              Minha conta
              <ChevronRight size={15} />
            </span>
          </Link>
          {companies.length > 1 && (
            <CompanySelector companies={companies} value={companyId} choose={choose} />
          )}
        </div>
        <Feedback>{error}</Feedback>
        {!data ? (
          <Card>
            {busy ? (
              <Loading />
            ) : (
              <>
                <h1>Não foi possível carregar seu painel</h1>
                <p>Confira a conexão e as permissões do estabelecimento selecionado.</p>
                <Button onClick={() => setRevision((v) => v + 1)}>Tentar novamente</Button>
                <ButtonLink to={editor} variant="secondary">
                  Meu Site
                </ButtonLink>
              </>
            )}
          </Card>
        ) : (
          <>
            <header className="gf-dashboard-welcome">
              <div>
                <div className="gf-kicker">SUA ROTINA, MAIS LEVE</div>
                <h1>
                  {data.clock.greeting}, {user?.name.split(' ')[0]}!
                </h1>
                <p className="gf-dashboard-welcome-description">Veja como está sua agenda hoje.</p>
                <time dateTime={data.clock.now}>
                  <span className="gf-date-full">
                    {new Intl.DateTimeFormat('pt-BR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      timeZone: data.company.timezone,
                    }).format(new Date(data.clock.now))}
                  </span>
                  <span className="gf-date-compact">
                    {compactLocalDate(data.clock.now, data.company.timezone)}
                  </span>
                </time>
                <span className="gf-dashboard-timezone">{data.company.timezone}</span>
                <p className="gf-dashboard-subscription-note">
                  <CreditCard size={14} />
                  <span className="gf-subscription-full">
                    Assinatura: {plan?.planName ? `Plano ${plan.planName} · ` : ''}
                    {subscriptionText}
                  </span>
                  <span className="gf-subscription-compact">
                    {plan?.planName ? `Plano ${plan.planName} · ` : ''}
                    {mobileSubscriptionText}
                  </span>
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setRevision((v) => v + 1)}
                aria-label="Atualizar painel"
              >
                <RefreshCw size={16} />
                <span>Atualizar</span>
              </Button>
            </header>
            {panel && (
              <Card className="gf-dashboard-info">
                <div>
                  <panel.icon size={23} />
                  <h2>{panel.label}</h2>
                  <button aria-label="Fechar informação" onClick={() => setInfo(null)}>
                    <X size={19} />
                  </button>
                </div>
                <p role="status">{panel.description}</p>
                {panel.key === 'settings' && <ButtonLink to={editor}>Personalizar site</ButtonLink>}
              </Card>
            )}
            {data.nextAppointment && (
              <Link
                className="gf-mobile-next-appointment"
                to={
                  '/app/agenda?empresa=' +
                  encodeURIComponent(companyId) +
                  '&atendimento=' +
                  encodeURIComponent(data.nextAppointment.id)
                }
              >
                <CalendarDays size={21} aria-hidden="true" />
                <span>
                  <strong>Próximo atendimento</strong>
                  <small>
                    {data.nextAppointment.time} · {data.nextAppointment.clientName}
                  </small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
            <div className="gf-dashboard-period">
              <div>
                <h2>Seu negócio em números</h2>
                <p className="gf-period-full">
                  {briefDate(data.period.start)} a {briefDate(data.period.end)} · indicadores de
                  toda a empresa
                </p>
                <details className="gf-period-compact">
                  <summary>Sobre os indicadores</summary>
                  <p>
                    {briefDate(data.period.start)} a {briefDate(data.period.end)} · toda a empresa
                  </p>
                </details>
              </div>
              <div className="gf-field">
                <label htmlFor="dashboard-period">Período dos indicadores</label>
                <select
                  id="dashboard-period"
                  value={period}
                  disabled={busy}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="day">Hoje</option>
                  <option value="week">Esta semana</option>
                  <option value="month">Este mês</option>
                </select>
              </div>
            </div>
            <section className="gf-dashboard-kpis" aria-label="Indicadores empresariais">
              <Metric
                icon={CalendarDays}
                label="Agendamentos ativos hoje"
                value={String(data.metrics.todayAppointments)}
                detail="Confirmados e concluídos"
                accent
              />
              <Metric
                icon={Wallet}
                label="Recebimentos do mês"
                value={report?.metrics ? money(report.metrics.receivedCents) : '—'}
                detail={reportError ? 'Consulta indisponível' : 'Registros manuais líquidos'}
                mobileDetail={
                  reportError
                    ? 'Consulta indisponível'
                    : 'Recebimentos manuais líquidos no mês; não inclui pagamentos online.'
                }
                cyan
              />
              <Metric
                icon={CheckCheck}
                label="Atendimentos concluídos"
                value={String(data.metrics.completedAppointments)}
                detail="No período selecionado"
              />
              <Metric
                icon={Wallet}
                label="Valor previsto"
                value={money(data.metrics.expectedValueCents)}
                detail="Confirmados e concluídos no período"
                mobileDetail="Valor dos agendamentos confirmados e concluídos no período; não indica pagamento recebido."
              >
                <p className="gf-metric-desktop-note">Não indica pagamento recebido.</p>
              </Metric>
            </section>
            <div className="gf-dashboard-columns">
              <Card className="gf-dashboard-agenda">
                <section
                  id="dashboard-agenda"
                  tabIndex={-1}
                  aria-labelledby="dashboard-agenda-title"
                >
                  <div className="gf-dashboard-section-heading">
                    <div>
                      <h2 id="dashboard-agenda-title">
                        {data.agenda.date === data.clock.today
                          ? 'Agenda de hoje'
                          : 'Agenda de ' + briefDate(data.agenda.date)}
                      </h2>
                      <p>
                        {data.agenda.total}{' '}
                        {data.agenda.total === 1 ? 'agendamento' : 'agendamentos'}
                      </p>
                    </div>
                    <Link to={'/app/agenda?empresa=' + encodeURIComponent(companyId)}>
                      Ver todos <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </div>
                  <div className="gf-agenda-filters">
                    <div className="gf-field">
                      <label htmlFor="dashboard-date">Data da agenda</label>
                      <input
                        id="dashboard-date"
                        type="date"
                        min="1900-01-01"
                        max="2199-12-31"
                        value={date || data.agenda.date}
                        disabled={busy}
                        onChange={(e) => {
                          setDate(e.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                    <div className="gf-field">
                      <label htmlFor="dashboard-professional">Profissional</label>
                      <select
                        id="dashboard-professional"
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
                            {p.active === 0 ? ' (inativo)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {!data.agenda.items.length ? (
                    <div className="gf-dashboard-empty">
                      <CalendarDays size={28} />
                      <h3>Nenhum agendamento nesta data</h3>
                      <p>
                        {professional
                          ? 'Não há reservas para o profissional selecionado. Consulte outra data ou profissional.'
                          : 'Consulte outra data ou personalize seu site para receber agendamentos.'}
                      </p>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setDate('');
                          setProfessional('');
                          setPage(1);
                        }}
                      >
                        Ver agenda de hoje
                      </Button>
                    </div>
                  ) : (
                    <div className="gf-day-appointments">
                      {data.agenda.items.map((a) => (
                        <article key={a.id} className="gf-day-appointment">
                          <time dateTime={a.date + 'T' + a.time}>{a.time}</time>
                          <div className="gf-day-client">
                            <h3>{a.clientName}</h3>
                            <p>{a.services.join(' + ') || 'Serviço registrado'}</p>
                            <small>
                              <UserRound size={12} />
                              {a.professionalName}
                              <span>·</span>
                              {a.duration} min
                            </small>
                          </div>
                          <span className={'gf-appointment-status gf-status-' + a.status}>
                            <i />
                            {statusLabels[a.status]}
                          </span>
                          <Link
                            className="gf-mobile-appointment-link"
                            to={
                              '/app/agenda?empresa=' +
                              encodeURIComponent(companyId) +
                              '&atendimento=' +
                              encodeURIComponent(a.id)
                            }
                            aria-label={'Ver atendimento de ' + a.clientName + ' às ' + a.time}
                          >
                            Ver detalhes <ArrowRight size={14} aria-hidden="true" />
                          </Link>
                        </article>
                      ))}
                    </div>
                  )}
                  {data.agenda.total > data.agenda.pageSize && (
                    <nav className="gf-dashboard-pagination" aria-label="Páginas da agenda">
                      <Button
                        variant="secondary"
                        disabled={busy || data.agenda.page <= 1}
                        onClick={() => setPage((v) => v - 1)}
                        aria-label="Página anterior"
                      >
                        <ChevronLeft size={18} />
                      </Button>
                      <span>
                        Página {data.agenda.page} de{' '}
                        {Math.ceil(data.agenda.total / data.agenda.pageSize)}
                      </span>
                      <Button
                        variant="secondary"
                        disabled={
                          busy || data.agenda.page * data.agenda.pageSize >= data.agenda.total
                        }
                        onClick={() => setPage((v) => v + 1)}
                        aria-label="Próxima página"
                      >
                        <ChevronRight size={18} />
                      </Button>
                    </nav>
                  )}
                </section>
              </Card>
              <div className="gf-dashboard-side-cards">
                <Card className="gf-dashboard-plan">
                  <span className="gf-dashboard-card-icon">
                    <CreditCard size={21} />
                  </span>
                  <h2>{plan?.planName ? 'Plano ' + plan.planName : 'Seu plano'}</h2>
                  <span className={'gf-plan-status ' + (plan?.valid ? 'gf-plan-valid' : '')}>
                    {subscriptionText}
                  </span>
                  {plan?.trialEndsAt && (
                    <p>
                      Teste grátis até{' '}
                      {new Intl.DateTimeFormat('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: data.company.timezone,
                      }).format(new Date(plan.trialEndsAt))}
                      .
                    </p>
                  )}
                  <p>
                    {plan?.valid
                      ? 'Seu período é calculado a partir da assinatura registrada.'
                      : 'A visualização não libera recursos que exigem assinatura vigente.'}
                  </p>
                </Card>
                <Card className="gf-dashboard-site">
                  <div className="gf-dashboard-section-heading">
                    <h2>Meu Site</h2>
                    <Globe size={22} />
                  </div>
                  <p>{data.site.templateName}</p>
                  <span className={'gf-site-badge ' + (data.site.published ? 'gf-site-live' : '')}>
                    <i />
                    {data.site.published ? 'Publicado' : 'Não publicado'}
                  </span>
                  {data.site.path ? (
                    <>
                      <p className="gf-dashboard-site-url">
                        {window.location.origin}
                        {data.site.path}
                      </p>
                      <a
                        className="gf-button gf-secondary"
                        href={data.site.path}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir site
                        <ArrowUpRight size={16} />
                      </a>
                    </>
                  ) : (
                    <p>Seu site permanece privado até você decidir publicar.</p>
                  )}
                  <ButtonLink to={editor}>
                    Personalizar site
                    <ChevronRight size={16} />
                  </ButtonLink>
                </Card>
              </div>
            </div>
            <section
              className="gf-mobile-dashboard-extras"
              aria-label="Resumo financeiro e operacional"
            >
              <Card className="gf-mobile-revenue">
                <div className="gf-mobile-card-heading">
                  <h2>
                    <ChartNoAxesCombined size={19} aria-hidden="true" /> Recebimentos registrados
                  </h2>
                  <Link to={'/app/financeiro?empresa=' + encodeURIComponent(companyId)}>
                    Ver mais <ArrowRight size={15} />
                  </Link>
                </div>
                {report?.metrics ? (
                  <>
                    <strong>{money(report.metrics.receivedCents)}</strong>
                    <p>Este mês · registros manuais líquidos de reversões</p>
                    <ReportChart
                      title="Recebimentos por dia"
                      rows={report.financialSeries || []}
                      series={[{ key: 'receivedCents', label: 'Recebimentos', color: '#00d4ff' }]}
                      monetary
                    />
                  </>
                ) : reportError ? (
                  <p role="alert">Não foi possível carregar os recebimentos: {reportError}</p>
                ) : (
                  <Loading label="Carregando recebimentos…" />
                )}
              </Card>
              <div className="gf-mobile-extra-grid">
                <Card>
                  <h2>
                    <Wallet size={18} /> Resumo financeiro
                  </h2>
                  {report?.metrics ? (
                    <dl>
                      <div>
                        <dt>Despesas pagas</dt>
                        <dd>{money(report.metrics.paidExpensesCents)}</dd>
                      </div>
                      <div>
                        <dt>Saldo registrado</dt>
                        <dd>{money(report.metrics.balanceCents)}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p>{reportError ? 'Resumo indisponível.' : 'Carregando resumo…'}</p>
                  )}
                  <small>Registros manuais; sem pagamentos online.</small>
                </Card>
                <Card>
                  <h2>
                    <Scissors size={18} /> Serviços mais realizados
                  </h2>
                  {report?.services?.items.some((item) => item.quantity > 0) ? (
                    <ol>
                      {report.services.items
                        .filter((item) => item.quantity > 0)
                        .sort((a, b) => b.quantity - a.quantity)
                        .slice(0, 3)
                        .map((item) => (
                          <li key={item.id}>
                            <span>{item.name}</span>
                            <strong>{item.quantity}</strong>
                          </li>
                        ))}
                    </ol>
                  ) : (
                    <p>
                      {reportError
                        ? 'Serviços indisponíveis.'
                        : 'Nenhum serviço concluído neste mês.'}
                    </p>
                  )}
                </Card>
              </div>
              <Card className="gf-mobile-team">
                <div className="gf-mobile-card-heading">
                  <h2>
                    <UsersRound size={18} /> Profissionais ativos
                  </h2>
                  <Link to={'/app/profissionais?empresa=' + encodeURIComponent(companyId)}>
                    Ver equipe <ArrowRight size={15} />
                  </Link>
                </div>
                <p>
                  {data.professionals.filter((item) => item.active === 1).length} cadastrados
                  ativos. Consulte as agendas para disponibilidade.
                </p>
              </Card>
              <div id="dashboard-email-notifications" className="gf-mobile-notifications">
                <EmailNotifications companyId={companyId} preview />
              </div>
            </section>
            <section className="gf-dashboard-quick" aria-labelledby="quick-title">
              <h2 id="quick-title">Ações rápidas</h2>
              <div>
                <Link to={'/app/agenda?empresa=' + encodeURIComponent(companyId) + '&novo=1'}>
                  <Plus />
                  <span>
                    Novo agendamento<small>Registrar atendimento</small>
                  </span>
                  <ChevronRight size={17} />
                </Link>
                <button onClick={agenda}>
                  <CalendarDays />
                  <span>
                    Minha agenda<small>Consultar seus horários</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
                {businessLinks.slice(2, 8).map((p) => (
                  <Link key={p.path} to={p.path + '?empresa=' + encodeURIComponent(companyId)}>
                    <p.icon />
                    <span>
                      {p.label}
                      <small>Abrir gestão</small>
                    </span>
                    <ChevronRight size={17} />
                  </Link>
                ))}
                {pending.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => {
                      setInfo(p.key);
                      window.scrollTo({ top: 0 });
                    }}
                  >
                    <p.icon />
                    <span>
                      {p.label}
                      <small>Informações · gestão em breve</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
                <Link to={editor}>
                  <Globe />
                  <span>
                    Meu Site<small>Personalizar e publicar</small>
                  </span>
                  <ChevronRight size={17} />
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
      <BusinessNav companyId={companyId} mobile />
    </div>
  );
}
function ShieldNote() {
  return (
    <p>
      Seu negócio.
      <br />
      No seu ritmo.
    </p>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  detail,
  mobileDetail,
  children,
  accent = false,
  cyan = false,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  detail: string;
  mobileDetail?: string;
  children?: React.ReactNode;
  accent?: boolean;
  cyan?: boolean;
}) {
  return (
    <Card
      className={
        'gf-dashboard-metric ' +
        (accent ? 'gf-metric-accent' : '') +
        (cyan ? ' gf-metric-cyan' : '')
      }
    >
      <div>
        <span>
          <Icon size={21} />
        </span>
        <h3>{label}</h3>
      </div>
      <strong>{value}</strong>
      <small className="gf-metric-desktop-detail">{detail}</small>
      <details className="gf-metric-mobile-detail">
        <summary aria-label={`Detalhes de ${label}`}>Detalhes</summary>
        <p>{mobileDetail || detail}</p>
      </details>
      {children}
    </Card>
  );
}
