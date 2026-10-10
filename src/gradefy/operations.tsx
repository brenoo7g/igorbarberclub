import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Check, ArrowLeft, ArrowRight, Plus, Pencil, Clock, Scissors, Users } from 'lucide-react';
import { useApp } from '../context';
import { errorMessage, money, newIdempotencyKey } from '../lib';
import { Button, ButtonLink, Card, Feedback, Input, Loading } from './components';
import type { PendingBusiness } from './business-types';

type Step = PendingBusiness['currentStep'];
interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  active: number;
  category: string;
}
interface Professional {
  id: string;
  name: string;
  specialty: string;
  services: string[];
  active: number;
  user_id: string | null;
}
interface Day {
  weekday: number;
  active: boolean;
  start_time: string;
  end_time: string;
  breaks: { start_time: string; end_time: string }[];
}
interface Schedule {
  professionalId: string;
  settings: { agenda_mode: 'auto' | 'manual'; max_days_ahead: number; version: number };
  days: Day[];
}
interface State {
  company: PendingBusiness;
  services: Service[];
  professionals: Professional[];
  schedules: Schedule[];
  issues: string[];
}
const steps: Step[] = ['services', 'professionals', 'schedule', 'review'];
const labels = ['Seus serviços', 'Profissionais', 'Horários', 'Revisão'];
const weekdays = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
const emptyService = { name: '', description: '', price: '', duration: '40', active: true };
const emptyPerson = {
  name: '',
  specialty: '',
  services: [] as string[],
  active: true,
  self: false,
};
const endpoint = '/onboarding/operations';
export default function Operations() {
  const { api, user } = useApp();
  const { refreshBusiness } = useOutletContext<{
    business: PendingBusiness;
    refreshBusiness: () => void;
  }>();
  const navigate = useNavigate();
  const [data, setData] = useState<State | null>(null),
    [revision, setRevision] = useState(0);
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [service, setService] = useState(emptyService),
    [serviceId, setServiceId] = useState<string | null>(null);
  const [person, setPerson] = useState(emptyPerson),
    [personId, setPersonId] = useState<string | null>(null);
  const [selected, setSelected] = useState(''),
    [schedule, setSchedule] = useState<Schedule | null>(null);
  const submitting = useRef(false),
    attempt = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    setError('');
    api<State>(endpoint)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
      });
    return () => {
      active = false;
    };
  }, [api, revision]);
  useEffect(() => {
    if (!data) return;
    const id =
      selected ||
      data.professionals.find((p) => p.active === 1)?.id ||
      data.professionals[0]?.id ||
      '';
    setSelected(id);
    setSchedule(data.schedules.find((s) => s.professionalId === id) || null);
  }, [data, selected]);
  async function mutate(path: string, method: string, body: unknown, done?: () => void) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const payload = JSON.stringify(body),
        scope = `${path}:${payload}`;
      if (attempt.current?.payload !== scope)
        attempt.current = { payload: scope, key: newIdempotencyKey() };
      await api(`${endpoint}${path}`, {
        method,
        body: payload,
        headers: { 'Idempotency-Key': attempt.current!.key },
      });
      attempt.current = null;
      done?.();
      setMessage('Alterações salvas.');
      setRevision((r) => r + 1);
      if (path === '/complete') {
        refreshBusiness();
        navigate('/app/onboarding/complete');
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="gf-ready">
        <Card>
          {error ? (
            <>
              <Feedback>{error}</Feedback>
              <Button onClick={() => setRevision((r) => r + 1)}>Tentar novamente</Button>
              <ButtonLink to="/app/conta" variant="secondary">
                Voltar para minha conta
              </ButtonLink>
            </>
          ) : (
            <Loading />
          )}
        </Card>
      </div>
    );
  const step = data.company.currentStep,
    index = steps.indexOf(step);
  function saveService(event: FormEvent) {
    event.preventDefault();
    void mutate(
      `/services${serviceId ? `/${encodeURIComponent(serviceId)}` : ''}`,
      serviceId ? 'PUT' : 'POST',
      {
        name: service.name,
        description: service.description,
        price: Math.round(Number(service.price.replace(',', '.')) * 100),
        duration: Number(service.duration),
        category: 'Barbearia',
        active: service.active,
      },
      () => {
        setService(emptyService);
        setServiceId(null);
      },
    );
  }
  function savePerson(event: FormEvent) {
    event.preventDefault();
    const detail = {
      name: person.name,
      specialty: person.specialty,
      services: person.services,
      userId: person.self ? user!.id : null,
    };
    void mutate(
      `/professionals${personId ? `/${encodeURIComponent(personId)}` : ''}`,
      personId ? 'PUT' : 'POST',
      { ...detail, ...(!personId ? { active: person.active } : {}) },
      () => {
        setPerson(emptyPerson);
        setPersonId(null);
      },
    );
  }
  function editService(value: Service) {
    setServiceId(value.id);
    setService({
      name: value.name,
      description: value.description,
      price: (value.price / 100).toFixed(2),
      duration: String(value.duration),
      active: value.active === 1,
    });
  }
  function editPerson(value: Professional) {
    setPersonId(value.id);
    setPerson({
      name: value.name,
      specialty: value.specialty,
      services: value.services,
      active: value.active === 1,
      self: value.user_id === user?.id,
    });
  }
  function dayChange(position: number, update: Partial<Day>) {
    setSchedule((current) =>
      current
        ? {
            ...current,
            days: current.days.map((day, i) => (i === position ? { ...day, ...update } : day)),
          }
        : null,
    );
  }
  return (
    <div className="gf-plans-page gf-operations-page">
      <Link className="gf-back" to="/app/conta">
        <ArrowLeft size={17} />
        Voltar para minha conta
      </Link>
      <div className="gf-plans-heading">
        <div className="gf-kicker">PREPARE SEU NEGÓCIO</div>
        <h1>{labels[index]}</h1>
        <p>
          {data.company.name} · Plano {data.company.plan.name}. Seu teste grátis ainda não começou.
        </p>
      </div>
      <nav className="gf-wizard-tabs" aria-label="Etapas da configuração">
        {steps.map((value, i) => (
          <Button
            key={value}
            variant={value === step ? 'primary' : 'secondary'}
            disabled={busy}
            aria-current={value === step ? 'step' : undefined}
            onClick={() => mutate('/progress', 'PUT', { step: value })}
          >
            {i + 1}. {labels[i]}
          </Button>
        ))}
      </nav>
      <Feedback>{error}</Feedback>
      <Feedback success>{message}</Feedback>
      {step === 'services' ? (
        <div className="gf-wizard-columns">
          <Card>
            <h2>
              <Scissors size={21} />
              {serviceId ? 'Editar serviço' : 'Novo serviço'}
            </h2>
            {data.company.niche.code === 'barbershop' && !serviceId && (
              <div className="gf-suggestions">
                <p>Sugestões: revise preço e duração antes de salvar.</p>
                {['Corte', 'Barba', 'Corte + Barba'].map((name) => (
                  <Button
                    key={name}
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setService((value) => ({ ...value, name }))}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            )}
            <form onSubmit={saveService}>
              <fieldset disabled={busy} className="gf-wizard-fields">
                <legend className="gf-visually-hidden">Dados do serviço</legend>
                <Input
                  label="Nome do serviço"
                  value={service.name}
                  onChange={(e) => setService({ ...service, name: e.target.value })}
                  minLength={2}
                  maxLength={80}
                  required
                />
                <Input
                  label="Descrição (opcional)"
                  value={service.description}
                  onChange={(e) => setService({ ...service, description: e.target.value })}
                  maxLength={250}
                />
                <div className="gf-field-pair">
                  <Input
                    label="Preço (R$)"
                    inputMode="decimal"
                    pattern="[0-9]+([,.][0-9]{1,2})?"
                    value={service.price}
                    onChange={(e) => setService({ ...service, price: e.target.value })}
                    required
                  />
                  <Input
                    label="Duração (minutos)"
                    type="number"
                    min={10}
                    max={480}
                    step={1}
                    value={service.duration}
                    onChange={(e) => setService({ ...service, duration: e.target.value })}
                    required
                  />
                </div>
                <label className="gf-check">
                  <input
                    type="checkbox"
                    checked={service.active}
                    onChange={(e) => setService({ ...service, active: e.target.checked })}
                  />
                  Serviço ativo
                </label>
              </fieldset>
              <Button busy={busy} type="submit">
                {serviceId ? 'Salvar serviço' : 'Cadastrar serviço'}
              </Button>
              {serviceId && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setServiceId(null);
                    setService(emptyService);
                  }}
                >
                  Cancelar edição
                </Button>
              )}
            </form>
          </Card>
          <Card>
            <h2>Serviços cadastrados</h2>
            {!data.services.length && (
              <p>Nenhum serviço cadastrado. Adicione seu primeiro atendimento.</p>
            )}
            {data.services.map((value) => (
              <div key={value.id} className="gf-resource-row">
                <div>
                  <strong>{value.name}</strong>
                  <p>
                    {money(value.price)} · {value.duration} min ·{' '}
                    {value.active === 1 ? 'Ativo' : 'Inativo'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={busy}
                  aria-label={`Editar ${value.name}`}
                  onClick={() => editService(value)}
                >
                  <Pencil size={16} />
                  Editar
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    mutate(`/services/${encodeURIComponent(value.id)}`, 'PUT', {
                      name: value.name,
                      description: value.description,
                      price: value.price,
                      duration: value.duration,
                      category: value.category,
                      active: value.active !== 1,
                    })
                  }
                >
                  {value.active === 1 ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            ))}
          </Card>
        </div>
      ) : step === 'professionals' ? (
        <div className="gf-wizard-columns">
          <Card>
            <h2>
              <Users size={21} />
              {personId ? 'Editar profissional' : 'Novo profissional'}
            </h2>
            <p>
              {data.company.plan.code === 'individual'
                ? 'Até 1 profissional ativo. Inativos não ocupam vaga.'
                : 'Profissionais ativos ilimitados.'}
            </p>
            <form onSubmit={savePerson}>
              <fieldset disabled={busy} className="gf-wizard-fields">
                <legend className="gf-visually-hidden">Dados do profissional</legend>
                <Input
                  label="Nome do profissional"
                  value={person.name}
                  onChange={(e) => setPerson({ ...person, name: e.target.value })}
                  minLength={2}
                  maxLength={100}
                  required
                />
                <Input
                  label="Especialidade (opcional)"
                  value={person.specialty}
                  onChange={(e) => setPerson({ ...person, specialty: e.target.value })}
                  maxLength={200}
                />
                <label className="gf-check">
                  <input
                    type="checkbox"
                    checked={person.self}
                    onChange={(e) =>
                      setPerson({
                        ...person,
                        self: e.target.checked,
                        name: person.name || user!.name,
                      })
                    }
                  />
                  Eu também atendo (vincular minha conta)
                </label>
                <p className="gf-hint">Sem essa opção, o profissional é cadastrado sem login.</p>
                {!personId && (
                  <label className="gf-check">
                    <input
                      type="checkbox"
                      checked={person.active}
                      onChange={(e) => setPerson({ ...person, active: e.target.checked })}
                    />
                    Profissional ativo
                  </label>
                )}
                <fieldset className="gf-service-links">
                  <legend>Serviços realizados</legend>
                  {!data.services.length && <p>Cadastre serviços na etapa anterior.</p>}
                  {data.services.map((value) => (
                    <label className="gf-check" key={value.id}>
                      <input
                        type="checkbox"
                        checked={person.services.includes(value.id)}
                        onChange={(e) =>
                          setPerson({
                            ...person,
                            services: e.target.checked
                              ? [...person.services, value.id]
                              : person.services.filter((id) => id !== value.id),
                          })
                        }
                      />
                      {value.name}
                      {value.active !== 1 ? ' (inativo)' : ''}
                    </label>
                  ))}
                </fieldset>
              </fieldset>
              <Button type="submit" busy={busy}>
                {personId ? 'Salvar profissional' : 'Cadastrar profissional'}
              </Button>
              {personId && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setPersonId(null);
                    setPerson(emptyPerson);
                  }}
                >
                  Cancelar edição
                </Button>
              )}
            </form>
          </Card>
          <Card>
            <h2>Sua equipe</h2>
            {!data.professionals.length && <p>Nenhum profissional cadastrado.</p>}
            {data.professionals.map((value) => (
              <div className="gf-resource-row" key={value.id}>
                <div>
                  <strong>{value.name}</strong>
                  <p>
                    {value.active === 1 ? 'Ativo' : 'Inativo'} ·{' '}
                    {value.user_id ? 'Conta vinculada' : 'Sem login'}
                  </p>
                  <p>
                    {data.services
                      .filter((s) => value.services.includes(s.id))
                      .map((s) => s.name)
                      .join(', ') || 'Sem serviços associados'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={busy}
                  aria-label={`Editar ${value.name}`}
                  onClick={() => editPerson(value)}
                >
                  <Pencil size={16} />
                  Editar
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    mutate(`/professionals/${encodeURIComponent(value.id)}/status`, 'PATCH', {
                      active: value.active !== 1,
                    })
                  }
                >
                  {value.active === 1 ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            ))}
          </Card>
        </div>
      ) : step === 'schedule' ? (
        <Card>
          <h2>
            <Clock size={21} />
            Expediente por profissional
          </h2>
          <div className="gf-field">
            <label htmlFor="schedule-professional">Profissional</label>
            <select
              id="schedule-professional"
              value={selected}
              disabled={busy}
              onChange={(e) => setSelected(e.target.value)}
            >
              {!data.professionals.length && <option value="">Cadastre um profissional</option>}
              {data.professionals.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                </option>
              ))}
            </select>
          </div>
          {schedule && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void mutate(`/professionals/${encodeURIComponent(selected)}/schedule`, 'PUT', {
                  ...schedule.settings,
                  days: schedule.days,
                });
              }}
            >
              <fieldset disabled={busy} className="gf-wizard-fields">
                <legend className="gf-visually-hidden">Expediente semanal</legend>
                <div className="gf-field-pair">
                  <div className="gf-field">
                    <label htmlFor="schedule-mode">Abertura da agenda</label>
                    <select
                      id="schedule-mode"
                      value={schedule.settings.agenda_mode}
                      onChange={(e) =>
                        setSchedule({
                          ...schedule,
                          settings: {
                            ...schedule.settings,
                            agenda_mode: e.target.value as 'auto' | 'manual',
                          },
                        })
                      }
                    >
                      <option value="manual">Manual</option>
                      <option value="auto">Automática</option>
                    </select>
                  </div>
                  <Input
                    label="Dias úteis à frente"
                    type="number"
                    min={1}
                    max={90}
                    value={schedule.settings.max_days_ahead}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        settings: { ...schedule.settings, max_days_ahead: Number(e.target.value) },
                      })
                    }
                    required
                  />
                </div>
                {schedule.days.map((day, position) => (
                  <div className="gf-working-day" key={day.weekday}>
                    <label className="gf-check">
                      <input
                        type="checkbox"
                        checked={day.active}
                        onChange={(e) => dayChange(position, { active: e.target.checked })}
                      />
                      {weekdays[day.weekday]}
                    </label>
                    <div className="gf-field-pair">
                      <Input
                        label={`Início — ${weekdays[day.weekday]}`}
                        type="time"
                        value={day.start_time}
                        required
                        onChange={(e) => dayChange(position, { start_time: e.target.value })}
                      />
                      <Input
                        label={`Término — ${weekdays[day.weekday]}`}
                        type="time"
                        value={day.end_time}
                        required
                        onChange={(e) => dayChange(position, { end_time: e.target.value })}
                      />
                    </div>
                    {day.breaks.map((pause, i) => (
                      <div className="gf-pause-row" key={i}>
                        <Input
                          label={`Início da pausa ${i + 1} — ${weekdays[day.weekday]}`}
                          type="time"
                          value={pause.start_time}
                          required
                          onChange={(e) =>
                            dayChange(position, {
                              breaks: day.breaks.map((b, j) =>
                                j === i ? { ...b, start_time: e.target.value } : b,
                              ),
                            })
                          }
                        />
                        <Input
                          label={`Fim da pausa ${i + 1} — ${weekdays[day.weekday]}`}
                          type="time"
                          value={pause.end_time}
                          required
                          onChange={(e) =>
                            dayChange(position, {
                              breaks: day.breaks.map((b, j) =>
                                j === i ? { ...b, end_time: e.target.value } : b,
                              ),
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label={`Remover pausa ${i + 1} — ${weekdays[day.weekday]}`}
                          onClick={() =>
                            dayChange(position, { breaks: day.breaks.filter((_, j) => j !== i) })
                          }
                        >
                          Remover
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={day.breaks.length >= 4}
                      onClick={() =>
                        dayChange(position, {
                          breaks: [...day.breaks, { start_time: '12:00', end_time: '13:00' }],
                        })
                      }
                    >
                      <Plus size={15} />
                      Adicionar pausa — {weekdays[day.weekday]}
                    </Button>
                  </div>
                ))}
              </fieldset>
              <Button type="submit" busy={busy}>
                Salvar horários
              </Button>
            </form>
          )}
        </Card>
      ) : (
        <Card className="gf-review">
          <h2>Revise sua configuração</h2>
          <p>
            {data.company.name} · {data.company.plan.name} · {data.company.niche.name} ·{' '}
            {data.company.template.name}
          </p>
          <h3>Serviços</h3>
          <ul>
            {data.services.map((s) => (
              <li key={s.id}>
                {s.name} · {money(s.price)} · {s.duration} min ·{' '}
                {s.active === 1 ? 'Ativo' : 'Inativo'}
              </li>
            ))}
          </ul>
          <h3>Profissionais e horários</h3>
          {data.professionals.map((p) => (
            <div key={p.id}>
              <strong>
                {p.name} · {p.active === 1 ? 'Ativo' : 'Inativo'}
              </strong>
              <p>
                {data.services
                  .filter((s) => p.services.includes(s.id))
                  .map((s) => s.name)
                  .join(', ') || 'Sem serviços'}
              </p>
              <ul>
                {data.schedules
                  .find((s) => s.professionalId === p.id)
                  ?.days.filter((d) => d.active)
                  .map((d) => (
                    <li key={d.weekday}>
                      {weekdays[d.weekday]}: {d.start_time}–{d.end_time}
                      {d.breaks.length
                        ? ` · Pausas: ${d.breaks.map((b) => `${b.start_time}–${b.end_time}`).join(', ')}`
                        : ''}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {data.issues.length > 0 && (
            <Feedback>
              <ul>
                {data.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Feedback>
          )}
          <p>
            O trial começa somente ao confirmar abaixo. Nenhuma cobrança, cartão ou publicação
            automática.
          </p>
          <Button
            busy={busy}
            disabled={data.issues.length > 0}
            onClick={() => mutate('/complete', 'POST', {})}
          >
            Concluir configuração e iniciar 7 dias grátis
          </Button>
        </Card>
      )}
      <div className="gf-wizard-bottom">
        <Button
          variant="secondary"
          disabled={busy || index === 0}
          onClick={() => mutate('/progress', 'PUT', { step: steps[index - 1] })}
        >
          <ArrowLeft size={17} />
          Voltar
        </Button>
        {index < 3 && (
          <Button
            disabled={busy}
            onClick={() => mutate('/progress', 'PUT', { step: steps[index + 1] })}
          >
            Continuar <ArrowRight size={17} />
          </Button>
        )}
      </div>
    </div>
  );
}
export function Completed({ placeholder = false }: { placeholder?: boolean }) {
  const { business } = useOutletContext<{ business: PendingBusiness | null }>();
  if (!business) return <Loading />;
  if (business.onboardingStatus !== 'completed')
    return (
      <div className="gf-ready">
        <Card>
          <h1>Revise sua configuração</h1>
          <p>Configure serviços, profissionais e horários antes de iniciar o trial.</p>
          <ButtonLink to="/app/onboarding/operations">Retomar configuração</ButtonLink>
        </Card>
      </div>
    );
  const active =
    business.trial?.status === 'trialing' && Date.parse(business.trial.trial_ends_at) > Date.now();
  return (
    <div className="gf-ready">
      <Card>
        <span className="gf-ready-icon">
          <Check size={28} />
        </span>
        <div className="gf-kicker">{business.name}</div>
        <h1>{placeholder ? 'Personalização do seu site' : 'Sua empresa está configurada!'}</h1>
        <p>
          Plano {business.plan.name} · {business.template.name}
        </p>
        <Feedback success>
          {active
            ? '7 dias gratuitos ativos.'
            : 'Configuração concluída. Seu período grátis terminou.'}
        </Feedback>
        {business.trial && (
          <p>
            Período:{' '}
            {new Date(business.trial.trial_started_at).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
            })}{' '}
            até{' '}
            {new Date(business.trial.trial_ends_at).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
            })}{' '}
            (horário de Brasília).
          </p>
        )}
        <p>Empresa criada com sucesso. Seu site ainda não foi publicado.</p>
        {placeholder ? (
          <>
            <p>A personalização estará disponível na Fase 7E.</p>
            <ButtonLink to="/app/onboarding/complete" variant="secondary">
              Voltar para minha empresa
            </ButtonLink>
          </>
        ) : (
          <ButtonLink to="/app/onboarding/site">Personalizar meu site</ButtonLink>
        )}
        <ButtonLink to="/app/conta" variant="secondary">
          Voltar para minha conta
        </ButtonLink>
      </Card>
    </div>
  );
}
