import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCheck,
  Layers3,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  Store,
  UsersRound,
  LogOut,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../context';
import { errorMessage } from '../lib';
import type { User } from '../types';
import { Button, ButtonLink, Card, Feedback, Input, Loading } from './components';
import { validateAccount, validateEmail, validatePassword } from './forms';
import type { AccountFields, AccountValues, FormErrors } from './forms';
import { useCompanies } from './company-access';
import { DetailTile, JourneyFrame } from './journey';

function BrandScene() {
  return (
    <div className="gf-scene" aria-hidden="true">
      <div className="gf-scene-grid" />
      <div className="gf-orbit gf-orbit-one" />
      <div className="gf-orbit gf-orbit-two" />
      <div className="gf-logo-tile">
        <img src="/gradefy/logo-mark.png" alt="" />
      </div>
      <div className="gf-scene-card gf-scene-agenda">
        <span className="gf-scene-icon">
          <CalendarDays size={25} />
        </span>
        <div>
          <strong>Uma agenda organizada.</strong>
          <span>Uma rotina mais simples.</span>
        </div>
        <CheckCheck size={20} />
      </div>
      <div className="gf-scene-card gf-scene-time">
        <span className="gf-scene-icon gf-cyan">
          <Layers3 size={24} />
        </span>
        <div>
          <strong>Tudo conectado.</strong>
          <span>Mais tempo para o que importa.</span>
        </div>
      </div>
      <div className="gf-scene-caption">
        <span /> Seu negócio, no seu ritmo.
      </div>
    </div>
  );
}
export function Welcome() {
  const { user, loading } = useApp();
  if (!loading && user) return <Navigate to="/app/dashboard" replace />;
  return (
    <div className="gf-welcome">
      <section className="gf-welcome-copy">
        <div className="gf-kicker">
          <span /> GESTÃO QUE ACOMPANHA VOCÊ
        </div>
        <h1>
          Sua agenda.
          <br />
          Seu negócio.
          <br />
          <span className="gf-gradient-text">Tudo em um só lugar.</span>
        </h1>
        <p>
          Organize seus agendamentos, clientes e equipe com o Gradefy. Mais tempo para fazer o que
          você faz de melhor.
        </p>
        <div className="gf-welcome-actions">
          {!loading && user ? (
            <ButtonLink to="/app/conta">
              Acessar minha conta <ArrowRight size={19} />
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to="/app/comecar">
                Criar minha conta <ArrowRight size={19} />
              </ButtonLink>
              <ButtonLink to="/app/login" variant="secondary">
                Já tenho uma conta
              </ButtonLink>
            </>
          )}
        </div>
        <div className="gf-reassurance">
          <ShieldCheck size={19} />
          <span>Seu negócio organizado, onde você estiver.</span>
        </div>
      </section>
      <BrandScene />
    </div>
  );
}
export function FormFrame({
  title,
  description,
  children,
  backTo = '/app',
}: {
  title: string;
  description: string;
  children: ReactNode;
  backTo?: string;
}) {
  return (
    <div className="gf-auth-layout">
      <aside className="gf-auth-aside">
        <div className="gf-kicker">MAIS TEMPO PARA O QUE IMPORTA</div>
        <h2>
          Seu talento.
          <br />
          <span className="gf-gradient-text">Nossa organização.</span>
        </h2>
        <p>Uma rotina mais leve começa com um lugar para organizar tudo.</p>
        <BrandScene />
      </aside>
      <Card className="gf-form-card">
        <Link to={backTo} className="gf-back">
          <ArrowLeft size={17} /> Voltar
        </Link>
        <div className="gf-form-heading">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {children}
      </Card>
    </div>
  );
}
const empty: AccountValues = { name: '', email: '', password: '', confirmPassword: '' };
export function AccountForm({ register = false }: { register?: boolean }) {
  const { api, setUser, loading, user } = useApp();
  const location = useLocation();
  const invitationToken = new URLSearchParams(location.hash.slice(1)).get('token');
  const invitationReturn =
    invitationToken && /^[a-f0-9]{64}$/.test(invitationToken) ? '#token=' + invitationToken : '';
  const teamEntry = new URLSearchParams(location.search).get('equipe') === '1';
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  function update(field: AccountFields, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setError('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const next = validateAccount(values, register);
    setErrors(next);
    setError('');
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0];
      formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const result = await api<{ user: User }>(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(
          register
            ? { ...values, scope: 'gradefy' }
            : { email: values.email, password: values.password },
        ),
      });
      setCompleted(true);
      setUser(result.user);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (user)
    return (
      <Navigate
        to={
          invitationReturn
            ? '/app/convite' + invitationReturn
            : teamEntry
              ? '/app/entrar-equipe'
              : register && completed
                ? '/app/onboarding/plan'
                : '/app/dashboard'
        }
        replace
        state={{ accountCreated: register && completed }}
      />
    );
  const field = (name: AccountFields) => ({
    name,
    value: values[name],
    onChange: (event: ChangeEvent<HTMLInputElement>) => update(name, event.target.value),
    error: errors[name],
    disabled: busy,
    required: true,
  });
  return (
    <FormFrame
      title={register ? 'Crie sua conta' : 'Que bom ter você aqui.'}
      description={
        register
          ? 'O primeiro passo para uma rotina mais organizada.'
          : 'Entre para continuar de onde parou.'
      }
    >
      <form noValidate ref={formRef} onSubmit={submit} className="gf-form" aria-busy={busy}>
        <Feedback>{error}</Feedback>
        {!register && location.state?.sessionRequired && (
          <p className="gf-hint" role="status">
            Entre para acessar sua conta.
          </p>
        )}
        {register && (
          <Input
            label="Nome"
            type="text"
            autoComplete="name"
            placeholder="Como podemos chamar você?"
            maxLength={100}
            icon={<UserRound size={19} />}
            {...field('name')}
          />
        )}
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="voce@exemplo.com"
          maxLength={200}
          icon={<Mail size={19} />}
          {...field('email')}
        />
        <Input
          label="Senha"
          type="password"
          autoComplete={register ? 'new-password' : 'current-password'}
          placeholder={register ? 'Pelo menos 8 caracteres' : 'Sua senha'}
          maxLength={72}
          icon={<LockKeyhole size={19} />}
          {...field('password')}
        />
        {register && (
          <Input
            label="Confirmação de senha"
            type="password"
            autoComplete="new-password"
            placeholder="Digite sua senha novamente"
            maxLength={72}
            icon={<LockKeyhole size={19} />}
            {...field('confirmPassword')}
          />
        )}
        {!register && (
          <Link className="gf-forgot" to="/app/esqueci-senha">
            Esqueci minha senha
          </Link>
        )}
        <Button type="submit" busy={busy}>
          {busy
            ? register
              ? 'Criando sua conta…'
              : 'Entrando…'
            : register
              ? 'Criar minha conta'
              : 'Entrar'}{' '}
          {!busy && <ArrowRight size={18} />}
        </Button>
        {register && (
          <p className="gf-privacy">
            <ShieldCheck size={16} />{' '}
            {invitationReturn || teamEntry
              ? 'Seus dados protegidos. Você confirmará o convite após criar sua conta.'
              : 'Seus dados protegidos. Você configura seu negócio no próximo passo.'}
          </p>
        )}
      </form>
      <p className="gf-form-switch">
        {register ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}{' '}
        <Link
          to={
            (register
              ? '/app/login'
              : invitationReturn || teamEntry
                ? '/app/cadastro'
                : '/app/comecar') +
            (teamEntry ? '?equipe=1' : '') +
            invitationReturn
          }
        >
          {register ? 'Entrar' : 'Criar minha conta'}
        </Link>
      </p>
      {register && !invitationReturn && !teamEntry && (
        <p className="gf-form-switch">
          <Link to="/app/comecar">Sou proprietário ou colaborador? Escolher perfil</Link>
        </p>
      )}
    </FormFrame>
  );
}
export function AccountReady() {
  const { user, loading, logout } = useApp();
  const location = useLocation();
  const { companies, business, error: companyError, retry } = useCompanies();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function exit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await logout();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/app/login" replace state={{ sessionRequired: true }} />;
  return (
    <JourneyFrame className="gf-account-journey">
      <header className="gf-journey-heading">
        <div className="gf-kicker">SUA CONTA GRADEFY</div>
        <h1>
          {location.state?.accountCreated
            ? 'Sua conta está pronta.'
            : `Olá, ${user.name.split(' ')[0]}.`}
        </h1>
        {location.state?.accountCreated && <Feedback success>Conta criada com sucesso.</Feedback>}
        <p className="gf-account-email">{user.email}</p>
      </header>
      <hr className="gf-journey-divider" />
      <Feedback>{error || companyError}</Feedback>
      {companies === null && !companyError ? (
        <Loading />
      ) : (
        companies && (
          <div className="gf-journey-state">
            <span className="gf-journey-icon" aria-hidden="true">
              <Layers3 size={36} />
            </span>
            <h2>
              {companies.length ? (
                <>
                  Seu acesso está ativo <CheckCheck size={23} />
                </>
              ) : business?.onboardingStatus === 'completed' ? (
                'Sua empresa está configurada!'
              ) : business ? (
                'Seu negócio está em configuração.'
              ) : (
                'Seu próximo passo: seu negócio.'
              )}
            </h2>
            <p>
              {companies.length
                ? 'Escolha um estabelecimento para continuar.'
                : business?.onboardingStatus === 'completed'
                  ? `${business.name}: configuração concluída.`
                  : business
                    ? `${business.name}: sua empresa foi criada e aguarda a conclusão da configuração. Seu teste grátis ainda não começou.`
                    : 'Nenhum estabelecimento foi vinculado à sua conta. Configure seu negócio ou entre em uma equipe com um convite.'}
            </p>
          </div>
        )
      )}
      {companyError && (
        <Button variant="secondary" onClick={retry}>
          Tentar novamente
        </Button>
      )}
      {companies?.length === 0 && (
        <ButtonLink to={business ? '/app/onboarding/setup' : '/app/onboarding/plan'}>
          {business ? 'Retomar configuração' : 'Escolher meu plano'} <ArrowRight size={18} />
        </ButtonLink>
      )}
      {business?.onboardingStatus === 'completed' && (
        <ButtonLink to="/app/onboarding/complete">Ver meu período grátis</ButtonLink>
      )}
      <div className="gf-account-companies">
        {companies?.map((company) => {
          const management = ['owner', 'manager'].includes(company.role);
          const professional = company.role === 'professional';
          const query = '?empresa=' + encodeURIComponent(company.id);
          return (
            <section
              key={company.id}
              className="gf-account-company"
              aria-label={'Acesso a ' + company.name}
            >
              <div className="gf-detail-grid">
                <DetailTile icon={<Store size={24} />} label="Estabelecimento">
                  {company.name}
                </DetailTile>
                <DetailTile icon={<UserRound size={24} />} label="Seu papel">
                  {(
                    {
                      owner: 'Proprietário',
                      manager: 'Gestor',
                      professional: 'Profissional',
                    } as Record<string, string>
                  )[company.role] || 'Acesso restrito'}
                </DetailTile>
              </div>
              <div className="gf-journey-actions">
                {(management || professional) && (
                  <ButtonLink to={(management ? '/app/dashboard' : '/app/minha-agenda') + query}>
                    {management ? 'Abrir painel empresarial' : 'Abrir Minha Agenda'}{' '}
                    <ArrowRight size={18} />
                  </ButtonLink>
                )}
                {management && (
                  <ButtonLink to={'/app/meu-site' + query} variant="secondary">
                    Meu Mini Site <ExternalLink size={17} />
                  </ButtonLink>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div className="gf-journey-actions">
        <ButtonLink to="/app/entrar-equipe" variant="secondary">
          <UsersRound size={20} /> Entrar em uma equipe
        </ButtonLink>
        <Button variant="secondary" busy={busy} onClick={exit}>
          <LogOut size={20} /> {busy ? 'Saindo…' : 'Sair da conta'}
        </Button>
      </div>
      <Link className="gf-text-link" to="/app">
        Voltar ao início
      </Link>
    </JourneyFrame>
  );
}
export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const { api, setUser } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const validToken = /^[a-f0-9]{64}$/.test(token);
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(
    location.state?.resetComplete ? 'Senha redefinida com sucesso. Entre com sua nova senha.' : '',
  );
  const submitting = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const all: FormErrors = {};
    if (reset) {
      const passwordError = validatePassword(values.password, 8);
      if (passwordError) all.password = passwordError;
      if (values.password !== values.confirmPassword)
        all.confirmPassword = 'As senhas não coincidem.';
    } else {
      const emailError = validateEmail(values.email);
      if (emailError) all.email = emailError;
    }
    setErrors(all);
    setError('');
    if (Object.keys(all).length) return;
    submitting.current = true;
    setBusy(true);
    try {
      const result = await api<{ message: string }>(
        `/auth/${reset ? 'reset-password' : 'forgot-password'}`,
        {
          method: 'POST',
          body: JSON.stringify(
            reset
              ? { token, password: values.password, confirmPassword: values.confirmPassword }
              : { email: values.email, scope: 'gradefy' },
          ),
        },
      );
      if (reset) {
        setUser(null);
        navigate('/app/redefinir-senha', { replace: true, state: { resetComplete: true } });
        setValues(empty);
      }
      setMessage(result.message);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <FormFrame
      title={reset ? 'Uma nova senha.' : 'Esqueceu sua senha?'}
      description={
        reset
          ? 'Recupere o acesso à sua conta com segurança.'
          : 'Acontece. Vamos ajudar você a voltar.'
      }
    >
      {message ? (
        <>
          <Feedback success>{message}</Feedback>
          <ButtonLink to="/app/login">
            Voltar para o login <ArrowRight size={18} />
          </ButtonLink>
        </>
      ) : reset && !validToken ? (
        <>
          <Feedback>
            Este link é inválido ou expirou. Solicite um novo link de recuperação.
          </Feedback>
          <ButtonLink to="/app/esqueci-senha">Solicitar novo link</ButtonLink>
        </>
      ) : (
        <form className="gf-form" noValidate onSubmit={submit}>
          <Feedback>{error}</Feedback>
          {reset ? (
            <>
              <Input
                label="Nova senha"
                type="password"
                autoComplete="new-password"
                required
                disabled={busy}
                maxLength={72}
                hint="Pelo menos 8 caracteres. Contas administrativas exigem 12."
                error={errors.password}
                value={values.password}
                onChange={(event) => setValues({ ...values, password: event.target.value })}
              />
              <Input
                label="Confirmação de senha"
                type="password"
                autoComplete="new-password"
                required
                disabled={busy}
                maxLength={72}
                error={errors.confirmPassword}
                value={values.confirmPassword}
                onChange={(event) => setValues({ ...values, confirmPassword: event.target.value })}
              />
            </>
          ) : (
            <Input
              label="E-mail"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              disabled={busy}
              maxLength={200}
              error={errors.email}
              value={values.email}
              onChange={(event) => setValues({ ...values, email: event.target.value })}
              icon={<Mail size={19} />}
            />
          )}
          <Button busy={busy} type="submit">
            {busy ? 'Aguarde…' : reset ? 'Redefinir senha' : 'Enviar link de recuperação'}{' '}
            {!busy && <ArrowRight size={18} />}
          </Button>
          <Link className="gf-text-link" to="/app/login">
            Voltar para o login
          </Link>
        </form>
      )}
    </FormFrame>
  );
}
export function MissingPage() {
  return (
    <div className="gf-ready">
      <Card>
        <h1>Vamos voltar ao início?</h1>
        <p>Essa página não foi encontrada.</p>
        <ButtonLink to="/app">Voltar ao Gradefy</ButtonLink>
      </Card>
    </div>
  );
}
