import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Scissors,
  Sparkles,
  Paintbrush,
  PenTool,
} from 'lucide-react';
import { useApp } from '../context';
import { ApiError, errorMessage } from '../lib';
import { Button, ButtonLink, Card, Feedback, Loading } from './components';
import { Progress } from './plans';
import { readPendingSelection, savePendingNiche, savePendingTemplate } from './pending-plan';
import type { Plan } from './pending-plan';

interface Niche {
  code: string;
  name: string;
}
interface Template {
  code: string;
  name: string;
  nicheCode: string;
}
interface Catalog {
  niches: Niche[];
  templates: Template[];
}
const upcoming = [
  { name: 'Salão de beleza', Icon: Sparkles },
  { name: 'Manicure / Nail Designer', Icon: Paintbrush },
  { name: 'Estúdio de tatuagem', Icon: PenTool },
];
// Presentation metadata only; availability and names always come from the catalog.
const presentation: Record<string, { image: string; description: string; preview: string }> = {
  'barber-classic': {
    image: '/gradefy/barber-classic-preview.png',
    description:
      'Um site elegante para apresentar sua barbearia, seus cortes e facilitar agendamentos.',
    preview: '/preview/barber-classic',
  },
};
export function CatalogSelection({ step }: { step: 'niche' | 'template' }) {
  const { user, api } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<{ catalog: Catalog; plans: Plan[] } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [draft, setDraft] = useState(() => (user ? readPendingSelection(user.id) : null));
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    Promise.all([api<Catalog>('/onboarding/catalog'), api<Plan[]>('/plans')])
      .then(([catalog, plans]) => {
        if (active) setData({ catalog, plans });
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
      });
    return () => {
      active = false;
    };
  }, [api, user?.id, revision]);
  const plan = data?.plans.find((item) => item.code === draft?.planCode);
  const niche = data?.catalog.niches.find((item) => item.code === draft?.nicheCode);
  const template = data?.catalog.templates.find(
    (item) => item.code === draft?.templateCode && item.nicheCode === niche?.code,
  );
  function chooseNiche(code: string) {
    if (!user || busy) return;
    try {
      savePendingNiche(user.id, code);
      setDraft(readPendingSelection(user.id));
      setError('');
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  async function proceed(selected?: Template) {
    if (!user || !plan || !niche || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/onboarding/${selected ? 'template' : 'niche'}-selection`, {
        method: 'POST',
        body: JSON.stringify({
          planCode: plan.code,
          nicheCode: niche.code,
          ...(selected ? { templateCode: selected.code } : {}),
        }),
      });
      if (selected) savePendingTemplate(user.id, niche.code, selected.code);
      navigate(selected ? '/app/onboarding/setup' : '/app/onboarding/template');
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401)
        navigate('/app/login', { replace: true });
      else if (
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
  if (!data)
    return error ? (
      <div className="gf-ready">
        <Card>
          <Feedback>{error}</Feedback>
          <Button onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button>
          <ButtonLink to="/app/onboarding/plan" variant="secondary">
            Voltar aos planos
          </ButtonLink>
        </Card>
      </div>
    ) : (
      <Loading />
    );
  if (!plan) return <Navigate to="/app/onboarding/plan" replace />;
  if (step !== 'niche' && !niche) return <Navigate to="/app/onboarding/niche" replace />;
  return (
    <div className="gf-plans-page gf-catalog-page">
      <Link
        className="gf-back"
        to={step === 'niche' ? '/app/onboarding/plan' : '/app/onboarding/niche'}
      >
        <ArrowLeft size={17} />
        {step === 'niche' ? 'Alterar plano' : 'Alterar segmento'}
      </Link>
      <Progress step={step === 'niche' ? 1 : 2} />
      <div className="gf-plans-heading">
        <div className="gf-kicker">DO SEU JEITO</div>
        <h1>{step === 'niche' ? 'Qual é o seu negócio?' : 'Escolha o seu template'}</h1>
        <p>
          {step === 'niche'
            ? 'Escolha seu segmento para personalizar sua experiência.'
            : 'Uma presença online à altura do seu trabalho.'}
        </p>
      </div>
      <Feedback>{error}</Feedback>
      <Feedback success>Plano {plan.name} selecionado.</Feedback>
      {step === 'niche' ? (
        <>
          <fieldset className="gf-plan-options gf-niche-options" disabled={busy}>
            <legend className="gf-visually-hidden">Escolha seu segmento</legend>
            {data.catalog.niches.map((item) => (
              <label
                key={item.code}
                className={`gf-plan-option ${niche?.code === item.code ? 'gf-plan-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="niche"
                  aria-label={item.name}
                  checked={niche?.code === item.code}
                  onChange={() => chooseNiche(item.code)}
                />
                <Card className="gf-niche-card">
                  <span className="gf-plan-icon">
                    <Scissors size={26} />
                  </span>
                  <h2>{item.name}</h2>
                  <p>Seu atendimento, sua agenda e seu estilo.</p>
                  <span className="gf-plan-radio">
                    <Check size={13} />
                  </span>
                </Card>
              </label>
            ))}
            {upcoming.map(({ name, Icon }) => (
              <label key={name} className="gf-plan-option gf-coming-soon">
                <input type="radio" name="niche" aria-label={name} disabled />
                <Card className="gf-niche-card">
                  <span className="gf-plan-icon">
                    <Icon size={26} />
                  </span>
                  <h2>{name}</h2>
                  <span className="gf-plan-tag">Em breve</span>
                </Card>
              </label>
            ))}
          </fieldset>
          {!data.catalog.niches.length && (
            <Feedback>Os segmentos estão temporariamente indisponíveis.</Feedback>
          )}
          <div className="gf-plan-bottom">
            <p>Seu teste grátis ainda não começou.</p>
            <Button busy={busy} disabled={!niche} onClick={() => proceed()}>
              Continuar <ArrowRight size={18} />
            </Button>
          </div>
        </>
      ) : (
        <div className="gf-template-options">
          {data.catalog.templates
            .filter((item) => item.nicheCode === niche?.code)
            .map((item) => (
              <Card
                key={item.code}
                className={`gf-template-card ${template?.code === item.code ? 'gf-template-selected' : ''}`}
              >
                <img
                  src={presentation[item.code]?.image}
                  alt={`Prévia do site ${item.name}`}
                  width="1280"
                  height="960"
                />
                <div className="gf-template-content">
                  <div className="gf-plan-title">
                    <h2>{item.name}</h2>
                    {template?.code === item.code && (
                      <span className="gf-plan-tag">
                        <Check size={14} /> Selecionado
                      </span>
                    )}
                  </div>
                  <p>{presentation[item.code]?.description}</p>
                  <div className="gf-template-actions">
                    <a
                      className="gf-button gf-secondary"
                      href={presentation[item.code]?.preview}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Visualizar ${item.name} (abre em nova aba)`}
                    >
                      Visualizar <ExternalLink size={16} />
                    </a>
                    <Button busy={busy} onClick={() => proceed(item)}>
                      Escolher este template <ArrowRight size={17} />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
