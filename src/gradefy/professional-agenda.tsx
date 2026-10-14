import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogOut,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { useApp } from '../context';
import { addDays, ApiError, clock, errorMessage, newIdempotencyKey, statusLabels } from '../lib';
import type { WorkingDay } from '../types';
import { Modal } from '../components/UI';
import { Button, ButtonLink, Card, Feedback, Loading } from './components';
import { CompanySelector, ManagementAccess } from './management';
import type { ManagementProps } from './management';
import { agendaDateLabel, monday } from './agenda-display';
import './dashboard.css';
import './agenda.css';
import './professional-agenda.css';

type Item = {
  id: string;
  date: string;
  time: string;
  endTime: string;
  clientName: string;
  status: keyof typeof statusLabels;
  duration: number;
  services: { name: string; duration: number }[];
  canComplete: boolean;
};
type State = {
  company: { id: string; name: string; timezone: string };
  professional: { id: string; name: string } | null;
  linkState: 'linked' | 'pending' | 'inactive';
  message: string | null;
  editable: boolean;
  today: string;
  now: string;
  from: string;
  to: string;
  view: 'day' | 'week';
  page: number;
  pageSize: number;
  total: number;
  items: Item[];
  summary: Record<string, number> | null;
  next: Item | null;
  hours: {
    days: WorkingDay[];
    effective: WorkingDay[];
    mode: string;
    services: { name: string; duration: number; active: number }[];
  } | null;
  blocks: { date: string; start_minute: number; end_minute: number }[];
};
type Detail = {
  item: Item;
  expected: { date: string; time: string; endTime: string; status: string };
  timezone: string;
};
const days = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
export default function ProfessionalAgenda() {
  return <ManagementAccess area="professional">{(p) => <Content {...p} />}</ManagementAccess>;
}
function Navigation({
  companyId,
  mobile = false,
  onExit,
  showHours,
}: {
  companyId: string;
  mobile?: boolean;
  onExit: () => void;
  showHours: boolean;
}) {
  const links = (
    <>
      <Link to={'/app/minha-agenda?empresa=' + encodeURIComponent(companyId)} aria-current="page">
        <CalendarDays size={20} /> Minha Agenda
      </Link>
      {showHours && (
        <a href="#meus-horarios">
          <Clock3 size={20} /> Meus Horários
        </a>
      )}
      <Link to="/app/conta">
        <UserRound size={20} /> Minha Conta
      </Link>
    </>
  );
  return mobile ? (
    <nav
      className={
        'gf-dashboard-mobile-nav gf-professional-mobile' +
        (showHours ? '' : ' gf-professional-mobile-pending')
      }
      aria-label="Navegação do profissional"
    >
      {links}
    </nav>
  ) : (
    <aside className="gf-dashboard-sidebar" aria-label="Área do profissional">
      <div className="gf-sidebar-caption">SEU DIA DE TRABALHO</div>
      <nav>{links}</nav>
      <div className="gf-sidebar-bottom">
        <Button variant="secondary" onClick={onExit}>
          <LogOut size={17} />
          Sair da conta
        </Button>
      </div>
    </aside>
  );
}
function Content({ companyId, companies, choose, refreshAccess }: ManagementProps) {
  const { api, logout } = useApp();
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(true),
    [date, setDate] = useState(''),
    [view, setView] = useState<'day' | 'week'>('day'),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [detailId, setDetailId] = useState(''),
    [detail, setDetail] = useState<Detail | null>(null),
    [detailError, setDetailError] = useState(''),
    [writing, setWriting] = useState(false),
    [confirm, setConfirm] = useState(false);
  const key = useRef(''),
    working = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setData(null);
    setError('');
    const q = new URLSearchParams({ view, page: String(page) });
    if (date) q.set('from', date);
    api<State>('/professional/agenda?' + q, {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted) setData(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(errorMessage(e));
          if (e instanceof ApiError && e.status === 403) refreshAccess?.();
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [api, companyId, date, view, page, revision]);
  useEffect(() => {
    const refresh = () => {
      setDetailId('');
      setRevision((n) => n + 1);
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    setDetail(null);
    setDetailError('');
    setConfirm(false);
    key.current = '';
    if (!detailId) return;
    const c = new AbortController();
    api<Detail>('/professional/agenda/' + encodeURIComponent(detailId), {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted) setDetail(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setDetailError(errorMessage(e));
      });
    return () => c.abort();
  }, [api, companyId, detailId]);
  async function complete() {
    if (working.current || !detail) return;
    working.current = true;
    setWriting(true);
    setDetailError('');
    key.current ||= newIdempotencyKey();
    try {
      await api('/professional/agenda/' + encodeURIComponent(detail.item.id) + '/complete', {
        method: 'PATCH',
        headers: { 'X-Gradefy-Company-Id': companyId, 'Idempotency-Key': key.current },
        body: JSON.stringify({ expected: detail.expected }),
      });
      setDetailId('');
      setNotice('Atendimento concluído.');
      setRevision((n) => n + 1);
      window.dispatchEvent(new Event('gradefy-agenda-changed'));
    } catch (e) {
      setDetailError(errorMessage(e));
    } finally {
      working.current = false;
      setWriting(false);
    }
  }
  function changeDate(next: string) {
    setDate(next);
    setPage(1);
    setDetailId('');
  }
  function card(item: Item) {
    return (
      <button
        className="gf-professional-appointment"
        key={item.id}
        onClick={() => setDetailId(item.id)}
        aria-label={'Ver atendimento de ' + item.clientName + ' às ' + item.time}
      >
        <div>
          <time dateTime={item.date + 'T' + item.time}>
            {item.time} — {item.endTime}
          </time>
          <span className={'gf-appointment-status gf-status-' + item.status}>
            {statusLabels[item.status]}
          </span>
        </div>
        <strong>{item.clientName}</strong>
        <span>{item.services.map((s) => s.name).join(' + ')}</span>
        <small>{item.duration} minutos · Ver detalhes</small>
      </button>
    );
  }
  const exit = () => void logout().catch((e) => setError(errorMessage(e)));
  const todayCount = Object.values(data?.summary || {}).reduce((a, b) => a + b, 0);
  const confirmed = data?.summary?.confirmed || 0,
    completed = data?.summary?.completed || 0;
  return (
    <div className="gf-dashboard gf-agenda gf-professional-agenda">
      <Navigation companyId={companyId} onExit={exit} showHours={data?.linkState === 'linked'} />
      <div className="gf-dashboard-main" aria-busy={busy}>
        <header className="gf-agenda-heading">
          <div>
            <div className="gf-kicker">SEUS ATENDIMENTOS, SEU DIA</div>
            <h1>Minha Agenda</h1>
            <p>{data?.professional?.name || companies.find((c) => c.id === companyId)?.name}</p>
          </div>
          <CalendarDays size={28} />
        </header>
        {companies.length > 1 && (
          <CompanySelector
            companies={companies}
            value={companyId}
            choose={(id) => {
              setData(null);
              choose(id);
            }}
          />
        )}
        <Feedback>{error}</Feedback>
        <Feedback success>{notice}</Feedback>
        {!data ? (
          busy ? (
            <Loading label="Carregando sua agenda…" />
          ) : (
            <Card>
              <h2>Não foi possível carregar seus atendimentos</h2>
              <Button onClick={() => setRevision((n) => n + 1)}>Tentar novamente</Button>
              <ButtonLink to="/app/conta" variant="secondary">
                Minha conta
              </ButtonLink>
            </Card>
          )
        ) : data.linkState !== 'linked' ? (
          <Card>
            <h2>
              {data.linkState === 'pending' ? 'Seu vínculo está pendente' : 'Cadastro desativado'}
            </h2>
            <p>{data.message}</p>
            <Button onClick={() => setRevision((n) => n + 1)}>
              <RefreshCw size={17} />
              Verificar acesso
            </Button>
            <ButtonLink to="/app/conta" variant="secondary">
              Minha conta
            </ButtonLink>
            <Button
              variant="secondary"
              onClick={() => void logout().catch((e) => setError(errorMessage(e)))}
            >
              Sair da conta
            </Button>
          </Card>
        ) : (
          <>
            {data.message && <Feedback>{data.message}</Feedback>}
            <section className="gf-professional-summary" aria-label="Resumo de hoje">
              <Card>
                <div className="gf-kicker">HOJE · {agendaDateLabel(data.today)}</div>
                <h2>
                  {todayCount} {todayCount === 1 ? 'atendimento' : 'atendimentos'}
                </h2>
                <p>
                  {confirmed} {confirmed === 1 ? 'confirmado' : 'confirmados'} · {completed}{' '}
                  {completed === 1 ? 'concluído' : 'concluídos'}
                </p>
              </Card>
              <Card>
                <div className="gf-kicker">PRÓXIMO ATENDIMENTO</div>
                {data.next ? (
                  <>
                    <h2>{data.next.clientName}</h2>
                    <p>
                      {agendaDateLabel(data.next.date)} · {data.next.time} — {data.next.endTime}
                    </p>
                    <p>{data.next.services.map((s) => s.name).join(' + ')}</p>
                    <Button variant="secondary" onClick={() => setDetailId(data.next!.id)}>
                      Ver próximo atendimento
                    </Button>
                  </>
                ) : (
                  <>
                    <h2>Um momento livre</h2>
                    <p>Nenhum próximo atendimento confirmado.</p>
                  </>
                )}
              </Card>
            </section>
            <Card className="gf-agenda-toolbar">
              <div className="gf-agenda-navigation">
                <div
                  className="gf-agenda-views"
                  role="group"
                  aria-label="Visualização da minha agenda"
                >
                  <button
                    aria-pressed={view === 'day'}
                    onClick={() => {
                      setView('day');
                      setPage(1);
                    }}
                  >
                    Dia
                  </button>
                  <button
                    aria-pressed={view === 'week'}
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
                    onClick={() => changeDate(addDays(data.from, view === 'week' ? -7 : -1))}
                  >
                    <ChevronLeft size={18} />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => changeDate(view === 'week' ? monday(data.today) : data.today)}
                  >
                    Hoje
                  </Button>
                  <Button
                    variant="secondary"
                    aria-label="Próximo período"
                    onClick={() => changeDate(addDays(data.from, view === 'week' ? 7 : 1))}
                  >
                    <ChevronRight size={18} />
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  aria-label="Atualizar minha agenda"
                  onClick={() => setRevision((n) => n + 1)}
                >
                  <RefreshCw size={17} />
                </Button>
              </div>
              <label className="gf-field">
                Data da minha agenda
                <input
                  type="date"
                  min="1900-01-01"
                  max="2199-12-25"
                  value={date || data.from}
                  onChange={(e) =>
                    changeDate(
                      view === 'week' && e.target.value ? monday(e.target.value) : e.target.value,
                    )
                  }
                />
              </label>
              <p>
                {data.company.name} · {data.company.timezone}
              </p>
            </Card>
            {!data.items.length ? (
              <Card>
                <h2>Sem atendimentos neste período</h2>
                <p>Consulte outro dia ou veja sua semana.</p>
              </Card>
            ) : (
              Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => addDays(data.from, i)).map(
                (day) => {
                  const items = data.items.filter((a) => a.date === day);
                  return items.length ? (
                    <section key={day} className="gf-professional-day">
                      <h2>{agendaDateLabel(day)}</h2>
                      <div>{items.map(card)}</div>
                    </section>
                  ) : null;
                },
              )
            )}
            {data.total > data.pageSize && (
              <nav className="gf-dashboard-pagination" aria-label="Páginas da minha agenda">
                <Button
                  variant="secondary"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span>
                  Página {page} de {Math.ceil(data.total / data.pageSize)}
                </span>
                <Button
                  variant="secondary"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </nav>
            )}
            <section id="meus-horarios">
              <Card>
                <h2>Meus Horários</h2>
                <p>
                  Expediente efetivo do estabelecimento e do seu cadastro. Pausas, folgas e
                  bloqueios continuam valendo. Alterações são feitas pela gestão.
                </p>
                <div className="gf-professional-hours">
                  {data.hours?.effective.map((d) => (
                    <div key={d.weekday}>
                      <strong>{days[d.weekday]}</strong>
                      <span>
                        {d.active ? d.start_time + ' — ' + d.end_time : 'Folga / fechado'}
                      </span>
                      {d.active &&
                        d.breaks.map((b, i) => (
                          <small key={i}>
                            Pausa: {b.start_time} — {b.end_time}
                          </small>
                        ))}
                    </div>
                  ))}
                </div>
                {data.blocks.length > 0 && (
                  <>
                    <h3>Indisponibilidades do período</h3>
                    {data.blocks.map((b, i) => (
                      <p key={i}>
                        {agendaDateLabel(b.date)} · {clock(b.start_minute)} — {clock(b.end_minute)}
                      </p>
                    ))}
                  </>
                )}
                <h3>Meus serviços</h3>
                <ul>
                  {data.hours?.services.map((s, i) => (
                    <li key={i}>
                      {s.name} · {s.duration} min{s.active !== 1 ? ' (inativo)' : ''}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          </>
        )}
        {detailId && (
          <Modal
            title={confirm ? 'Concluir atendimento?' : 'Detalhes do meu atendimento'}
            onClose={() => {
              if (!writing) setDetailId('');
            }}
          >
            <div className="gf-form">
              <Feedback>{detailError}</Feedback>
              {!detail ? (
                detailError ? (
                  <Button variant="secondary" onClick={() => setDetailId('')}>
                    Voltar à agenda
                  </Button>
                ) : (
                  <Loading />
                )
              ) : (
                <>
                  <h3>{detail.item.clientName}</h3>
                  <p>
                    {agendaDateLabel(detail.item.date)} · {detail.item.time} — {detail.item.endTime}
                  </p>
                  <p>
                    {detail.item.services.map((s) => s.name).join(' + ')} · {detail.item.duration}{' '}
                    minutos
                  </p>
                  <p>
                    {statusLabels[detail.item.status]} · {detail.timezone}
                  </p>
                  {confirm ? (
                    <>
                      <p>
                        Confirme que este atendimento terminou. A conclusão não registra pagamento.
                      </p>
                      <Button busy={writing} onClick={() => void complete()}>
                        Confirmar conclusão
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={writing}
                        onClick={() => setConfirm(false)}
                      >
                        Voltar
                      </Button>
                    </>
                  ) : detail.item.canComplete ? (
                    <Button onClick={() => setConfirm(true)}>
                      <CheckCheck size={18} />
                      Concluir atendimento
                    </Button>
                  ) : (
                    <p>
                      Conclusão disponível somente após o fim do atendimento confirmado e com acesso
                      operacional ativo.
                    </p>
                  )}
                </>
              )}
            </div>
          </Modal>
        )}
      </div>
      <Navigation
        companyId={companyId}
        onExit={exit}
        showHours={data?.linkState === 'linked'}
        mobile
      />
    </div>
  );
}
