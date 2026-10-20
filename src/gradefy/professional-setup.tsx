import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context';
import { clock, errorMessage, newIdempotencyKey } from '../lib';
import type { WorkingDay } from '../types';
import { Button, ButtonLink, Card, Feedback, Input, Loading, GradefyLogo } from './components';
import { CompanySelector, ManagementAccess } from './management';
import type { ManagementProps } from './management';
import './professional-setup.css';
import { AgendaBlockPanel } from './agenda-blocks';

type Snapshot = {
  company: { id: string; name: string; timezone: string };
  professional: { id: string; name: string; active: number };
  editable: boolean;
  status: { configured: boolean; state: string; pending: string[]; servicesAssigned: boolean };
  days: WorkingDay[];
  settings: { version: number; agenda_mode: 'auto' | 'manual'; max_days_ahead: number };
  policies: {
    version: number;
    working_days: WorkingDay[] | null;
    maximum_booking_days: number | null;
    online_booking_enabled: boolean;
  };
  today: string;
  blocks: { id: string; date: string; start_minute: number; end_minute: number }[];
};
const labels = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
const order = [1, 2, 3, 4, 5, 6, 0];
const stages = ['Dias', 'Horários', 'Intervalos', 'Revisão'];
export default function ProfessionalSetup() {
  return <ManagementAccess area="professional">{(p) => <Setup {...p} />}</ManagementAccess>;
}
function Setup({ companyId, companies, choose }: ManagementProps) {
  const { api, logout } = useApp(),
    navigate = useNavigate();
  const [data, setData] = useState<Snapshot | null>(null),
    [days, setDays] = useState<WorkingDay[]>([]),
    [mode, setMode] = useState<'auto' | 'manual'>('auto'),
    [step, setStep] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [blockNotice, setBlockNotice] = useState(''),
    [baseline, setBaseline] = useState(''),
    [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const dirty = Boolean(baseline && baseline !== JSON.stringify({ days, mode }));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const working = useRef(false),
    attempt = useRef<{ payload: string; key: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<Snapshot>('/professional/availability', {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: controller.signal,
    })
      .then((r) => {
        if (controller.signal.aborted) return;
        setData(r);
        const initialDays = r.days.map((d) => {
          const c = r.policies.working_days?.find((c) => c.weekday === d.weekday);
          return !r.status.configured
            ? {
                ...d,
                active: false,
                start_time: c?.start_time || '09:00',
                end_time: c?.end_time || '18:00',
                breaks: [],
              }
            : d;
        });
        const initialMode = r.status.configured ? r.settings.agenda_mode : 'auto';
        setDays(initialDays);
        setMode(initialMode);
        setBaseline(JSON.stringify({ days: initialDays, mode: initialMode }));
        attempt.current = null;
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, companyId, revision]);
  const change = (weekday: number, patch: Partial<WorkingDay>) => {
    setDays((old) => old.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
    setError('');
  };
  async function leave() {
    if (
      working.current ||
      (dirty && !window.confirm('Descartar as alterações não salvas e sair da conta?'))
    )
      return;
    setBusy(true);
    try {
      await logout();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function problems(stage = step): string[] {
    if (!days.some((d) => d.active)) return ['Escolha pelo menos um dia de trabalho.'];
    const result: string[] = [];
    for (const d of days.filter((d) => d.active)) {
      const c = data?.policies.working_days?.find((c) => c.weekday === d.weekday);
      if (data?.policies.working_days && !c?.active)
        result.push(labels[d.weekday] + ': o estabelecimento está fechado.');
      if (
        stage >= 1 &&
        (!d.start_time ||
          !d.end_time ||
          d.start_time >= d.end_time ||
          (c?.active && (d.start_time < c.start_time || d.end_time > c.end_time)))
      )
        result.push(
          labels[d.weekday] + ': informe horários válidos dentro do expediente da empresa.',
        );
      if (stage >= 2) {
        const pauses = [...d.breaks].sort((a, b) => a.start_time.localeCompare(b.start_time));
        if (
          pauses.some(
            (b, i) =>
              !b.start_time ||
              !b.end_time ||
              b.start_time <= d.start_time ||
              b.end_time >= d.end_time ||
              b.start_time >= b.end_time ||
              (i > 0 && b.start_time < pauses[i - 1].end_time),
          )
        )
          result.push(
            labels[d.weekday] +
              ': os intervalos devem ficar dentro do seu expediente, sem sobreposição.',
          );
      }
    }
    return result;
  }
  function next() {
    const issues = problems();
    if (issues.length) {
      setError(issues.join(' '));
      return;
    }
    setError('');
    setStep((s) => s + 1);
    window.setTimeout(() => heading.current?.focus(), 0);
  }
  async function save() {
    if (working.current || !data) return;
    const issues = problems(3);
    if (issues.length) {
      setError(issues.join(' '));
      return;
    }
    const payload = JSON.stringify({
      version: data.settings.version,
      operational_version: data.policies.version,
      agenda_mode: mode,
      days,
    });
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: newIdempotencyKey() };
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await api('/professional/availability', {
        method: 'PUT',
        headers: { 'X-Gradefy-Company-Id': companyId, 'Idempotency-Key': attempt.current.key },
        body: payload,
      });
      navigate('/app/minha-agenda?empresa=' + encodeURIComponent(companyId), {
        replace: true,
        state: { scheduleSaved: true },
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function removeBlock(id: string) {
    if (
      working.current ||
      !window.confirm('Remover este bloqueio pessoal e permitir novas reservas no intervalo?')
    )
      return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await api('/professional/blocks/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { 'X-Gradefy-Company-Id': companyId },
      });
      setData((old) => (old ? { ...old, blocks: old.blocks.filter((b) => b.id !== id) } : old));
      setBlockNotice('Bloqueio pessoal removido.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const agenda = '/app/minha-agenda?empresa=' + encodeURIComponent(companyId);
  const titles = [
    'Quais dias você atende?',
    'Defina seus horários',
    'Adicione seus intervalos',
    'Tudo certo?',
  ];
  const descriptions = [
    'Selecione os dias em que deseja atender. Ajuste os horários no próximo passo.',
    'Informe o início e o término do atendimento em cada dia selecionado.',
    'Adicione almoço ou pausas recorrentes. As pausas da empresa já são respeitadas.',
    'Confira sua disponibilidade antes de salvar.',
  ];
  const companyHours = data?.policies.working_days;
  return (
    <div className="gf-own-setup">
      <header className="gf-own-brandbar">
        <div>
          <GradefyLogo />
          <p>Sua agenda, seu ritmo.</p>
        </div>
        <Button variant="secondary" busy={busy} onClick={() => void leave()}>
          <LogOut size={16} />
          Sair
        </Button>
      </header>
      <div className="gf-own-context">
        <span>{data?.company.name || companies.find((c) => c.id === companyId)?.name}</span>
        <span>
          {data?.professional.name}
          {data ? ' · ' + data.company.timezone : ''}
        </span>
      </div>
      {companies.length > 1 && (
        <CompanySelector
          companies={companies}
          value={companyId}
          choose={(id) => {
            if (
              !working.current &&
              (!dirty ||
                window.confirm('Descartar as alterações não salvas e trocar de estabelecimento?'))
            )
              choose(id);
          }}
        />
      )}
      <Feedback>{error}</Feedback>
      {loading ? (
        <Loading label="Carregando seus horários…" />
      ) : !data ? (
        <Card>
          <h1>Não foi possível abrir sua configuração</h1>
          <p>Tente novamente. Sua conta permanece conectada.</p>
          <Button onClick={() => setRevision((n) => n + 1)}>Tentar novamente</Button>
          <ButtonLink to="/app/conta" variant="secondary">
            Minha conta
          </ButtonLink>
        </Card>
      ) : (
        <>
          {!data.editable && (
            <Feedback>
              Configuração disponível apenas para consulta. Fale com a gestão para verificar o
              acesso.
            </Feedback>
          )}
          <nav className="gf-own-steps" aria-label="Etapas da configuração">
            {stages.map((s, i) => (
              <span
                key={s}
                aria-current={i === step ? 'step' : undefined}
                className={i < step ? 'gf-own-completed' : ''}
              >
                <b>{i + 1}</b>
                <span>{s}</span>
              </span>
            ))}
          </nav>
          <section className="gf-own-wizard" aria-label="Configurar minha agenda">
            <header className="gf-own-heading">
              <h1 ref={heading} tabIndex={-1}>
                {titles[step]}
              </h1>
              <p>{descriptions[step]}</p>
            </header>
            <fieldset disabled={busy || !data.editable} className="gf-own-fields">
              <legend className="sr-only">{stages[step]}</legend>
              {step < 3 &&
                order
                  .filter((w) => step === 0 || days.find((d) => d.weekday === w)?.active)
                  .map((w) => {
                    const d = days.find((d) => d.weekday === w)!;
                    const company = companyHours?.find((c) => c.weekday === w);
                    const icon = (
                      <span className={'gf-own-day-icon gf-own-color-' + w} aria-hidden="true">
                        <CalendarDays size={24} />
                      </span>
                    );
                    const hours = (
                      <span className="gf-own-day-summary">
                        {d.active ? d.start_time + ' às ' + d.end_time : 'Folga'}
                      </span>
                    );
                    if (step === 0)
                      return (
                        <label
                          className={
                            'gf-own-day gf-own-day-toggle' + (!d.active ? ' gf-own-day-off' : '')
                          }
                          key={w}
                        >
                          {icon}
                          <span>
                            <strong>{labels[w]}</strong>
                            {hours}
                            {companyHours && !company?.active && (
                              <small>Estabelecimento fechado</small>
                            )}
                          </span>
                          <input
                            type="checkbox"
                            className="gf-own-switch"
                            aria-label={'Trabalhar ' + labels[w]}
                            checked={d.active}
                            disabled={Boolean(companyHours && !company?.active)}
                            onChange={(e) => change(w, { active: e.target.checked })}
                          />
                        </label>
                      );
                    if (step === 1)
                      return (
                        <section
                          className="gf-own-day gf-own-hours-day"
                          key={w}
                          aria-label={labels[w]}
                        >
                          <div className="gf-own-day-title">
                            {icon}
                            <h2>{labels[w]}</h2>
                          </div>
                          <div className="gf-own-times">
                            <Input
                              type="time"
                              label={'Início · ' + labels[w]}
                              value={d.start_time}
                              min={company?.start_time}
                              max={company?.end_time}
                              onChange={(e) => change(w, { start_time: e.target.value })}
                            />
                            <Input
                              type="time"
                              label={'Fim · ' + labels[w]}
                              value={d.end_time}
                              min={company?.start_time}
                              max={company?.end_time}
                              onChange={(e) => change(w, { end_time: e.target.value })}
                            />
                          </div>
                          {company?.active && (
                            <small>
                              Empresa: {company.start_time} às {company.end_time}
                            </small>
                          )}
                        </section>
                      );
                    return (
                      <details
                        className="gf-own-day gf-own-break-day"
                        key={w}
                        open={
                          expanded[w] ??
                          w === order.find((day) => days.find((d) => d.weekday === day)?.active)
                        }
                        onToggle={(e) => {
                          const open = e.currentTarget.open;
                          setExpanded((old) => (old[w] === open ? old : { ...old, [w]: open }));
                        }}
                      >
                        <summary>
                          {icon}
                          <strong>{labels[w]}</strong>
                          <span>
                            {d.breaks.length} {d.breaks.length === 1 ? 'intervalo' : 'intervalos'}
                          </span>
                          <ChevronDown size={17} />
                        </summary>
                        <div className="gf-own-break-content">
                          <p className="gf-hint">
                            Seu horário: {d.start_time} às {d.end_time}.
                          </p>
                          {company?.breaks.length ? (
                            <p className="gf-hint">
                              Pausas da empresa:{' '}
                              {company.breaks
                                .map((b) => b.start_time + '–' + b.end_time)
                                .join(', ')}
                              .
                            </p>
                          ) : null}
                          {d.breaks.map((b, i) => (
                            <div className="gf-own-pause" key={i}>
                              <Input
                                label={`Início da pausa ${i + 1} · ${labels[w]}`}
                                type="time"
                                value={b.start_time}
                                min={d.start_time}
                                max={d.end_time}
                                onChange={(e) =>
                                  change(w, {
                                    breaks: d.breaks.map((v, j) =>
                                      i === j ? { ...v, start_time: e.target.value } : v,
                                    ),
                                  })
                                }
                              />
                              <Input
                                label={`Fim da pausa ${i + 1} · ${labels[w]}`}
                                type="time"
                                value={b.end_time}
                                min={d.start_time}
                                max={d.end_time}
                                onChange={(e) =>
                                  change(w, {
                                    breaks: d.breaks.map((v, j) =>
                                      i === j ? { ...v, end_time: e.target.value } : v,
                                    ),
                                  })
                                }
                              />
                              <button
                                type="button"
                                className="gf-own-remove"
                                onClick={() =>
                                  change(w, { breaks: d.breaks.filter((_, j) => i !== j) })
                                }
                                aria-label={`Remover pausa ${i + 1} · ${labels[w]}`}
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ))}
                          <Button
                            variant="secondary"
                            disabled={d.breaks.length >= 4}
                            onClick={() =>
                              change(w, {
                                breaks: [...d.breaks, { start_time: '12:00', end_time: '13:00' }],
                              })
                            }
                          >
                            <Plus size={16} />
                            Adicionar pausa · {labels[w]}
                          </Button>
                        </div>
                      </details>
                    );
                  })}
              {step === 3 && (
                <>
                  <section className="gf-own-review" aria-label="Resumo da sua agenda">
                    <h2>
                      <CalendarDays size={22} />
                      Resumo da sua agenda
                    </h2>
                    {order.map((w) => {
                      const d = days.find((d) => d.weekday === w)!;
                      return (
                        <div key={w} className={!d.active ? 'gf-own-day-off' : ''}>
                          <CalendarDays size={18} className={'gf-own-color-' + w} />
                          <strong>{labels[w]}</strong>
                          <span>{d.active ? d.start_time + ' às ' + d.end_time : 'Folga'}</span>
                          {d.active && (
                            <small>
                              {d.breaks.length} {d.breaks.length === 1 ? 'intervalo' : 'intervalos'}
                            </small>
                          )}
                          {d.active &&
                            d.breaks.map((b, i) => (
                              <span className="gf-own-review-pause" key={i}>
                                Pausa: {b.start_time} — {b.end_time}
                              </span>
                            ))}
                        </div>
                      );
                    })}
                  </section>
                  <section className="gf-own-repeat">
                    <div>
                      <RefreshCw size={25} />
                      <h2>Repetir automaticamente</h2>
                      <label className="gf-own-switch-hit">
                        <input
                          type="checkbox"
                          className="gf-own-switch"
                          aria-label="Repetir disponibilidade automaticamente nas próximas semanas"
                          checked={mode === 'auto'}
                          onChange={(e) => setMode(e.target.checked ? 'auto' : 'manual')}
                        />
                      </label>
                    </div>
                    <p>
                      {mode === 'auto'
                        ? 'Usar esta rotina nas próximas semanas, respeitando pausas, bloqueios e reservas.'
                        : 'Modo manual: a gestão precisa liberar os períodos de reserva.'}
                    </p>
                    <p className="gf-hint">
                      {data.policies.maximum_booking_days !== null
                        ? `Reservas até ${data.policies.maximum_booking_days} dias à frente, conforme a empresa.`
                        : `Janela de até ${data.settings.max_days_ahead} dias de trabalho.`}
                    </p>
                  </section>
                </>
              )}
            </fieldset>
            {step < 3 ? (
              <aside className="gf-own-tip">
                <Clock3 size={24} />
                <div>
                  <strong>{step === 2 ? 'Pausas no seu ritmo' : 'Horário da empresa'}</strong>
                  <p>
                    {step === 2
                      ? 'Adicione até quatro intervalos por dia, sem sobrepor horários.'
                      : companyHours
                        ? 'Seu atendimento deve ficar dentro do expediente de cada dia, indicado nos horários.'
                        : 'Sem expediente geral configurado. Sua rotina pessoal será usada.'}
                  </p>
                  {companyHours && (
                    <details className="gf-own-company-hours">
                      <summary>Ver expediente do estabelecimento</summary>
                      <ul>
                        {order.map((w) => {
                          const day = companyHours.find((d) => d.weekday === w);
                          return (
                            <li key={w}>
                              {labels[w]}:{' '}
                              {day?.active ? day.start_time + ' às ' + day.end_time : 'Fechado'}
                              {day?.active && day.breaks.length
                                ? ' · Pausas: ' +
                                  day.breaks.map((b) => b.start_time + '–' + b.end_time).join(', ')
                                : ''}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </div>
              </aside>
            ) : (
              <aside className="gf-own-tip">
                <ShieldCheck size={25} />
                <div>
                  <strong>O que acontece depois?</strong>
                  <p>
                    {data.professional.active !== 1 || !data.status.servicesAssigned
                      ? 'Sua agenda ficará configurada. Para receber reservas, o estabelecimento ainda precisa concluir sua ativação e seus serviços.'
                      : 'Sua rotina será atualizada. Bloqueios, reservas confirmadas e regras do estabelecimento continuam protegidos.'}
                  </p>
                </div>
              </aside>
            )}
            <div className={'gf-own-actions' + (step === 3 ? ' gf-own-actions-review' : '')}>
              {step > 0 && step < 3 && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setStep((s) => s - 1);
                    setError('');
                    window.setTimeout(() => heading.current?.focus(), 0);
                  }}
                >
                  <ArrowLeft size={17} />
                  Voltar
                </Button>
              )}
              {step < 3 ? (
                <Button disabled={busy || !data.editable} onClick={next}>
                  Continuar
                  <ArrowRight size={18} />
                </Button>
              ) : (
                <Button busy={busy} disabled={!data.editable} onClick={() => void save()}>
                  <Check size={19} />
                  Salvar minha agenda
                </Button>
              )}
              {step === 3 && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setStep(2);
                    setError('');
                    window.setTimeout(() => heading.current?.focus(), 0);
                  }}
                >
                  <ArrowLeft size={17} />
                  Voltar
                </Button>
              )}
            </div>
            <details className="gf-own-extra">
              <summary>Mais opções</summary>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm('Descartar as alterações não salvas e carregar a rotina atual?')
                  ) {
                    setRevision((n) => n + 1);
                    setStep(0);
                  }
                }}
              >
                <RefreshCw size={16} />
                Atualizar configuração
              </Button>
            </details>
          </section>
          {data.status.configured && (
            <div>
              <AgendaBlockPanel
                companyId={companyId}
                scope="professional"
                today={data.today}
                editable={data.editable}
                onChanged={() => {
                  void api<Snapshot>('/professional/availability', {
                    headers: { 'X-Gradefy-Company-Id': companyId },
                  })
                    .then((updated) =>
                      setData((old) => (old ? { ...old, blocks: updated.blocks } : old)),
                    )
                    .catch((e) => setError(errorMessage(e)));
                }}
              />
              <Card>
                <h3>Bloqueios pessoais salvos</h3>
                <Feedback success>{blockNotice}</Feedback>
                {data.blocks.map((b) => (
                  <div className="gf-own-actions" key={b.id}>
                    <span>
                      {b.date.split('-').reverse().join('/')} · {clock(b.start_minute)} —{' '}
                      {clock(b.end_minute)}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={busy || !data.editable}
                      onClick={() => void removeBlock(b.id)}
                    >
                      Remover bloqueio pessoal
                    </Button>
                  </div>
                ))}
              </Card>
            </div>
          )}
          {data.status.configured ? (
            <ButtonLink to={agenda} variant="secondary">
              Voltar para Minha Agenda
            </ButtonLink>
          ) : (
            <ButtonLink to="/app/conta" variant="secondary">
              Continuar depois · Minha conta
            </ButtonLink>
          )}
        </>
      )}
    </div>
  );
}
