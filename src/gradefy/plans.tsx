import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useApp } from '../context';
import { ApiError, errorMessage, money } from '../lib';
import { Button, ButtonLink, Card, Feedback, Loading } from './components';
import { useCompanies } from './company-access';
import { readPendingPlan, savePendingPlan } from './pending-plan';
import type { Plan, PlanCode } from './pending-plan';

export function OnboardingGate() {
  const { user, loading } = useApp();
  const { companies, business, error, retry } = useCompanies();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/app/login" replace state={{ sessionRequired: true }} />;
  if (error)
    return (
      <div className="gf-ready">
        <Card>
          <Feedback>{error}</Feedback>
          <Button onClick={retry}>Tentar novamente</Button>
          <ButtonLink to="/app/conta" variant="secondary">
            Voltar para minha conta
          </ButtonLink>
        </Card>
      </div>
    );
  if (!companies) return <Loading />;
  if (business?.onboardingStatus === 'completed') {
    if (!['/app/onboarding/complete', '/app/onboarding/site'].includes(location.pathname))
      return <Navigate to="/app/onboarding/complete" replace />;
    return <Outlet key={user.id} context={{ business, refreshBusiness: retry }} />;
  }
  if (companies.length) return <Navigate to="/app/dashboard" replace />;
  if (
    business &&
    !['/app/onboarding/setup', '/app/onboarding/operations', '/app/onboarding/complete'].includes(
      location.pathname,
    )
  )
    return <Navigate to="/app/onboarding/setup" replace />;
  return <Outlet key={user.id} context={{ business, refreshBusiness: retry }} />;
}
function usePlanCatalog() {
  const { api, user } = useApp();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setPlans(null);
    setError('');
    api<Plan[]>('/plans')
      .then((result) => {
        if (active) setPlans(result);
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
      });
    return () => {
      active = false;
    };
  }, [user?.id, api, revision]);
  return { plans, error, retry: () => setRevision((value) => value + 1) };
}
export function Progress({ step = 0 }: { step?: number }) {
  return (
    <ol className="gf-onboarding-progress" aria-label="Progresso da configuração">
      {['Plano', 'Segmento', 'Template', 'Seu negócio'].map((label, index) => (
        <li
          key={label}
          aria-current={step === index ? 'step' : undefined}
          className={step === index ? 'gf-step-current' : ''}
        >
          <span>{step > index ? <Check size={13} /> : index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
const features = {
  individual: ['Agenda online', 'Serviços e clientes', 'Site personalizado', 'Gestão financeira'],
  team: [
    'Tudo do plano Individual',
    'Gestão de equipe',
    'Agenda por profissional',
    'Comissões — em breve',
  ],
};
export function PlanSelection() {
  const { user, api } = useApp();
  const { plans, error: catalogError, retry } = usePlanCatalog();
  const location = useLocation();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<PlanCode | null>(() =>
    user ? readPendingPlan(user.id) : null,
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const selectedPlan = plans?.find((plan) => plan.code === selected);
  function choose(code: PlanCode) {
    if (!user || busy) return;
    setSelected(code);
    setError('');
    try {
      savePendingPlan(user.id, code);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  async function proceed() {
    if (!user || !selectedPlan || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ plan: Plan }>('/onboarding/plan-selection', {
        method: 'POST',
        body: JSON.stringify({ planCode: selectedPlan.code }),
      });
      savePendingPlan(user.id, result.plan.code);
      navigate('/app/onboarding/niche');
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.status === 409 &&
        failure.message.includes('estabelecimento')
      )
        navigate('/app/conta', { replace: true });
      else setError(errorMessage(failure));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="gf-plans-page">
      <Link className="gf-back" to="/app/conta">
        <ArrowLeft size={17} /> Voltar para minha conta
      </Link>
      <Progress />
      <div className="gf-plans-heading">
        <div className="gf-kicker">UM PLANO PARA O SEU MOMENTO</div>
        <h1>Escolha seu plano</h1>
        <p>Comece com 7 dias grátis.</p>
      </div>
      {location.state?.accountCreated && (
        <Feedback success>Conta criada com sucesso. Agora escolha seu plano.</Feedback>
      )}
      <Feedback>{catalogError || error}</Feedback>
      {catalogError ? (
        <Button onClick={retry} variant="secondary">
          Carregar planos novamente
        </Button>
      ) : plans === null ? (
        <Loading />
      ) : plans.length === 0 ? (
        <Card>
          <Feedback>
            Os planos estão temporariamente indisponíveis. Tente novamente em instantes.
          </Feedback>
          <Button onClick={retry} variant="secondary">
            Tentar novamente
          </Button>
        </Card>
      ) : (
        <>
          <fieldset className="gf-plan-options" disabled={busy}>
            <legend className="gf-visually-hidden">Escolha um plano</legend>
            {plans.map((plan) => (
              <label
                key={plan.code}
                className={`gf-plan-option ${selected === plan.code ? 'gf-plan-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={plan.code}
                  aria-label={`Plano ${plan.name}`}
                  checked={selected === plan.code}
                  onChange={() => choose(plan.code)}
                />
                <Card className="gf-plan-card">
                  <div className="gf-plan-top">
                    <span className={`gf-plan-icon ${plan.code === 'team' ? 'gf-plan-cyan' : ''}`}>
                      {plan.code === 'team' ? <UsersRound size={23} /> : <UserRound size={23} />}
                    </span>
                    <span className="gf-plan-radio">
                      <Check size={13} />
                    </span>
                  </div>
                  <div className="gf-plan-title">
                    <h2>{plan.name}</h2>
                    {plan.code === 'team' && (
                      <span className="gf-plan-tag">Para crescer em equipe</span>
                    )}
                  </div>
                  <p className="gf-plan-capacity">
                    {plan.maxProfessionals === null
                      ? 'Profissionais ativos ilimitados'
                      : `${plan.maxProfessionals} profissional ativo`}
                  </p>
                  <div className="gf-plan-price">
                    {money(plan.priceCents)}
                    <span>/mês</span>
                  </div>
                  <div className="gf-plan-trial">
                    <CheckCheck size={16} /> {plan.trialDays} dias grátis após configurar seu
                    negócio
                  </div>
                  <ul>
                    {features[plan.code].map((feature) => (
                      <li key={feature}>
                        <Check size={16} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </Card>
              </label>
            ))}
          </fieldset>
          <div className="gf-plan-bottom">
            <p>
              <ShieldCheck size={17} /> Nenhuma cobrança será realizada nesta etapa. Sem cartão.
            </p>
            <Button busy={busy} disabled={!selectedPlan} onClick={proceed}>
              {busy ? 'Validando sua escolha…' : 'Continuar'}
              {!busy && <ArrowRight size={18} />}
            </Button>
          </div>
          <p className="gf-plans-note">
            O teste grátis começa após concluir a configuração do estabelecimento. Selecionar um
            plano não inicia a contagem. Alguns recursos serão disponibilizados nas próximas etapas.
          </p>
        </>
      )}
    </div>
  );
}
