import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MailPlus, RefreshCw, ShieldCheck } from 'lucide-react';
import { useApp } from '../context';
import { errorMessage } from '../lib';
import { Modal } from '../components/UI';
import { Button, ButtonLink, Card, Feedback, Input, Loading } from './components';
import { CompanySelector, ManagementAccess } from './management';
import type { ManagementProps } from './management';
import { BusinessNav } from './business-nav';
import './dashboard.css';
import './agenda.css';
import './team.css';

type Role = 'owner' | 'manager' | 'professional';
type Invitation = {
  id: string;
  email: string;
  role: Role;
  status: string;
  expiresAt: string;
  delivery: string;
};
type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  professional_name: string | null;
  professional_id: string | null;
};
type TeamState = {
  company: { id: string; name: string };
  members: Member[];
  invitations: Invitation[];
  professionals: { id: string; name: string; active: number; user_id: string | null }[];
  linksEditable: boolean;
};
type SharedInvite = { invitation: Invitation; link: string; code: string; companyName: string };
const roles: Record<Role, string> = {
  owner: 'Proprietário',
  manager: 'Gestor',
  professional: 'Profissional',
};
const statuses: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Revogado',
  pending: 'Convite pendente',
  expired: 'Expirado',
  accepted: 'Aceito',
  cancelled: 'Cancelado',
};
const date = (s: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s));
const deliveryText = (s: string) =>
  s === 'sent'
    ? 'Convite enviado ao provedor de e-mail. Compartilhe o link se necessário.'
    : s === 'failed'
      ? 'O e-mail não pôde ser enviado. Copie o link e compartilhe com a pessoa convidada.'
      : 'Copie o link e envie à pessoa convidada. O envio por e-mail não está configurado.';
