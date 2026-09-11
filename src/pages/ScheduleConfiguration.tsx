import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Copy, MessageCircle, Plus, Save, Trash2 } from 'lucide-react';
import { api, errorMessage, formatDate } from '../lib';
import type { Barber, ScheduleSettings, WeekShare, WorkingDay } from '../types';
import { ErrorBox, Modal, PageHeading, Spinner } from '../components/UI';

const dayNames = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
const shortDate = (date: string) =>
  formatDate(date, { day: '2-digit', month: '2-digit', year: 'numeric' });

export function ScheduleConfiguration() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [barber, setBarber] = useState('');
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api<Barber[]>('/barbers', { signal: controller.signal })
      .then((people) => {
        setBarbers(people);
        setBarber(people[0]?.id || '');
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [retry]);
  return (
    <>
      <PageHeading eyebrow="FUNCIONAMENTO E ABERTURA" title="Configuração da agenda">
        <Link to="/admin/agenda" className="button ghost">
          <ArrowLeft size={16} />
          Voltar à agenda
        </Link>
      </PageHeading>
      <ErrorBox message={error} />
      {error && (
        <button className="button ghost" onClick={() => setRetry((n) => n + 1)}>
          Tentar novamente
        </button>
      )}
      <label className="schedule-professional">
        Profissional
        <select value={barber} disabled={locked} onChange={(e) => setBarber(e.target.value)}>
          {barbers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {barber && <ScheduleForm key={barber} barberId={barber} onLock={setLocked} />}
    </>
  );
}

function ScheduleForm({ barberId, onLock }: { barberId: string; onLock(value: boolean): void }) {
  const [data, setData] = useState<ScheduleSettings | null>(null);
  const [saved, setSaved] = useState<ScheduleSettings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<WeekShare | null>(null);
  const [copyError, setCopyError] = useState('');
  const [copied, setCopied] = useState(false);
  const operation = useRef(false);
  const dirty = JSON.stringify(data) !== JSON.stringify(saved);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const current = await api<ScheduleSettings>(`/admin/barbers/${barberId}/schedule`, {
        signal,
      });
      setData(current);
      setSaved(current);
    },
    [barberId],
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(errorMessage(e));
    });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    onLock(dirty || busy);
    return () => onLock(false);
  }, [dirty, busy, onLock]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function updateDay(index: number, update: Partial<WorkingDay>) {
    setData(
      (d) =>
        d && {
          ...d,
          days: d.days.map((day) => (day.weekday === index ? { ...day, ...update } : day)),
        },
    );
    setNotice('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!data || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/admin/barbers/${barberId}/schedule`, {
        method: 'PUT',
        body: JSON.stringify({ ...data.settings, days: data.days }),
        signal: AbortSignal.timeout(30000),
      });
      await load();
      setNotice('Configurações salvas. Os novos agendamentos já seguem esta grade.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function release() {
    if (!data?.next_week || dirty || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<WeekShare>(`/admin/barbers/${barberId}/released-weeks`, {
        method: 'POST',
        body: JSON.stringify({
          week_start: data.next_week.week_start,
          version: data.settings.version,
        }),
        signal: AbortSignal.timeout(30000),
      });
      setShare(result);
      setCopied(false);
      setCopyError('');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      await load();
      setNotice('Configurações atualizadas.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  if (!data)
    return error ? (
      <>
        <ErrorBox message={error} />
        <button className="button ghost" onClick={reload}>
          Tentar novamente
        </button>
      </>
    ) : (
      <Spinner />
    );
  return (
    <>
      <form onSubmit={save} className="schedule-settings form-stack">
        <fieldset disabled={busy} className="panel schedule-mode">
          <legend>Modo de abertura</legend>
          <div className="schedule-mode-options">
            <label>
              <input
                type="radio"
                name="agenda_mode"
                value="auto"
                checked={data.settings.agenda_mode === 'auto'}
                onChange={() =>
                  setData({ ...data, settings: { ...data.settings, agenda_mode: 'auto' } })
                }
              />
              <span>
                <strong>Automático</strong>
                <small>Novos dias são liberados conforme o tempo passa.</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="agenda_mode"
                value="manual"
                checked={data.settings.agenda_mode === 'manual'}
                onChange={() =>
                  setData({ ...data, settings: { ...data.settings, agenda_mode: 'manual' } })
                }
              />
              <span>
                <strong>Manual por semana</strong>
                <small>Você escolhe quando abrir cada período.</small>
              </span>
            </label>
          </div>
          {data.settings.agenda_mode === 'auto' ? (
            <label className="schedule-window">
              Dias de funcionamento disponíveis à frente
              <input
                type="number"
                min={1}
                max={90}
                required
                value={data.settings.max_days_ahead}
                onChange={(e) =>
                  setData({
                    ...data,
                    settings: { ...data.settings, max_days_ahead: Number(e.target.value) },
                  })
                }
              />
              <small>Conta hoje, se for dia ativo. Dias de folga não entram na contagem.</small>
            </label>
          ) : (
            <p className="muted">
              Somente semanas liberadas aceitam novas reservas. Agendamentos existentes são
              preservados.
            </p>
          )}
        </fieldset>
        <fieldset disabled={busy} className="panel schedule-hours">
          <legend>Grade de funcionamento</legend>
          <p className="muted">
            Horários de Brasília. Cada serviço precisa caber inteiro entre os intervalos e o fim do
            expediente.
          </p>
          {[1, 2, 3, 4, 5, 6, 0].map((index) => {
            const day = data.days.find((d) => d.weekday === index)!;
            return (
              <div className={`schedule-day ${day.active ? '' : 'off'}`} key={index}>
                <label className="schedule-day-toggle">
                  <input
                    type="checkbox"
                    checked={day.active}
                    onChange={(e) => updateDay(index, { active: e.target.checked })}
                  />
                  <strong>{dayNames[index]}</strong>
                  <span>{day.active ? 'Aberto' : 'Folga'}</span>
                </label>
                {day.active && (
                  <div className="schedule-day-fields">
                    <div className="schedule-time-pair">
                      <label>
                        Início do expediente
                        <input
                          aria-label={`Início do expediente ${dayNames[index]}`}
                          type="time"
                          required
                          value={day.start_time}
                          onChange={(e) => updateDay(index, { start_time: e.target.value })}
                        />
                      </label>
                      <label>
                        Fim do expediente
                        <input
                          aria-label={`Fim do expediente ${dayNames[index]}`}
                          type="time"
                          required
                          value={day.end_time}
                          onChange={(e) => updateDay(index, { end_time: e.target.value })}
                        />
                      </label>
                    </div>
                    {day.breaks.map((interval, i) => (
                      <div className="schedule-break" key={i}>
                        <div className="schedule-time-pair">
                          <label>
                            Início do intervalo {i + 1}
                            <input
                              aria-label={`Início do intervalo ${i + 1} ${dayNames[index]}`}
                              type="time"
                              required
                              value={interval.start_time}
                              onChange={(e) =>
                                updateDay(index, {
                                  breaks: day.breaks.map((b, n) =>
                                    n === i ? { ...b, start_time: e.target.value } : b,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            Fim do intervalo {i + 1}
                            <input
                              aria-label={`Fim do intervalo ${i + 1} ${dayNames[index]}`}
                              type="time"
                              required
                              value={interval.end_time}
                              onChange={(e) =>
                                updateDay(index, {
                                  breaks: day.breaks.map((b, n) =>
                                    n === i ? { ...b, end_time: e.target.value } : b,
                                  ),
                                })
                              }
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Remover intervalo ${i + 1} ${dayNames[index]}`}
                          onClick={() =>
                            updateDay(index, { breaks: day.breaks.filter((_, n) => n !== i) })
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-link"
                      disabled={day.breaks.length >= 4}
                      onClick={() =>
                        updateDay(index, {
                          breaks: [...day.breaks, { start_time: '12:20', end_time: '14:00' }],
                        })
                      }
                    >
                      <Plus size={15} />
                      Adicionar intervalo
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>
        <ErrorBox message={error} />
        {notice && (
          <p role="status" className="schedule-notice">
            {notice}
          </p>
        )}
        <div className="schedule-actions">
          <button className="button primary" disabled={!dirty || busy}>
            <Save size={17} />
            {busy ? 'Aguarde...' : 'Salvar configurações'}
          </button>
          <button type="button" className="button ghost" disabled={busy} onClick={reload}>
            {dirty ? 'Descartar alterações e atualizar' : 'Atualizar configurações'}
          </button>
        </div>
      </form>
      {data.settings.agenda_mode === 'manual' && (
        <div className="panel schedule-release">
          <h2>Abertura de semanas</h2>
          {dirty && <p className="muted">Salve as configurações antes de liberar a semana.</p>}
          {data.next_week && (
            <button className="button primary" disabled={dirty || busy} onClick={release}>
              <CalendarPlus size={18} />
              Liberar próxima semana ({shortDate(data.next_week.start_date)} a{' '}
              {shortDate(data.next_week.end_date)})
            </button>
          )}
          <div className="released-periods">
            {data.released_weeks.map((w) => (
              <p key={w.week_start}>
                Liberada: {shortDate(w.start_date)} a {shortDate(w.end_date)}
              </p>
            ))}
          </div>
        </div>
      )}
      {share && (
        <Modal title="Semana liberada!" onClose={() => setShare(null)}>
          <p>
            {shortDate(share.start_date)} a {shortDate(share.end_date)}
          </p>
          <label className="share-link">
            Link de agendamento
            <input readOnly value={share.url} onFocus={(e) => e.target.select()} />
          </label>
          <ErrorBox message={copyError} />
          {copied && <p role="status">Link copiado!</p>}
          <div className="schedule-actions">
            <button
              className="button ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(share.url);
                  setCopied(true);
                  setCopyError('');
                } catch {
                  setCopyError(
                    'Selecione e copie o link acima. Seu navegador não permitiu a cópia automática.',
                  );
                }
              }}
            >
              <Copy size={16} />
              Copiar Link
            </button>
            <a
              className="button primary"
              target="_blank"
              rel="noopener noreferrer"
              href={share.whatsapp_url}
            >
              <MessageCircle size={17} />
              Enviar no WhatsApp
            </a>
          </div>
        </Modal>
      )}
    </>
  );
}
