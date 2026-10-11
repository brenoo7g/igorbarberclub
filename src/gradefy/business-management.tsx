import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Pencil,
  UserRound,
  Scissors,
  UsersRound,
  Search,
  CalendarDays,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context';
import { errorMessage, money, newIdempotencyKey, statusLabels } from '../lib';
import { Modal } from '../components/UI';
import { Button, Card, Feedback, Input, Loading } from './components';
import { ManagementAccess, CompanySelector } from './management';
import type { ManagementProps } from './management';
import { BusinessNav } from './business-nav';
import type {
  BusinessAccess,
  Client,
  ClientList,
  ClientDetail,
  Service,
  Professional,
  WorkingSchedule,
  WorkingDay,
} from './business-types';
import './dashboard.css';
import './agenda.css';
import './business-management.css';
type Kind = 'clients' | 'services' | 'professionals';
const names = { clients: 'Clientes', services: 'Serviços', professionals: 'Profissionais' },
  singular = { clients: 'cliente', services: 'serviço', professionals: 'profissional' };
export function Clients() {
  return <ManagementAccess>{(p) => <ResourcePage {...p} kind="clients" />}</ManagementAccess>;
}
export function Services() {
  return <ManagementAccess>{(p) => <ResourcePage {...p} kind="services" />}</ManagementAccess>;
}
export function Professionals() {
  return <ManagementAccess>{(p) => <ResourcePage {...p} kind="professionals" />}</ManagementAccess>;
}
function ResourcePage({ companyId, companies, choose, kind }: ManagementProps & { kind: Kind }) {
  const { api } = useApp(),
    [params, setParams] = useSearchParams();
  const [access, setAccess] = useState<BusinessAccess | null>(null),
    [clients, setClients] = useState<ClientList | null>(null),
    [services, setServices] = useState<Service[]>([]),
    [professionals, setProfessionals] = useState<Professional[]>([]);
  const [q, setQ] = useState(''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [form, setForm] = useState<null | {
      client?: Client;
      service?: Service;
      professional?: Professional;
    }>(null),
    [detail, setDetail] = useState(params.get('cliente') || ''),
    [schedule, setSchedule] = useState(params.get('horarios') || ''),
    [confirm, setConfirm] = useState<Service | Professional | null>(null),
    [mutating, setMutating] = useState(false);
  const working = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setError('');
    const options = { headers: { 'X-Gradefy-Company-Id': companyId }, signal: c.signal };
    const load = async () => {
      const a = await api<BusinessAccess>('/admin/management', options);
      if (kind === 'clients') {
        const list = await api<ClientList>(
          '/admin/clients?' + new URLSearchParams({ q, page: String(page) }),
          options,
        );
        if (!c.signal.aborted) {
          setClients(list);
          const last = Math.max(1, Math.ceil(list.total / list.pageSize));
          if (page > last) setPage(last);
        }
      } else {
        const [s, p] = await Promise.all([
          api<Service[]>('/admin/services', options),
          api<Professional[]>('/admin/professionals', options),
        ]);
        if (!c.signal.aborted) {
          setServices(s);
          setProfessionals(p);
        }
      }
      if (!c.signal.aborted) setAccess(a);
    };
    void load()
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(errorMessage(e));
          setAccess(null);
          setClients(null);
          setServices([]);
          setProfessionals([]);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [api, companyId, kind, page, q, revision]);
  function close() {
    setForm(null);
    setDetail('');
    setSchedule('');
    setParams({ empresa: companyId }, { replace: true });
  }
  function changed(message: string) {
    close();
    setNotice(message);
    setRevision((r) => r + 1);
    window.dispatchEvent(new Event('gradefy-agenda-changed'));
  }
  async function toggle() {
    if (!confirm || working.current) return;
    working.current = true;
    setMutating(true);
    setError('');
    try {
      if (kind === 'services') {
        const s = confirm as Service;
        await api('/admin/services/' + s.id + '/status', {
          method: 'PATCH',
          headers: { 'X-Gradefy-Company-Id': companyId },
          body: JSON.stringify({
            active: !s.active,
          }),
        });
      } else
        await api('/admin/professionals/' + confirm.id + '/status', {
          method: 'PATCH',
          headers: { 'X-Gradefy-Company-Id': companyId },
          body: JSON.stringify({
            active: !confirm.active,
            ...(!confirm.active
              ? {}
              : { expectedUpcoming: (confirm as Professional).upcoming_appointments ?? 0 }),
          }),
        });
      setConfirm(null);
      changed('Status atualizado. Os atendimentos anteriores foram preservados.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setMutating(false);
    }
  }
  const visible = (kind === 'services' ? services : professionals).filter(
    (item) =>
      item.name.toLocaleLowerCase('pt-BR').includes(q.toLocaleLowerCase('pt-BR')) &&
      (!status || String(item.active) === status),
  );
  const Icon = kind === 'clients' ? UserRound : kind === 'services' ? Scissors : UsersRound;
  const activeCount = professionals.filter((p) => p.active === 1).length;
  return (
    <div className="gf-dashboard gf-business">
      <BusinessNav companyId={companyId} />
      <div className="gf-dashboard-main" aria-busy={busy}>
        <div className="gf-agenda-heading">
          <div>
            <div className="gf-kicker">SEU NEGÓCIO BEM CUIDADO</div>
            <h1>{names[kind]}</h1>
            <p>{access?.company.name || companies.find((c) => c.id === companyId)?.name}</p>
          </div>
          <Button disabled={!access?.editable || busy} onClick={() => setForm({})}>
            <Plus size={18} />
            Novo {singular[kind]}
          </Button>
        </div>
        {companies.length > 1 && (
          <CompanySelector companies={companies} value={companyId} choose={choose} />
        )}
        <Feedback>{error}</Feedback>
        <Feedback success>{notice}</Feedback>
        {!access ? (
          busy ? (
            <Loading label="Carregando dados…" />
          ) : (
            <Card>
              <h2>Não foi possível carregar {names[kind].toLowerCase()}</h2>
              <Button onClick={() => setRevision((r) => r + 1)}>Tentar novamente</Button>
            </Card>
          )
        ) : (
          <>
            {!access.editable && (
              <Feedback>
                Disponível para consulta. A assinatura atual não permite alterações.
              </Feedback>
            )}
            {kind === 'professionals' && (
              <Card className="gf-business-plan">
                <UsersRound size={20} />
                <p>
                  {access.plan
                    ? `${access.plan.name} · ${money(access.plan.priceCents)}/mês`
                    : access.entitlement.planCode
                      ? 'Plano indisponível'
                      : access.editable
                        ? 'Compatibilidade legada'
                        : 'Sem assinatura vinculada'}
                  <strong>
                    {activeCount}{' '}
                    {activeCount === 1 ? 'profissional ativo' : 'profissionais ativos'}
                    {access.entitlement.maxProfessionals !== null
                      ? ' de ' + access.entitlement.maxProfessionals
                      : access.entitlement.planCode === 'team'
                        ? ' · sem limite numérico'
                        : ''}
                  </strong>
                </p>
              </Card>
            )}
            <Card className="gf-business-search">
              <Input
                label={
                  kind === 'clients' ? 'Buscar por nome, telefone ou e-mail' : 'Buscar por nome'
                }
                value={q}
                icon={<Search size={18} />}
                maxLength={100}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
              {kind !== 'clients' && (
                <div className="gf-field">
                  <label htmlFor="resource-status">Status</label>
                  <select
                    id="resource-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="1">Ativos</option>
                    <option value="0">Inativos</option>
                  </select>
                </div>
              )}
              <Button
                variant="secondary"
                aria-label="Atualizar cadastros"
                disabled={busy}
                onClick={() => setRevision((r) => r + 1)}
              >
                <RefreshCw size={18} />
              </Button>
            </Card>
            {busy ? (
              <Loading label="Carregando dados…" />
            ) : kind === 'clients' ? (
              <>
                <div className="gf-business-grid">
                  {clients?.items.map((c) => (
                    <Card key={c.id} className="gf-business-record">
                      <div className="gf-business-record-heading">
                        <UserRound />
                        <h2>{c.name}</h2>
                      </div>
                      <p>{c.phone}</p>
                      {c.email && <p>{c.email}</p>}
                      <Button variant="secondary" onClick={() => setDetail(c.id)}>
                        Ver cliente e histórico
                      </Button>
                    </Card>
                  ))}
                </div>
                {!clients?.items.length && <Empty icon={<Icon />} />}
                <Pagination page={page} total={clients?.total || 0} onPage={setPage} />
              </>
            ) : (
              <>
                <div className="gf-business-grid">
                  {visible.map((item) =>
                    kind === 'services'
                      ? (() => {
                          const s = item as Service;
                          const enabled = professionals.filter((p) => p.services.includes(s.id));
                          return (
                            <Card key={s.id} className="gf-business-record">
                              <div className="gf-business-record-heading">
                                <Scissors />
                                <h2>{s.name}</h2>
                              </div>
                              <Status active={s.active} />
                              <p>{s.description || 'Sem descrição.'}</p>
                              <strong className="gf-business-value">
                                {money(s.price)} <small>· {s.duration} min</small>
                              </strong>
                              <p>
                                {enabled.length
                                  ? enabled
                                      .map((p) => p.name + (p.active ? '' : ' (inativo)'))
                                      .join(', ')
                                  : 'Nenhum profissional associado.'}
                              </p>
                              <div className="gf-business-actions">
                                <Button
                                  variant="secondary"
                                  disabled={!access.editable}
                                  onClick={() => setForm({ service: s })}
                                >
                                  <Pencil size={16} />
                                  Editar serviço
                                </Button>
                                <Button
                                  variant="secondary"
                                  disabled={!access.editable}
                                  onClick={() => setConfirm(s)}
                                >
                                  {s.active ? 'Desativar' : 'Ativar'}
                                </Button>
                              </div>
                            </Card>
                          );
                        })()
                      : (() => {
                          const p = item as Professional;
                          return (
                            <Card key={p.id} className="gf-business-record">
                              <div className="gf-business-record-heading">
                                {p.photo_url ? (
                                  <img
                                    src={p.photo_url}
                                    alt=""
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <UsersRound />
                                )}
                                <h2>{p.name}</h2>
                              </div>
                              <Status active={p.active} />
                              <p>{p.specialty || 'Sem especialidade informada.'}</p>
                              <p>
                                {services
                                  .filter((s) => p.services.includes(s.id))
                                  .map((s) => s.name + (s.active ? '' : ' (inativo)'))
                                  .join(', ') || 'Sem serviços associados.'}
                              </p>
                              <p className="gf-hint">
                                {p.user_id
                                  ? 'Vínculo de usuário preservado.'
                                  : 'Profissional sem conta de login.'}
                              </p>
                              <div className="gf-business-actions">
                                <Button
                                  variant="secondary"
                                  disabled={!access.editable}
                                  onClick={() => setForm({ professional: p })}
                                >
                                  <Pencil size={16} />
                                  Editar profissional
                                </Button>
                                <Button
                                  variant="secondary"
                                  disabled={!access.editable}
                                  onClick={() => setConfirm(p)}
                                >
                                  {p.active ? 'Desativar' : 'Reativar'}
                                </Button>
                                <Button variant="secondary" onClick={() => setSchedule(p.id)}>
                                  <CalendarDays size={16} />
                                  Configurar horários
                                </Button>
                              </div>
                            </Card>
                          );
                        })(),
                  )}
                </div>
                {!visible.length && <Empty icon={<Icon />} />}
              </>
            )}
          </>
        )}
      </div>
      <BusinessNav companyId={companyId} mobile />
      {form && (
        <RecordForm
          kind={kind}
          companyId={companyId}
          initial={form}
          services={services}
          professionals={professionals}
          close={close}
          changed={changed}
        />
      )}
      {detail && (
        <ClientDetails
          id={detail}
          companyId={companyId}
          close={close}
          edit={(c) => {
            setDetail('');
            setForm({ client: c });
          }}
        />
      )}
      {schedule && (
        <ScheduleForm
          id={schedule}
          companyId={companyId}
          editable={Boolean(access?.editable)}
          close={close}
          changed={changed}
        />
      )}
      {confirm && (
        <div className="gf-agenda-modal">
          <Modal
            title={(confirm.active ? 'Desativar ' : 'Ativar ') + singular[kind]}
            onClose={() => {
              if (!working.current) setConfirm(null);
            }}
          >
            <p>
              Confirmar a alteração de {confirm.name}? O histórico e as reservas existentes serão
              preservados.
            </p>
            {kind === 'professionals' && Boolean(confirm.active) && (
              <>
                <p>
                  {(confirm as Professional).upcoming_appointments ?? 0} reservas futuras ou em
                  andamento serão mantidas. O profissional deixará de receber novos agendamentos.
                </p>
                <Link
                  to={
                    '/app/agenda?empresa=' +
                    encodeURIComponent(companyId) +
                    '&professionalId=' +
                    encodeURIComponent(confirm.id)
                  }
                >
                  Conferir reservas na agenda
                </Link>
              </>
            )}
            <Feedback>{error}</Feedback>
            <div className="gf-agenda-actions">
              <Button variant="secondary" disabled={mutating} onClick={() => setConfirm(null)}>
                Voltar
              </Button>
              <Button busy={mutating} onClick={toggle}>
                Confirmar alteração
              </Button>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
function Status({ active }: { active: number }) {
  return (
    <span
      className={
        'gf-appointment-status ' + (active ? 'gf-status-confirmed' : 'gf-status-cancelled')
      }
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}
function Empty({ icon }: { icon: ReactNode }) {
  return (
    <Card className="gf-dashboard-empty">
      {icon}
      <h2>Nenhum cadastro encontrado</h2>
      <p>Ajuste a busca ou cadastre um novo registro.</p>
    </Card>
  );
}
function Pagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (n: number) => void;
}) {
  return total > 30 ? (
    <nav className="gf-business-pagination" aria-label="Páginas">
      <Button variant="secondary" disabled={page === 1} onClick={() => onPage(page - 1)}>
        Anterior
      </Button>
      <span>
        {page} de {Math.ceil(total / 30)}
      </span>
      <Button variant="secondary" disabled={page * 30 >= total} onClick={() => onPage(page + 1)}>
        Próxima
      </Button>
    </nav>
  ) : null;
}

function RecordForm({
  kind,
  companyId,
  initial,
  services,
  professionals,
  close,
  changed,
}: {
  kind: Kind;
  companyId: string;
  initial: { client?: Client; service?: Service; professional?: Professional };
  services: Service[];
  professionals: Professional[];
  close: () => void;
  changed: (m: string) => void;
}) {
  const { api } = useApp(),
    item = initial.client || initial.service || initial.professional;
  const [name, setName] = useState(item?.name || ''),
    [phone, setPhone] = useState(initial.client?.phone || ''),
    [email, setEmail] = useState(initial.client?.email || ''),
    [notes, setNotes] = useState(initial.client?.notes || ''),
    [description, setDescription] = useState(
      initial.service?.description || initial.professional?.specialty || '',
    ),
    [category, setCategory] = useState(initial.service?.category || 'Serviço'),
    [duration, setDuration] = useState(String(initial.service?.duration || 40)),
    [price, setPrice] = useState(
      initial.service ? String(initial.service.price / 100).replace('.', ',') : '',
    ),
    [photo, setPhoto] = useState(initial.professional?.photo_url || ''),
    [active, setActive] = useState(item && 'active' in item ? Boolean(item.active) : true);
  const [related, setRelated] = useState<string[]>(
      kind === 'services'
        ? professionals
            .filter((p) => initial.service && p.services.includes(initial.service.id))
            .map((p) => p.id)
        : initial.professional?.services || [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const working = useRef(false),
    attempt = useRef<{ payload: string; key: string } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (working.current) return;
    let data: object;
    if (kind === 'clients')
      data = { name, phone, email, notes, ...(item ? { version: initial.client!.version } : {}) };
    else if (kind === 'services') {
      if (!/^\d{1,5}([,.]\d{1,2})?$/.test(price.trim())) {
        setError('Informe um valor válido, com até duas casas decimais.');
        return;
      }
      const parts = price.trim().replace(',', '.').split('.');
      const cents = Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0'));
      data = {
        name,
        description,
        category,
        duration: Number(duration),
        price: cents,
        active,
        professionalIds: related,
      };
    } else
      data = {
        name,
        specialty: description,
        services: related,
        photo_url: photo,
        ...(!item ? { active } : {}),
      };
    const body = JSON.stringify(data);
    if (attempt.current?.payload !== body)
      attempt.current = { payload: body, key: newIdempotencyKey() };
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await api('/admin/' + kind + (item ? '/' + encodeURIComponent(item.id) : ''), {
        method: item ? 'PUT' : 'POST',
        headers: {
          'X-Gradefy-Company-Id': companyId,
          ...(!item ? { 'Idempotency-Key': attempt.current.key } : {}),
        },
        body,
      });
      changed('Cadastro salvo com sucesso.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="gf-agenda-modal">
      <Modal
        title={(item ? 'Editar ' : 'Novo ') + singular[kind]}
        onClose={() => {
          if (!working.current) close();
        }}
      >
        <Feedback>{error}</Feedback>
        <form onSubmit={submit} className="gf-agenda-form">
          <fieldset disabled={busy}>
            <Input
              label={kind === 'professionals' ? 'Nome profissional' : 'Nome'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={kind === 'services' ? 80 : 100}
            />
            {kind === 'clients' ? (
              <>
                <Input
                  label="Telefone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  maxLength={30}
                />
                <Input
                  label="E-mail (opcional)"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={200}
                />
                <Text
                  label="Observações internas (opcional)"
                  value={notes}
                  onChange={setNotes}
                  max={1000}
                />
                <p className="gf-hint">
                  Este cadastro não cria uma conta de login. Alterações não reescrevem reservas
                  anteriores.
                </p>
              </>
            ) : (
              <>
                <Text
                  label={kind === 'services' ? 'Descrição' : 'Especialidade ou descrição'}
                  value={description}
                  onChange={setDescription}
                  max={kind === 'services' ? 250 : 200}
                />
                {kind === 'services' ? (
                  <>
                    <div className="gf-field-pair">
                      <Input
                        label="Preço (R$)"
                        inputMode="decimal"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        required
                      />
                      <Input
                        label="Duração (minutos)"
                        type="number"
                        min={10}
                        max={480}
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        required
                      />
                    </div>
                    <Input
                      label="Categoria"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      required
                      maxLength={40}
                    />
                  </>
                ) : (
                  <>
                    <Input
                      label="URL da foto (opcional)"
                      value={photo}
                      onChange={(e) => setPhoto(e.target.value)}
                      maxLength={2048}
                    />
                    <p className="gf-hint">
                      Use uma imagem hospedada em HTTPS. Nenhuma conta ou permissão administrativa
                      será criada.
                    </p>
                  </>
                )}
                <fieldset className="gf-business-associations">
                  <legend>
                    {kind === 'services' ? 'Profissionais habilitados' : 'Serviços realizados'}
                  </legend>
                  {(kind === 'services' ? professionals : services).map((r) => (
                    <label className="gf-check" key={r.id}>
                      <input
                        type="checkbox"
                        checked={related.includes(r.id)}
                        onChange={(e) =>
                          setRelated(
                            e.target.checked
                              ? [...related, r.id]
                              : related.filter((id) => id !== r.id),
                          )
                        }
                      />
                      {r.name}
                      {r.active ? '' : ' (inativo)'}
                    </label>
                  ))}
                  {!(kind === 'services' ? professionals : services).length && (
                    <p>
                      Cadastre {kind === 'services' ? 'um profissional' : 'um serviço'} para criar
                      associações.
                    </p>
                  )}
                </fieldset>
                {(kind === 'services' || !item) && (
                  <label className="gf-check">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                    />
                    Ativo
                  </label>
                )}
              </>
            )}
          </fieldset>
          <div className="gf-agenda-actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={close}>
              Voltar
            </Button>
            <Button type="submit" busy={busy}>
              Salvar {singular[kind]}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
function Text({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  max: number;
}) {
  return (
    <label className="gf-field">
      {label}
      <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} />
    </label>
  );
}
function ClientDetails({
  id,
  companyId,
  close,
  edit,
}: {
  id: string;
  companyId: string;
  close: () => void;
  edit: (c: Client) => void;
}) {
  const { api } = useApp(),
    [data, setData] = useState<ClientDetail | null>(null),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError('');
    api<ClientDetail>(
      '/admin/clients/' +
        encodeURIComponent(id) +
        '?' +
        new URLSearchParams({ page: String(page), ...(status ? { status } : {}) }),
      { headers: { 'X-Gradefy-Company-Id': companyId }, signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [api, companyId, id, page, status, revision]);
  const registered =
    data?.client.created_at && Number.isFinite(Date.parse(data.client.created_at))
      ? new Intl.DateTimeFormat('pt-BR', {
          timeZone: data.timezone,
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(new Date(data.client.created_at))
      : null;
  const link = (a: ClientDetail['history'][number]) => (
    <Link
      className="gf-business-history-row"
      key={a.id}
      to={
        '/app/agenda?empresa=' +
        encodeURIComponent(companyId) +
        '&atendimento=' +
        encodeURIComponent(a.id)
      }
    >
      <strong>
        {a.date.split('-').reverse().join('/')} · {a.time}
      </strong>
      <span>
        {a.services.join(' + ')} · {a.professionalName}
      </span>
      <span>
        {statusLabels[a.status]} ·{' '}
        {a.status === 'completed'
          ? 'Valor registrado'
          : a.status === 'confirmed'
            ? 'Valor previsto'
            : 'Valor da reserva'}
        : {money(a.totalCents)}
      </span>
      <small>Abrir atendimento na agenda →</small>
    </Link>
  );
  return (
    <div className="gf-agenda-modal">
      <Modal title="Cliente e histórico" onClose={close}>
        <Feedback>{error}</Feedback>
        {!data ? (
          error ? (
            <Button onClick={() => setRevision((r) => r + 1)}>Tentar novamente</Button>
          ) : (
            <Loading label="Carregando dados…" />
          )
        ) : (
          <>
            <h3>{data.client.name}</h3>
            <p>{data.client.phone}</p>
            {data.client.email && <p>{data.client.email}</p>}
            {registered && <p>Cadastrado em {registered}</p>}
            {data.client.notes && (
              <div className="gf-agenda-notes">
                <h3>Observações internas</h3>
                <p>{data.client.notes}</p>
              </div>
            )}
            <Button variant="secondary" disabled={!data.editable} onClick={() => edit(data.client)}>
              <Pencil size={16} />
              Editar cliente
            </Button>
            <h3 className="gf-business-section-title">Próximo agendamento</h3>
            {data.next ? link(data.next) : <p>Nenhum atendimento futuro confirmado.</p>}
            <h3 className="gf-business-section-title">Histórico de atendimentos</h3>
            <label className="gf-field">
              Status do histórico
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {Object.entries(statusLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {data.history.map(link)}
            {!data.history.length && <p>Nenhum atendimento neste filtro.</p>}
            <Pagination page={page} total={data.total} onPage={setPage} />
          </>
        )}
      </Modal>
    </div>
  );
}
const weekdays = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
function ScheduleForm({
  id,
  companyId,
  editable,
  close,
  changed,
}: {
  id: string;
  companyId: string;
  editable: boolean;
  close: () => void;
  changed: (m: string) => void;
}) {
  const { api } = useApp(),
    [schedule, setSchedule] = useState<WorkingSchedule | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [share, setShare] = useState<{ url: string; whatsapp_url: string } | null>(null);
  const working = useRef(false);
  const path = '/admin/barbers/' + encodeURIComponent(id),
    options = { headers: { 'X-Gradefy-Company-Id': companyId } };
  const releaseAttempt = useRef<string | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setError('');
    api<WorkingSchedule>(path + '/schedule', {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: c.signal,
    })
      .then((s) => {
        if (!c.signal.aborted) setSchedule(s);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [api, path, companyId, revision]);
  function dayChange(index: number, patch: Partial<WorkingDay>) {
    setSchedule((s) =>
      s ? { ...s, days: s.days.map((d, i) => (i === index ? { ...d, ...patch } : d)) } : null,
    );
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!schedule || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await api(path + '/schedule', {
        ...options,
        method: 'PUT',
        body: JSON.stringify({ ...schedule.settings, days: schedule.days }),
      });
      changed('Horários salvos. As reservas existentes foram preservadas.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function release() {
    if (!schedule?.next_week || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    releaseAttempt.current ||= JSON.stringify({
      week_start: schedule.next_week.week_start,
      version: schedule.settings.version,
    });
    try {
      setShare(
        await api(path + '/released-weeks', {
          ...options,
          method: 'POST',
          body: releaseAttempt.current,
        }),
      );
      releaseAttempt.current = null;
      setRevision((r) => r + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="gf-agenda-modal">
      <Modal
        title="Horários do profissional"
        onClose={() => {
          if (!working.current) close();
        }}
      >
        <Feedback>{error}</Feedback>
        {!schedule ? (
          error ? (
            <Button onClick={() => setRevision((r) => r + 1)}>Tentar novamente</Button>
          ) : (
            <Loading label="Carregando dados…" />
          )
        ) : (
          <form className="gf-agenda-form" onSubmit={save}>
            <fieldset disabled={busy || !editable}>
              <label className="gf-field">
                Modo de abertura
                <select
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
                  <option value="auto">Automático</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
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
              {schedule.days.map((day, i) => (
                <div className="gf-working-day" key={day.weekday}>
                  <label className="gf-check">
                    <input
                      type="checkbox"
                      checked={day.active}
                      onChange={(e) => dayChange(i, { active: e.target.checked })}
                    />
                    {weekdays[day.weekday]}
                  </label>
                  <div className="gf-field-pair">
                    <Input
                      label={'Início — ' + weekdays[day.weekday]}
                      type="time"
                      value={day.start_time}
                      onChange={(e) => dayChange(i, { start_time: e.target.value })}
                      required
                    />
                    <Input
                      label={'Término — ' + weekdays[day.weekday]}
                      type="time"
                      value={day.end_time}
                      onChange={(e) => dayChange(i, { end_time: e.target.value })}
                      required
                    />
                  </div>
                  {day.breaks.map((b, j) => (
                    <div className="gf-pause-row" key={j}>
                      <Input
                        label={'Início pausa ' + (j + 1) + ' — ' + weekdays[day.weekday]}
                        type="time"
                        value={b.start_time}
                        onChange={(e) =>
                          dayChange(i, {
                            breaks: day.breaks.map((v, k) =>
                              j === k ? { ...v, start_time: e.target.value } : v,
                            ),
                          })
                        }
                        required
                      />
                      <Input
                        label={'Fim pausa ' + (j + 1) + ' — ' + weekdays[day.weekday]}
                        type="time"
                        value={b.end_time}
                        onChange={(e) =>
                          dayChange(i, {
                            breaks: day.breaks.map((v, k) =>
                              j === k ? { ...v, end_time: e.target.value } : v,
                            ),
                          })
                        }
                        required
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          dayChange(i, { breaks: day.breaks.filter((_, k) => j !== k) })
                        }
                      >
                        Remover pausa
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={day.breaks.length >= 4}
                    onClick={() =>
                      dayChange(i, {
                        breaks: [...day.breaks, { start_time: '12:00', end_time: '13:00' }],
                      })
                    }
                  >
                    Adicionar pausa
                  </Button>
                </div>
              ))}
            </fieldset>
            <div className="gf-agenda-actions">
              <Button
                type="button"
                disabled={busy}
                variant="secondary"
                onClick={() => setRevision((r) => r + 1)}
              >
                Atualizar horários
              </Button>
              <Button type="submit" busy={busy} disabled={!editable}>
                Salvar horários
              </Button>
            </div>
            {schedule.next_week && schedule.settings.agenda_mode === 'manual' && (
              <Button type="button" disabled={!editable} busy={busy} onClick={release}>
                {releaseAttempt.current
                  ? 'Repetir liberação da mesma semana'
                  : `Liberar próxima semana (${schedule.next_week.start_date} a ${schedule.next_week.end_date})`}
              </Button>
            )}
            {share && (
              <Card>
                <p>Semana liberada.</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(share.url)
                      .catch(() => setError('Não foi possível copiar. Use o link abaixo.'))
                  }
                >
                  Copiar link
                </Button>
                <a href={share.whatsapp_url} target="_blank" rel="noopener noreferrer">
                  Enviar no WhatsApp
                </a>
                <p className="gf-business-share">{share.url}</p>
              </Card>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