export default function Team() {
  return <ManagementAccess>{(p) => <TeamContent {...p} />}</ManagementAccess>;
}
function TeamContent({ companyId, companies, choose }: ManagementProps) {
  const { api } = useApp();
  const [data, setData] = useState<TeamState | null>(null),
    [busy, setBusy] = useState(true),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [email, setEmail] = useState(''),
    [role, setRole] = useState<Role>('manager'),
    [professionalMode, setProfessionalMode] = useState('new'),
    [invitedProfessional, setInvitedProfessional] = useState(''),
    [mutating, setMutating] = useState(false),
    [shared, setShared] = useState<SharedInvite | null>(null),
    [linkTarget, setLinkTarget] = useState(''),
    [action, setAction] = useState<{
      kind: 'renew' | 'cancel' | 'revoke' | 'role' | 'professional';
      invitation?: Invitation;
      member?: Member;
    } | null>(null);
  const working = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setData(null);
    setError('');
    api<TeamState>('/admin/team', {
      headers: { 'X-Gradefy-Company-Id': companyId },
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [api, companyId, revision]);
  async function mutate(path: string, body: object, method = 'POST') {
    if (working.current) return;
    working.current = true;
    setMutating(true);
    setError('');
    setNotice('');
    try {
      const result = await api<SharedInvite | { ok: true }>(path, {
        method,
        headers: { 'X-Gradefy-Company-Id': companyId },
        body: JSON.stringify(body),
      });
      setAction(null);
      if ('link' in result) {
        setShared(result);
        setEmail('');
      }
      setNotice('A equipe foi atualizada com sucesso.');
      setRevision((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setMutating(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void mutate('/admin/team/invitations', {
      email,
      role,
      ...(role === 'professional'
        ? {
            professional:
              professionalMode === 'new'
                ? { mode: 'new' }
                : { mode: 'existing', professionalId: invitedProfessional },
          }
        : {}),
    });
  }
  function confirm() {
    if (!action) return;
    if (action.invitation)
      void mutate(
        `/admin/team/invitations/${encodeURIComponent(action.invitation.id)}/${action.kind}`,
        { confirm: true },
      );
    else if (action.member && action.kind === 'professional')
      void mutate(
        `/admin/team/members/${encodeURIComponent(action.member.id)}/professional`,
        {
          professionalId: linkTarget || null,
          expectedProfessionalId: action.member.professional_id,
          confirm: true,
        },
        'PATCH',
      );
    else if (action.member)
      void mutate(
        `/admin/team/members/${encodeURIComponent(action.member.id)}/${action.kind}`,
        {
          confirm: true,
          expectedRole: action.member.role,
          expectedStatus: action.member.status,
          ...(action.kind === 'role' ? { role } : {}),
        },
        action.kind === 'role' ? 'PATCH' : 'POST',
      );
  }
  return (
    <div className="gf-dashboard gf-business gf-team">
      <BusinessNav companyId={companyId} />
      <div className="gf-dashboard-main" aria-busy={busy}>
        <header className="gf-agenda-heading">
          <div>
            <div className="gf-kicker">ACESSOS DO SEU NEGÓCIO</div>
            <h1>Equipe e permissões</h1>
            <p>{data?.company.name || 'Gestão dos acessos empresariais'}</p>
          </div>
          <Button
            variant="secondary"
            disabled={busy || mutating}
            onClick={() => setRevision((v) => v + 1)}
            aria-label="Atualizar equipe"
          >
            <RefreshCw size={18} /> Atualizar
          </Button>
        </header>
        <CompanySelector companies={companies} value={companyId} choose={choose} />
        <Feedback>{error}</Feedback>
        <Feedback success>{notice}</Feedback>
        {busy ? (
          <Loading label="Carregando equipe…" />
        ) : data ? (
          <>
            <Card className="gf-team-intro">
              <ShieldCheck size={25} />
              <div>
                <h2>Acesso ao painel e atendimento são diferentes</h2>
                <p>
                  Gestores recebem acesso à gestão. No convite de profissional, escolha criar um
                  cadastro no aceite ou vincular um cadastro existente.
                </p>
                <Link to={'/app/profissionais?empresa=' + encodeURIComponent(companyId)}>
                  Gerenciar profissionais de atendimento
                </Link>
              </div>
            </Card>
            <Card>
              <h2>Convidar pessoa</h2>
              <p>
                Gestores acessam a operação, o financeiro e os relatórios. O papel Profissional
                mantém o vínculo empresarial, sem acesso à gestão. Somente proprietários gerenciam
                acessos.
              </p>
              <form className="gf-team-form" onSubmit={submit}>
                <Input
                  label="E-mail do convidado"
                  type="email"
                  required
                  maxLength={200}
                  value={email}
                  disabled={mutating}
                  onChange={(e) => setEmail(e.target.value)}
                  autoCapitalize="none"
                />
                <label className="gf-field">
                  Papel do convidado
                  <select
                    value={role}
                    disabled={mutating}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    <option value="manager">Gestor</option>
                    <option value="professional">Profissional</option>
                  </select>
                </label>
                {role === 'professional' && (
                  <>
                    <label className="gf-field">
                      Cadastro na agenda
                      <select
                        value={professionalMode}
                        disabled={mutating}
                        onChange={(e) => setProfessionalMode(e.target.value)}
                      >
                        <option value="new">Criar novo profissional no aceite</option>
                        <option value="existing">Vincular profissional existente</option>
                      </select>
                    </label>
                    {professionalMode === 'existing' && (
                      <label className="gf-field">
                        Profissional do convite
                        <select
                          value={invitedProfessional}
                          required
                          disabled={mutating}
                          onChange={(e) => setInvitedProfessional(e.target.value)}
                        >
                          <option value="">Selecione o cadastro</option>
                          {data.professionals
                            .filter(
                              (p) =>
                                !p.user_id ||
                                data.members.some(
                                  (m) =>
                                    m.id === p.user_id && m.email === email.trim().toLowerCase(),
                                ),
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                                {p.active ? '' : ' (inativo)'}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <p className="gf-hint">
                      O cadastro novo fica inativo, sem serviços e com a agenda fechada. Configure e
                      ative em Profissionais; os limites do plano continuam valendo.
                    </p>
                  </>
                )}
                <Button type="submit" busy={mutating}>
                  <MailPlus size={18} /> Criar convite
                </Button>
              </form>
            </Card>
            <section aria-label="Membros da empresa">
              <h2>Pessoas com acesso</h2>
              <div className="gf-business-grid">
                {data.members.map((m) => (
                  <Card className="gf-business-record" key={m.id}>
                    <div>
                      <h3>{m.name}</h3>
                      <p>{m.email}</p>
                    </div>
                    <div className="gf-team-tags">
                      <span>{roles[m.role]}</span>
                      <span>{statuses[m.status]}</span>
                    </div>
                    {m.professional_name && <p>Profissional associado: {m.professional_name}</p>}
                    {m.role === 'professional' && !m.professional_name && (
                      <p>Vínculo profissional pendente.</p>
                    )}
                    {((m.role === 'professional' && m.status === 'active') ||
                      m.professional_id) && (
                      <Button
                        variant="secondary"
                        disabled={mutating || !data.linksEditable}
                        onClick={() => {
                          setLinkTarget(
                            m.status === 'active' && m.role === 'professional'
                              ? m.professional_id || ''
                              : '',
                          );
                          setAction({ kind: 'professional', member: m });
                        }}
                      >
                        {m.status !== 'active' || m.role !== 'professional'
                          ? 'Remover vínculo profissional'
                          : m.professional_name
                            ? 'Alterar vínculo profissional'
                            : 'Associar profissional'}
                      </Button>
                    )}
                    {m.role === 'owner' ? (
                      <p>O acesso do proprietário está protegido.</p>
                    ) : m.status === 'active' ? (
                      <div className="gf-business-actions">
                        <Button
                          variant="secondary"
                          disabled={mutating}
                          onClick={() => {
                            setRole(m.role);
                            setAction({ kind: 'role', member: m });
                          }}
                        >
                          Alterar papel
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={mutating}
                          onClick={() => setAction({ kind: 'revoke', member: m })}
                        >
                          Revogar acesso
                        </Button>
                      </div>
                    ) : (
                      <p>Para conceder acesso novamente, crie um novo convite.</p>
                    )}
                  </Card>
                ))}
              </div>
            </section>
            <section aria-label="Convites da empresa">
              <h2>Convites</h2>
              {!data.invitations.length ? (
                <Card>
                  <p>Nenhum convite criado. Convide quem vai ajudar a administrar seu negócio.</p>
                </Card>
              ) : (
                <div className="gf-business-grid">
                  {data.invitations.map((i) => (
                    <Card className="gf-business-record" key={i.id}>
                      <h3>{i.email}</h3>
                      <div className="gf-team-tags">
                        <span>{roles[i.role]}</span>
                        <span>{statuses[i.status]}</span>
                      </div>
                      <p>Validade: {date(i.expiresAt)}</p>
                      {i.status === 'pending' && <p>{deliveryText(i.delivery)}</p>}
                      {['pending', 'expired'].includes(i.status) && (
                        <div className="gf-business-actions">
                          <Button
                            variant="secondary"
                            disabled={mutating}
                            onClick={() => setAction({ kind: 'renew', invitation: i })}
                          >
                            Renovar e reenviar
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={mutating}
                            onClick={() => setAction({ kind: 'cancel', invitation: i })}
                          >
                            Cancelar convite
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <Card>
            <p>
              Esta área é exclusiva dos proprietários. Se o acesso foi revogado, escolha outra
              empresa ou volte à sua conta.
            </p>
            <ButtonLink to="/app/conta">Minha conta</ButtonLink>
          </Card>
        )}
      </div>
      <BusinessNav companyId={companyId} mobile />
      {action && (
        <Modal
          title={
            action.kind === 'professional'
              ? 'Confirmar vínculo profissional?'
              : action.kind === 'revoke'
                ? 'Revogar acesso?'
                : action.kind === 'role'
                  ? 'Alterar papel?'
                  : action.kind === 'cancel'
                    ? 'Cancelar convite?'
                    : 'Renovar convite?'
          }
          onClose={() => {
            if (!mutating) setAction(null);
          }}
        >
          <div className="gf-form">
            <p>
              {action.kind === 'professional'
                ? `Confirme o cadastro de atendimento associado à conta de ${action.member?.name}. O vínculo define a agenda usada pelo papel Profissional; ele não muda o papel da conta. Reservas existentes serão preservadas.`
                : action.kind === 'revoke'
                  ? `O acesso de ${action.member?.name} será encerrado nesta empresa. A conta, os atendimentos e o cadastro profissional serão preservados.`
                  : action.kind === 'role'
                    ? `Confirme o novo papel de ${action.member?.name}. O acesso será atualizado nas próximas requisições.`
                    : action.kind === 'cancel'
                      ? `O link e o código de ${action.invitation?.email} deixarão de funcionar.`
                      : `Um novo link e código serão gerados para ${action.invitation?.email}, com validade de 7 dias. Os anteriores deixarão de funcionar.`}
            </p>
            {action.kind === 'professional' && (
              <label className="gf-field">
                Cadastro profissional
                <select
                  value={linkTarget}
                  disabled={mutating}
                  onChange={(e) => setLinkTarget(e.target.value)}
                >
                  <option value="">Sem vínculo — remover associação</option>
                  {data?.professionals
                    .filter((p) => p.active === 1 || p.id === action.member?.professional_id)
                    .map((p) => (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={
                          action.member?.status !== 'active' ||
                          action.member?.role !== 'professional' ||
                          (p.user_id !== null && p.user_id !== action.member?.id)
                        }
                      >
                        {p.name}
                        {p.active !== 1 ? ' (inativo)' : ''}
                        {p.user_id && p.user_id !== action.member?.id
                          ? ' — conta já vinculada'
                          : ''}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {action.kind === 'role' && (
              <label className="gf-field">
                Novo papel
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  disabled={mutating}
                >
                  <option value="manager">Gestor</option>
                  <option value="professional">Profissional</option>
                </select>
              </label>
            )}
            <Feedback>{error}</Feedback>
            <Button onClick={confirm} busy={mutating}>
              Confirmar
            </Button>
            <Button variant="secondary" disabled={mutating} onClick={() => setAction(null)}>
              Voltar
            </Button>
          </div>
        </Modal>
      )}
      {shared && <InviteLink value={shared} onClose={() => setShared(null)} />}
    </div>
  );
}
function InviteLink({ value, onClose }: { value: SharedInvite; onClose: () => void }) {
  const [notice, setNotice] = useState('');
  async function copy(kind: 'link' | 'code') {
    try {
      await navigator.clipboard.writeText(value[kind]);
      setNotice(kind === 'link' ? 'Link copiado.' : 'Código copiado.');
    } catch {
      setNotice('Selecione o link ou o código abaixo e copie manualmente.');
    }
  }
  return (
    <Modal title="Convite pronto" onClose={onClose}>
      <div className="gf-form">
        <h3>{value.companyName}</h3>
        <p>
          {roles[value.invitation.role]} · {statuses[value.invitation.status]}
        </p>
        <p>{deliveryText(value.invitation.delivery)}</p>
        <p>
          Compartilhe o link ou o código com a pessoa convidada. O convite é individual e expira em
          7 dias.
        </p>
        <p>
          O link é exclusivo para {value.invitation.email} e expira em{' '}
          {date(value.invitation.expiresAt)}.
        </p>
        <Input
          label="Link do convite"
          value={value.link}
          readOnly
          onFocus={(e) => e.target.select()}
        />
        <label className="gf-field">
          Código do convite
          <textarea
            className="gf-invitation-code"
            value={value.code}
            readOnly
            rows={3}
            spellCheck={false}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <p>
          O código aparece somente agora. Para obter outro, renove o convite; o anterior será
          invalidado.
        </p>
        <Feedback success>{notice}</Feedback>
        <Button onClick={() => void copy('link')}>Copiar link de convite</Button>
        <Button variant="secondary" onClick={() => void copy('code')}>
          Copiar código de convite
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Concluir
        </Button>
      </div>
    </Modal>
  );
}
type InvitationInfo = {
  companyName: string;
  role: Role;
  emailHint: string;
  emailMatches: boolean;
  expiresAt: string;
};
export function AcceptInvitation() {
  const { api, user, loading, logout } = useApp(),
    location = useLocation(),
    navigate = useNavigate();
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const [info, setInfo] = useState<InvitationInfo | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [mutating, setMutating] = useState(false),
    [accepted, setAccepted] = useState<{
      companyId: string;
      role: Role;
      professionalId?: string;
    } | null>(null),
    [revision, setRevision] = useState(0);
  const working = useRef(false);
  useEffect(() => {
    if (loading || accepted) return;
    const c = new AbortController();
    setInfo(null);
    setError('');
    setBusy(true);
    api<InvitationInfo>('/team/invitations/inspect', {
      method: 'POST',
      body: JSON.stringify({ token }),
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setInfo(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [api, token, user?.id, user?.email, loading, accepted, revision]);
  async function accept() {
    if (working.current) return;
    working.current = true;
    setMutating(true);
    setError('');
    try {
      const result = await api<{ companyId: string; role: Role; professionalId?: string }>(
        '/team/invitations/accept',
        {
          method: 'POST',
          body: JSON.stringify({ token }),
        },
      );
      setAccepted(result);
      navigate('/app/convite', { replace: true }); // Remove the consumed token from the current URL.
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setMutating(false);
    }
  }
  async function switchAccount() {
    setMutating(true);
    setError('');
    try {
      await logout();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMutating(false);
    }
  }
  const fragment = '#token=' + encodeURIComponent(token);
  return (
    <div className="gf-ready gf-invite-ready">
      <Card>
        <div className="gf-kicker">CONVITE GRADEFY</div>
        <h1>
          {accepted
            ? 'Você faz parte da equipe.'
            : info
              ? `Convite para ${info.companyName}`
              : 'Seu próximo passo começa aqui.'}
        </h1>
        <Feedback>{error}</Feedback>
        {accepted ? (
          <>
            <Feedback success>Convite aceito com sucesso.</Feedback>
            <p>
              {accepted.professionalId
                ? 'Sua conta foi vinculada ao cadastro profissional. O proprietário pode conferir serviços, horários e ativação antes de liberar reservas.'
                : 'Seu acesso foi vinculado à empresa. Nenhum profissional foi criado na agenda.'}
            </p>
            <ButtonLink
              to={
                accepted.role === 'manager'
                  ? '/app/dashboard?empresa=' + encodeURIComponent(accepted.companyId)
                  : '/app/minha-agenda?empresa=' + encodeURIComponent(accepted.companyId)
              }
            >
              Acessar minha conta empresarial
            </ButtonLink>
          </>
        ) : loading || busy ? (
          <Loading label="Verificando convite…" />
        ) : info ? (
          <>
            <p>Você foi convidado para fazer parte desta equipe.</p>
            <p>
              Você foi convidado como {roles[info.role].toLowerCase()}. Entre com o e-mail{' '}
              {info.emailHint} para confirmar.
            </p>
            <p>Validade: {date(info.expiresAt)}</p>
            {!user ? (
              <div className="gf-form">
                <ButtonLink to={'/app/login' + fragment}>Já tenho uma conta</ButtonLink>
                <ButtonLink to={'/app/cadastro' + fragment} variant="secondary">
                  Criar minha conta
                </ButtonLink>
              </div>
            ) : info.emailMatches ? (
              <Button busy={mutating} onClick={() => void accept()}>
                Aceitar convite
              </Button>
            ) : (
              <>
                <Feedback>
                  Esta conta usa outro e-mail. Entre com a conta que recebeu o convite.
                </Feedback>
                <Button busy={mutating} onClick={() => void switchAccount()}>
                  Trocar conta
                </Button>
              </>
            )}
          </>
        ) : (
          <>
            <p>Peça ao proprietário um novo convite. Você também pode voltar à sua conta.</p>
            <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
              Tentar novamente
            </Button>
          </>
        )}
        <Link className="gf-back" to="/app/conta">
          Minha conta
        </Link>
        {!accepted && (
          <Link className="gf-back" to="/app/entrar-equipe">
            Digitar outro código
          </Link>
        )}
      </Card>
    </div>
  );
}
