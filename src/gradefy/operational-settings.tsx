import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Save, Settings2 } from 'lucide-react';
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
    [revision, setRevision] = useState(0);
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
        <header className="gf-agenda-heading">
          <div>
            <div className="gf-kicker">FUNCIONAMENTO E RESERVAS</div>
            <h1>Configurações operacionais</h1>
            <p>Seu estabelecimento, suas regras.</p>
          </div>
          <Settings2 size={28} />
        </header>
        <CompanySelector companies={companies} value={companyId} choose={choose} />
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
          <form onSubmit={save}>
            {!snapshot?.editable && (
              <Feedback>A assinatura permite apenas consultar estas configurações.</Feedback>
            )}
            <Card>
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
            <Card>
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
            </Card>
            <Card>
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
                      field('maximum_booking_days', e.target.value ? Number(e.target.value) : null)
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
                O intervalo ocupa tempo entre reservas; não altera a duração nem o valor do serviço.
                Pausas fixas não recebem um intervalo extra.
              </p>
            </Card>
            <Card>
              <h2>Cancelamento e reagendamento</h2>
              <p>
                Prazos para ações do cliente, medidos até o início da reserva. A gestão mantém suas
                permissões e nenhum pagamento será alterado automaticamente.
              </p>
              <div className="gf-settings-grid">
                {numeric('cancel_notice_minutes', 'Antecedência mínima para cancelar', 10080)}
                {numeric('reschedule_notice_minutes', 'Antecedência mínima para reagendar', 10080)}
              </div>
            </Card>
            <Card>
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
            <div className="gf-settings-save">
              <Button type="submit" disabled={!snapshot?.editable} busy={busy}>
                <Save size={18} />
                Salvar configurações
              </Button>
              <Feedback>{error}</Feedback>
              <Feedback success>{notice}</Feedback>
            </div>
          </form>
        )}
      </div>
      <BusinessNav companyId={companyId} mobile />
    </div>
  );
}
