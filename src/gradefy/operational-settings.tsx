import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Building2,
  CreditCard,
  Save,
  Scissors,
  Settings2,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { useApp } from '../context';
import { ApiError, errorMessage } from '../lib';
import type { WorkingDay } from '../types';
import { Button, Card, Feedback, Input, Loading } from './components';
import { BusinessNav } from './business-nav';
import { CompanySelector, ManagementAccess } from './management';
import type { ManagementProps } from './management';
import './dashboard.css';
import './agenda.css';
import './operational-settings.css';
import './settings-desktop.css';
type Settings = {
  version: number;
  site_version: number;
  name: string;
  phone: string;
  address: string;
  timezone: string;
  working_days: WorkingDay[] | null;
  minimum_notice_minutes: number;
  maximum_booking_days: number | null;
  buffer_minutes: number;
  cancel_notice_minutes: number;
  reschedule_notice_minutes: number;
  online_booking_enabled: boolean;
};
type Snapshot = Settings & {
  editable: boolean;
  timezoneLocked: boolean;
  professionals: { id: string; name: string; active: number }[];
};
const names = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
const defaults = () =>
  names.map((_, weekday) => ({
    weekday,
    active: weekday !== 0,
    start_time: '09:00',
    end_time: '19:00',
    breaks: [],
  }));
function displayPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}
export default function OperationalSettings() {
  return <ManagementAccess>{(p) => <SettingsForm {...p} />}</ManagementAccess>;
}
function SettingsForm({ companyId, companies, choose }: ManagementProps) {
  const { api } = useApp();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [value, setValue] = useState<Settings | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [hoursExpanded, setHoursExpanded] = useState(false);
  const role = companies.find((company) => company.id === companyId)?.role;
  const companyPath = '?empresa=' + encodeURIComponent(companyId);
  const dirty = Boolean(
    value &&
    snapshot &&
    JSON.stringify(value) !==
      JSON.stringify(
        (({
          editable: _editable,
          timezoneLocked: _timezoneLocked,
          professionals: _professionals,
          ...fields
        }) => fields)(snapshot),
      ),
  );
  const working = useRef(false);
  const selectedCompany = useRef(companyId);
  selectedCompany.current = companyId;
  useEffect(() => {
    const c = new AbortController();
    setValue(null);
    setSnapshot(null);
    setError('');
    setNotice('');
    api<Snapshot>('/admin/settings', {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted) {
          setSnapshot(r);
          const {
            editable: _editable,
            timezoneLocked: _timezoneLocked,
            professionals: _professionals,
            ...fields
          } = r;
          setValue(fields);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [api, companyId, revision]);
  function field<K extends keyof Settings>(key: K, next: Settings[K]) {
    if (value) setValue({ ...value, [key]: next });
    setNotice('');
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (working.current || !value) return;
    working.current = true;
    const savingCompany = companyId;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<Snapshot>('/admin/settings', {
        method: 'PUT',
        headers: { 'X-Gradefy-Company-Id': companyId },
        body: JSON.stringify(value),
      });
      if (selectedCompany.current !== savingCompany) return;
      setSnapshot(result);
      setValue({
        ...value,
        version: result.version,
        site_version: result.site_version,
        phone: result.phone,
      });
      setNotice('Configurações salvas. As regras já estão valendo para novas reservas.');
    } catch (e) {
      if (selectedCompany.current === savingCompany)
        setError(
          e instanceof ApiError && e.details.length
            ? `${e.message} ${[...new Set(e.details.map((d) => d.message))].join(' ')}`
            : errorMessage(e),
        );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function dayField(index: number, patch: Partial<WorkingDay>) {
    if (value?.working_days)
      field(
        'working_days',
        value.working_days.map((d, i) => (i === index ? { ...d, ...patch } : d)),
      );
  }
  const disabled = busy || !snapshot?.editable;
  const numeric = (
    key:
      | 'minimum_notice_minutes'
      | 'buffer_minutes'
      | 'cancel_notice_minutes'
      | 'reschedule_notice_minutes',
    label: string,
    max: number,
  ) =>
    value && (
      <Input
        label={label}
        type="number"
        min={0}
        max={max}
        step={1}
        required
        disabled={disabled}
        value={Number.isFinite(value[key]) ? value[key] : ''}
        onChange={(e) => field(key, e.target.value === '' ? NaN : Number(e.target.value))}
        hint="Em minutos. Zero mantém a regra anterior."
      />
    );
  return (
    <div className="gf-dashboard gf-business gf-operational-settings">
      <BusinessNav companyId={companyId} />
      <div className="gf-dashboard-main">
        <div className="gf-settings-toolbar">
          <header className="gf-agenda-heading">
            <div>
              <div className="gf-kicker">FUNCIONAMENTO E RESERVAS</div>
              <h1>Configurações operacionais</h1>
              <p>Seu estabelecimento, suas regras.</p>
            </div>
            <Settings2 size={28} />
          </header>
          <CompanySelector companies={companies} value={companyId} choose={choose} />
        </div>
        <Feedback>{error}</Feedback>
        <Feedback success>{notice}</Feedback>
        <Button variant="secondary" disabled={busy} onClick={() => setRevision((n) => n + 1)}>
          Recarregar configurações
        </Button>
        {!value ? (
          error ? (
            <Card>
              <p>Recarregue as configurações para tentar novamente.</p>
            </Card>
          ) : (
            <Loading label="Carregando configurações…" />
          )
        ) : (
          <>
            <Card className="gf-settings-profile">
              <span className="gf-settings-profile-icon">
                <Building2 size={34} aria-hidden="true" />
              </span>
              <div>
                <span className="gf-kicker">SEU ESTABELECIMENTO</span>
                <h2>{value.name}</h2>
                <p>
                  {value.address || 'Endereço ainda não informado'} · {value.timezone}
                </p>
                <small>
                  {value.phone ? displayPhone(value.phone) : 'Telefone ainda não informado'} ·{' '}
                  {snapshot?.professionals.length || 0} profissional(is) cadastrado(s)
                </small>
              </div>
              <Link to={'/app/meu-site' + companyPath}>
                Editar apresentação pública <ArrowRight size={16} />
              </Link>
            </Card>
            <form className="gf-settings-desktop-grid" onSubmit={save}>
              {!snapshot?.editable && (
                <Feedback>A assinatura permite apenas consultar estas configurações.</Feedback>
              )}
              <Card className="gf-settings-business-card">
                <h2>Informações do estabelecimento</h2>
                <p>
                  Nome e contatos usam os mesmos dados de Meu Site. Cores, fotos e publicação são
                  preservadas.
                </p>
                <div className="gf-settings-grid">
                  <Input
                    label="Nome de exibição"
                    required
                    minLength={2}
                    maxLength={100}
                    disabled={disabled}
                    value={value.name}
                    onChange={(e) => field('name', e.target.value)}
                  />
                  <Input
                    label="Telefone"
                    type="tel"
                    maxLength={30}
                    disabled={disabled}
                    value={value.phone}
                    onChange={(e) => field('phone', e.target.value)}
                  />
                  <Input
                    label="Endereço"
                    maxLength={250}
                    disabled={disabled}
                    value={value.address}
                    onChange={(e) => field('address', e.target.value)}
                  />
                  <Input
                    label="Fuso horário"
                    list="gf-timezones"
                    required
                    disabled={disabled || snapshot?.timezoneLocked}
                    value={value.timezone}
                    onChange={(e) => field('timezone', e.target.value)}
                    hint={
                      snapshot?.timezoneLocked
                        ? 'Fuso protegido: existem reservas com horários locais neste estabelecimento.'
                        : 'Fuso IANA. Defina antes da primeira reserva.'
                    }
                  />
                  <datalist id="gf-timezones">
                    <option value="America/Sao_Paulo" />
                    <option value="America/Manaus" />
                    <option value="America/Recife" />
                    <option value="America/Rio_Branco" />
                    <option value="America/Noronha" />
                  </datalist>
                </div>
              </Card>
              <Card className="gf-settings-link-card gf-settings-team-card">
                <div className="gf-settings-link-heading">
                  <UsersRound size={23} />
                  <div>
                    <h2>Equipe e permissões</h2>
                    <p>Profissionais, vínculos e acesso à empresa.</p>
                  </div>
                </div>
                <p>
                  {snapshot?.professionals.length || 0} profissional(is) cadastrado(s). Um gestor
                  pode ter acesso sem realizar atendimentos.
                </p>
                <div className="gf-settings-link-actions">
                  <Link to={'/app/profissionais' + companyPath}>
                    Gerenciar profissionais <ArrowRight size={16} />
                  </Link>
                  {role === 'owner' && (
                    <Link to={'/app/equipe' + companyPath}>
                      Gerenciar acessos <ArrowRight size={16} />
                    </Link>
                  )}
                </div>
              </Card>
              <Card className="gf-settings-hours-card">
                <h2>Horário de funcionamento</h2>
                <p>
                  Os horários da empresa limitam o expediente de cada profissional. Pausas, folgas e
                  bloqueios individuais continuam valendo. Reservas existentes serão preservadas.
                </p>
                <label className="gf-settings-toggle">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={value.working_days === null}
                    onChange={(e) => field('working_days', e.target.checked ? null : defaults())}
                  />
                  Usar somente os expedientes dos profissionais
                </label>
                <div
                  className="gf-settings-hours-summary"
                  aria-label="Resumo do horário de funcionamento"
                >
                  {value.working_days ? (
                    value.working_days.map((day) => (
                      <div key={day.weekday}>
                        <strong>{names[day.weekday]}</strong>
                        <span>
                          {day.active
                            ? `${day.start_time}–${day.end_time}${day.breaks.length ? ` · ${day.breaks.map((pause) => `${pause.start_time}–${pause.end_time}`).join(', ')}` : ''}`
                            : 'Fechado'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p>Funcionamento definido pelos expedientes individuais dos profissionais.</p>
                  )}
                </div>
                <button
                  className="gf-settings-hours-toggle"
                  type="button"
                  aria-expanded={hoursExpanded}
                  aria-controls="gf-settings-hours-details"
                  onClick={() => {
                    if (hoursExpanded) {
                      const invalid = document.querySelector<HTMLElement>(
                        '#gf-settings-hours-details :invalid',
                      );
                      if (invalid) {
                        invalid.focus();
                        return;
                      }
                    }
                    setHoursExpanded((open) => !open);
                  }}
                >
                  {hoursExpanded
                    ? 'Recolher edição dos horários'
                    : 'Editar horários de funcionamento'}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
                <div
                  id="gf-settings-hours-details"
                  className="gf-settings-hours-details"
                  data-expanded={hoursExpanded}
                >
                  {value.working_days?.map((day, index) => (
                    <div className="gf-settings-day" key={day.weekday}>
                      <label className="gf-settings-toggle">
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={day.active}
                          onChange={(e) => dayField(index, { active: e.target.checked })}
                        />
                        {names[day.weekday]}
                      </label>
                      <div className="gf-settings-grid">
                        <Input
                          label={`Abertura — ${names[day.weekday]}`}
                          type="time"
                          required
                          disabled={disabled || !day.active}
                          value={day.start_time}
                          onChange={(e) => dayField(index, { start_time: e.target.value })}
                        />
                        <Input
                          label={`Encerramento — ${names[day.weekday]}`}
                          type="time"
                          required
                          disabled={disabled || !day.active}
                          value={day.end_time}
                          onChange={(e) => dayField(index, { end_time: e.target.value })}
                        />
                      </div>
                      {day.active && (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={disabled || day.breaks.length >= 4}
                            onClick={() =>
                              dayField(index, {
                                breaks: [...day.breaks, { start_time: '12:00', end_time: '13:00' }],
                              })
                            }
                          >
                            Adicionar pausa — {names[day.weekday]}
                          </Button>
                          {day.breaks.map((pause, at) => (
                            <div className="gf-settings-grid" key={at}>
                              <Input
                                label={`Início da pausa ${at + 1} — ${names[day.weekday]}`}
                                type="time"
                                required
                                disabled={disabled}
                                value={pause.start_time}
                                onChange={(e) =>
                                  dayField(index, {
                                    breaks: day.breaks.map((b, i) =>
                                      i === at ? { ...b, start_time: e.target.value } : b,
                                    ),
                                  })
                                }
                              />
                              <Input
                                label={`Fim da pausa ${at + 1} — ${names[day.weekday]}`}
                                type="time"
                                required
                                disabled={disabled}
                                value={pause.end_time}
                                onChange={(e) =>
                                  dayField(index, {
                                    breaks: day.breaks.map((b, i) =>
                                      i === at ? { ...b, end_time: e.target.value } : b,
                                    ),
                                  })
                                }
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={disabled}
                                onClick={() =>
                                  dayField(index, { breaks: day.breaks.filter((_, i) => i !== at) })
                                }
                              >
                                Remover pausa {at + 1} — {names[day.weekday]}
                              </Button>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  ))}
                  <p>Expedientes individuais:</p>
                  {snapshot?.professionals.map((p) => (
                    <Link
                      className="gf-settings-professional"
                      key={p.id}
                      to={`/app/profissionais?empresa=${encodeURIComponent(companyId)}`}
                    >
                      {p.name}
                      {p.active ? '' : ' (inativo)'} — gerenciar horário
                    </Link>
                  ))}
                </div>
              </Card>
              <Card className="gf-settings-link-card gf-settings-services-card">
                <div className="gf-settings-link-heading">
                  <Scissors size={23} />
                  <div>
                    <h2>Serviços e preços</h2>
                    <p>Catálogo, duração e profissionais habilitados.</p>
                  </div>
                </div>
                <Link to={'/app/servicos' + companyPath}>
                  Abrir catálogo de serviços <ArrowRight size={16} />
                </Link>
              </Card>
              <Card className="gf-settings-booking-card">
                <h2>Regras de agendamento</h2>
                <p>
                  Antecedência e janela valem para reservas públicas. A gestão pode reservar fora
                  desses prazos, respeitando expediente, pausas, intervalos e conflitos.
                </p>
                <div className="gf-settings-grid">
                  {numeric('minimum_notice_minutes', 'Antecedência mínima da reserva', 10080)}
                  <label className="gf-field">
                    Janela máxima de reservas
                    <select
                      value={value.maximum_booking_days ?? ''}
                      disabled={disabled}
                      onChange={(e) =>
                        field(
                          'maximum_booking_days',
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                    >
                      <option value="">Usar janela do profissional</option>
                      {[7, 15, 30, 60, 90].map((days) => (
                        <option value={days} key={days}>
                          {days} dias corridos à frente
                        </option>
                      ))}
                    </select>
                  </label>
                  {numeric('buffer_minutes', 'Intervalo entre atendimentos', 180)}
                </div>
                <p>
                  O intervalo ocupa tempo entre reservas; não altera a duração nem o valor do
                  serviço. Pausas fixas não recebem um intervalo extra.
                </p>
              </Card>
              <Card className="gf-settings-link-card gf-settings-finance-card">
                <div className="gf-settings-link-heading">
                  <CreditCard size={23} />
                  <div>
                    <h2>Pagamentos e financeiro</h2>
                    <p>Lançamentos manuais, despesas e histórico.</p>
                  </div>
                </div>
                <p>
                  Registros financeiros do estabelecimento; não são cobranças da assinatura Gradefy.
                </p>
                <Link to={'/app/financeiro' + companyPath}>
                  Abrir Financeiro <ArrowRight size={16} />
                </Link>
              </Card>
              <Card className="gf-settings-cancel-card">
                <h2>Cancelamento e reagendamento</h2>
                <p>
                  Prazos para ações do cliente, medidos até o início da reserva. A gestão mantém
                  suas permissões e nenhum pagamento será alterado automaticamente.
                </p>
                <div className="gf-settings-grid">
                  {numeric('cancel_notice_minutes', 'Antecedência mínima para cancelar', 10080)}
                  {numeric(
                    'reschedule_notice_minutes',
                    'Antecedência mínima para reagendar',
                    10080,
                  )}
                </div>
              </Card>
              <Card className="gf-settings-link-card gf-settings-notices-card">
                <div className="gf-settings-link-heading">
                  <Bell size={23} />
                  <div>
                    <h2>Notificações</h2>
                    <p>Acompanhe envios e eventos reais do estabelecimento.</p>
                  </div>
                </div>
                <p>
                  O envio de e-mail depende da configuração do ambiente e do domínio. Consulte o
                  estado atual no painel.
                </p>
                <Link to={'/app/dashboard' + companyPath + '#dashboard-email-notifications'}>
                  Ver notificações <ArrowRight size={16} />
                </Link>
              </Card>
              <Card className="gf-settings-online-card">
                <h2>Agendamentos online</h2>
                <label className="gf-settings-toggle">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={value.online_booking_enabled}
                    onChange={(e) => field('online_booking_enabled', e.target.checked)}
                  />
                  Aceitar agendamentos online
                </label>
                <p>
                  {value.online_booking_enabled
                    ? 'Reservas online ativadas.'
                    : 'Reservas online pausadas.'}{' '}
                  Seu site permanece publicado. A agenda administrativa e as reservas existentes
                  continuam disponíveis.
                </p>
                <Link to={'/app/meu-site?empresa=' + encodeURIComponent(companyId)}>
                  Gerenciar publicação em Meu Site
                </Link>
              </Card>
              <Card className="gf-settings-link-card gf-settings-security-card">
                <div className="gf-settings-link-heading">
                  <ShieldCheck size={23} />
                  <div>
                    <h2>Segurança da conta</h2>
                    <p>Perfil, senha e sessões da sua conta Gradefy.</p>
                  </div>
                </div>
                <Link to="/app/conta">
                  Abrir Minha conta <ArrowRight size={16} />
                </Link>
              </Card>
              <div className="gf-settings-save">
                {dirty && <p role="status">Alterações pendentes de salvamento.</p>}
                {dirty && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (!snapshot) return;
                      const {
                        editable: _editable,
                        timezoneLocked: _timezoneLocked,
                        professionals: _professionals,
                        ...fields
                      } = snapshot;
                      setValue(fields);
                      setNotice('Alterações locais descartadas.');
                    }}
                  >
                    Descartar alterações
                  </Button>
                )}
                <Button type="submit" disabled={!snapshot?.editable} busy={busy}>
                  <Save size={18} />
                  Salvar configurações
                </Button>
                <Feedback>{error}</Feedback>
                <Feedback success>{notice}</Feedback>
              </div>
            </form>
          </>
        )}
      </div>
      <BusinessNav companyId={companyId} mobile />
    </div>
  );
}
