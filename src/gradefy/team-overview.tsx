import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Plus,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { useApp } from '../context';
import { addDays, errorMessage } from '../lib';
import { monday } from './agenda-display';
import { Button, Card, Feedback, Loading } from './components';
import type { Professional, Service } from './business-types';
import type { ReportState } from './reports-types';
import './team-desktop.css';

type TeamMember = { id: string; name: string; role: string; status: string };
type Invitation = { id: string; status: string };
type WeeklyDay = {
  date: string;
  configured: boolean;
  active: boolean;
  released: boolean;
  start: string | null;
  end: string | null;
  breaks: { start: string; end: string }[];
  blocks: { startMinute: number; endMinute: number }[];
};
type WeeklyState = {
  from: string;
  to: string;
  today: string;
  timezone: string;
  truncated: boolean;
  people: {
    id: string;
    name: string;
    active: number;
    agendaMode: 'auto' | 'manual';
    days: WeeklyDay[];
  }[];
};
const weekday = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const civil = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(value + 'T12:00:00Z'));
const hour = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const compactHour = (value: string | null) =>
  value ? value.replace(/^(\d{2}):(00)$/, '$1h').replace(/^(\d{2}):(\d{2})$/, '$1h$2') : '—';

export function TeamOverview({
  companyId,
  professionals,
  services,
  editable,
  members,
  invitations,
  onCreate,
  onEdit,
  onSchedule,
  onStatus,
}: {
  companyId: string;
  professionals: Professional[];
  services: Service[];
  editable: boolean;
  members?: TeamMember[];
  invitations?: Invitation[];
  onCreate?: () => void;
  onEdit?: (person: Professional) => void;
  onSchedule?: (id: string) => void;
  onStatus?: (person: Professional) => void;
}) {
  const { api } = useApp();
  const [week, setWeek] = useState('');
  const [weekly, setWeekly] = useState<WeeklyState | null>(null);
  const [report, setReport] = useState<ReportState | null>(null);
  const [error, setError] = useState('');
  const [reportError, setReportError] = useState('');
  const [busy, setBusy] = useState(true);
  const [search, setSearch] = useState('');
  useEffect(() => {
    setWeek('');
    setSearch('');
  }, [companyId]);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError('');
    api<WeeklyState>('/admin/team/weekly' + (week ? '?week=' + week : ''), {
      signal: controller.signal,
      headers: { 'X-Gradefy-Company-Id': companyId },
    })
      .then((data) => {
        if (!controller.signal.aborted) setWeekly(data);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setWeekly(null);
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [api, companyId, week]);
  useEffect(() => {
    const controller = new AbortController();
    setReportError('');
    api<ReportState>('/admin/reports?area=professionals&period=last30', {
      signal: controller.signal,
      headers: { 'X-Gradefy-Company-Id': companyId },
    })
      .then((data) => {
        if (!controller.signal.aborted) setReport(data);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setReport(null);
          setReportError(errorMessage(cause));
        }
      });
    return () => controller.abort();
  }, [api, companyId]);

  const filtered = professionals.filter((person) =>
    person.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
  );
  const active = professionals.filter((person) => person.active === 1).length;
  const ready = professionals.filter(
    (person) => person.active === 1 && person.availability?.state === 'ready',
  ).length;
  const linkedServices = professionals.filter((person) => person.services.length > 0).length;
  const stats = [
    { label: 'Profissionais cadastrados', value: professionals.length, icon: UsersRound },
    { label: 'Profissionais ativos', value: active, icon: UserRoundCheck },
    { label: 'Agendas prontas', value: ready, icon: CalendarDays },
    { label: 'Com serviços vinculados', value: linkedServices, icon: ShieldCheck },
  ];
  const ranked =
    report?.professionals?.items.filter((person) => person.quantity > 0).slice(0, 5) || [];
  const peak = Math.max(1, ...ranked.map((person) => person.quantity));
  const nextBlocks =
    weekly?.people
      .flatMap((person) =>
        person.days.flatMap((day) =>
          day.blocks.map((block) => ({ person, date: day.date, ...block })),
        ),
      )
      .filter((block) => block.date >= (weekly?.today || ''))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute)
      .slice(0, 4) || [];
  const companyPath = '?empresa=' + encodeURIComponent(companyId);
  return (
    <div className="gf-team-desktop" aria-label="Visão da equipe">
      <div className="gf-team-metrics">
        {stats.map(({ label, value, icon: Icon }, index) => (
          <Card key={label} className={'gf-team-metric gf-team-metric-' + index}>
            <Icon size={24} aria-hidden="true" />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </Card>
        ))}
      </div>
      <div className="gf-team-primary">
        <Card className="gf-team-roster">
          <div className="gf-team-card-heading">
            <h2>Profissionais ({professionals.length})</h2>
            <label className="gf-team-search">
              <span className="sr-only">Buscar profissional</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar profissional..."
              />
            </label>
            {onCreate ? (
              <Button disabled={!editable} onClick={onCreate}>
                <Plus size={16} /> Adicionar profissional
              </Button>
            ) : (
              <Link className="gf-team-primary-link" to={'/app/profissionais' + companyPath}>
                Gerenciar profissionais <ArrowRight size={16} />
              </Link>
            )}
          </div>
          <div className="gf-team-roster-scroll">
            <table>
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th>Especialidade</th>
                  <th>Serviços</th>
                  <th>Situação</th>
                  <th>Agenda</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <span className="gf-team-person">
                        <span className="gf-team-avatar">
                          <i aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</i>
                          {person.photo_url && (
                            <img
                              src={person.photo_url}
                              alt=""
                              onError={(event) => {
                                event.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                        </span>
                        <strong>{person.name}</strong>
                      </span>
                    </td>
                    <td>{person.specialty || 'Não informada'}</td>
                    <td>
                      {services
                        .filter((service) => person.services.includes(service.id))
                        .map((service) => service.name)
                        .join(', ') || 'Nenhum serviço'}
                    </td>
                    <td>
                      <span className={'gf-team-state ' + (person.active ? 'is-active' : 'is-off')}>
                        {person.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      {person.availability?.state === 'ready'
                        ? 'Pronta para reservas'
                        : person.availability?.state === 'waiting'
                          ? 'Aguardando gestão'
                          : 'Não configurada'}
                    </td>
                    <td>
                      <div className="gf-team-row-actions">
                        {onEdit && (
                          <button disabled={!editable} onClick={() => onEdit(person)}>
                            Editar
                          </button>
                        )}
                        {onSchedule ? (
                          <button
                            className="gf-team-schedule-action"
                            onClick={() => onSchedule(person.id)}
                          >
                            <CalendarDays size={14} aria-hidden="true" /> Horários
                          </button>
                        ) : (
                          <Link
                            className="gf-team-schedule-action"
                            to={'/app/profissionais' + companyPath}
                          >
                            <CalendarDays size={14} aria-hidden="true" /> Horários
                          </Link>
                        )}
                        {onStatus && (
                          <button disabled={!editable} onClick={() => onStatus(person)}>
                            {person.active ? 'Desativar' : 'Reativar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && <p className="gf-team-empty">Nenhum profissional encontrado.</p>}
        </Card>
        <Card className="gf-team-scale">
          <div className="gf-team-card-heading">
            <h2>Escala da equipe</h2>
            {weekly && (
              <div className="gf-team-week-controls">
                <button
                  aria-label="Semana anterior"
                  disabled={busy}
                  onClick={() => setWeek(addDays(weekly.from, -7))}
                >
                  <ChevronLeft size={17} />
                </button>
                <span>
                  {civil(weekly.from)} – {civil(weekly.to)}
                </span>
                <button
                  aria-label="Próxima semana"
                  disabled={busy}
                  onClick={() => setWeek(addDays(weekly.from, 7))}
                >
                  <ChevronRight size={17} />
                </button>
                <button disabled={busy} onClick={() => setWeek(monday(weekly.today))}>
                  Hoje
                </button>
              </div>
            )}
          </div>
          <Feedback>{error}</Feedback>
          {busy ? (
            <Loading label="Carregando escala..." />
          ) : weekly ? (
            <div
              className="gf-team-scale-scroll"
              role="region"
              aria-label="Escala semanal; use as setas horizontais para consultar todos os dias"
              tabIndex={0}
            >
              {weekly.truncated && (
                <p className="gf-team-empty">
                  A escala mostra os primeiros 200 profissionais em ordem alfabética.
                </p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>Profissional</th>
                    {weekly.people[0]?.days.map((day) => (
                      <th key={day.date}>
                        {weekday[new Date(day.date + 'T12:00:00Z').getUTCDay()]}
                        <small>{civil(day.date)}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weekly.people.map((person) => (
                    <tr key={person.id}>
                      <th scope="row">{person.name}</th>
                      {person.days.map((day) => {
                        const hasDetails =
                          person.active &&
                          day.configured &&
                          day.active &&
                          (!day.released || day.breaks.length > 0 || day.blocks.length > 0);
                        const label = !person.active
                          ? 'Inativo'
                          : !day.configured
                            ? 'Sem configuração'
                            : day.active
                              ? `${compactHour(day.start)}–${compactHour(day.end)}`
                              : 'Folga';
                        const className =
                          'gf-team-day ' +
                          (day.blocks.length ? 'has-block' : day.active ? 'is-open' : '');
                        return (
                          <td key={day.date}>
                            {hasDetails ? (
                              <details className={className}>
                                <summary>
                                  <strong>{label}</strong>
                                  {day.breaks.length > 0 && (
                                    <small>
                                      {day.breaks.length} intervalo
                                      {day.breaks.length === 1 ? '' : 's'}
                                    </small>
                                  )}
                                  {day.blocks.length > 0 && (
                                    <small>
                                      {day.blocks.length} bloqueio
                                      {day.blocks.length === 1 ? '' : 's'}
                                    </small>
                                  )}
                                  {!day.released && <small>Não liberada</small>}
                                  <span className="gf-team-day-expand">Ver detalhes</span>
                                </summary>
                                <div className="gf-team-day-details">
                                  {day.breaks.map((pause, index) => (
                                    <span key={index}>
                                      Intervalo {compactHour(pause.start)}–{compactHour(pause.end)}
                                    </span>
                                  ))}
                                  {day.blocks.map((block, index) => (
                                    <span key={index}>
                                      Bloqueio {compactHour(hour(block.startMinute))}–
                                      {compactHour(hour(block.endMinute))}
                                    </span>
                                  ))}
                                  {!day.released && <span>Agenda ainda não liberada</span>}
                                </div>
                              </details>
                            ) : (
                              <span className={className}>
                                <strong>{label}</strong>
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!weekly.people.length && (
                <p className="gf-team-empty">Cadastre profissionais para montar a escala.</p>
              )}
            </div>
          ) : null}
        </Card>
      </div>
      <div className="gf-team-secondary">
        <Card>
          <div className="gf-team-card-heading">
            <h2>Atendimentos concluídos</h2>
            <span>Últimos 30 dias</span>
          </div>
          <Feedback>{reportError}</Feedback>
          {ranked.length ? (
            <div className="gf-team-ranking">
              {ranked.map((person) => (
                <div key={person.id}>
                  <span>{person.name}</span>
                  <i aria-hidden="true">
                    <b style={{ width: `${(person.quantity / peak) * 100}%` }} />
                  </i>
                  <strong>{person.quantity}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="gf-team-empty">
              {!report && !reportError
                ? 'Carregando atendimentos...'
                : report
                  ? 'Nenhum atendimento concluído no período.'
                  : ''}
            </p>
          )}
        </Card>
        <Card>
          <div className="gf-team-card-heading">
            <h2>Estado das agendas</h2>
            <CalendarDays size={18} />
          </div>
          <div className="gf-team-availability-list">
            <span>
              <i className="is-ready" /> Prontas para reservas{' '}
              <strong>
                {professionals.filter((person) => person.availability?.state === 'ready').length}
              </strong>
            </span>
            <span>
              <i className="is-waiting" /> Aguardando gestão{' '}
              <strong>
                {professionals.filter((person) => person.availability?.state === 'waiting').length}
              </strong>
            </span>
            <span>
              <i className="is-setup" /> Não configuradas{' '}
              <strong>
                {
                  professionals.filter(
                    (person) => !person.availability || person.availability.state === 'setup',
                  ).length
                }
              </strong>
            </span>
          </div>
          <p>O cadastro ativo não indica disponibilidade imediata para agendamento.</p>
        </Card>
        <Card>
          <div className="gf-team-card-heading">
            <h2>Acessos e vínculos</h2>
            <ShieldCheck size={18} />
          </div>
          {members ? (
            <>
              <p>
                {members.filter((member) => member.status === 'active').length} pessoa(s) com acesso
                ativo · {invitations?.filter((invite) => invite.status === 'pending').length || 0}{' '}
                convite(s) pendente(s).
              </p>
              <div className="gf-team-access-list">
                {members
                  .filter((member) => member.status === 'active')
                  .slice(0, 4)
                  .map((member) => (
                    <span key={member.id}>
                      {member.name}{' '}
                      <small>
                        {member.role === 'owner'
                          ? 'Proprietário'
                          : member.role === 'manager'
                            ? 'Gestor'
                            : 'Profissional'}
                      </small>
                    </span>
                  ))}
              </div>
              <a href="#team-access">
                Gerenciar permissões <ArrowRight size={15} />
              </a>
            </>
          ) : (
            <p>
              {professionals.filter((person) => person.user_id).length} cadastro(s) profissional(is)
              vinculado(s) a uma conta. Convites e papéis são administrados pelo proprietário.
            </p>
          )}
        </Card>
        <Card className={'gf-team-absences-card' + (nextBlocks.length ? '' : ' is-empty')}>
          <div className="gf-team-card-heading">
            <h2>Próximas folgas e ausências</h2>
            <CalendarOff size={18} />
          </div>
          {nextBlocks.length ? (
            nextBlocks.map((block, index) => (
              <div className="gf-team-absence" key={`${block.person.id}-${block.date}-${index}`}>
                <strong>{block.person.name}</strong>
                <span>
                  {civil(block.date)} · {hour(block.startMinute)}–{hour(block.endMinute)}
                </span>
                <small>Bloqueio na agenda</small>
              </div>
            ))
          ) : (
            <p className="gf-team-empty gf-team-absence-empty">
              <CalendarOff size={18} aria-hidden="true" /> Nenhum bloqueio futuro nesta semana.
            </p>
          )}
          <Link to={'/app/agenda' + companyPath}>
            Consultar bloqueios <ArrowRight size={15} />
          </Link>
        </Card>
      </div>
    </div>
  );
}
