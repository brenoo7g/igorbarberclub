import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Scissors,
  Sparkles,
  Paintbrush,
  PenTool,
} from 'lucide-react';
import { useApp } from '../context';
import { errorMessage } from '../lib';
import { Button, Card, Feedback, Loading } from './components';
import { Progress } from './plans';
import { readPendingSelection, savePendingNiche, savePendingTemplate } from './pending-plan';
import type { Plan } from './pending-plan';
interface Catalog {
  defaultTemplateCode: string | null;
  niches: { code: string; name: string }[];
  templates: { code: string; name: string; nicheCode: string }[];
}
const upcoming = [
  { name: 'Salão de beleza', Icon: Sparkles },
  { name: 'Manicure / Nail Designer', Icon: Paintbrush },
  { name: 'Estúdio de tatuagem', Icon: PenTool },
];
export function CatalogSelection({ step }: { step: 'niche' | 'template' }) {
  const { user, api } = useApp(),
    navigate = useNavigate();
  const [data, setData] = useState<{ catalog: Catalog; plans: Plan[] } | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [draft, setDraft] = useState(() => (user ? readPendingSelection(user.id) : null));
  useEffect(() => {
    const c = new AbortController();
    setError('');
    Promise.all([
      api<Catalog>('/onboarding/catalog', { signal: c.signal }),
      api<Plan[]>('/plans', { signal: c.signal }),
    ])
      .then(([catalog, plans]) => {
        if (!c.signal.aborted) setData({ catalog, plans });
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [api, user?.id, revision]);
  const plan = data?.plans.find((p) => p.code === draft?.planCode),
    niche = data?.catalog.niches.find((n) => n.code === draft?.nicheCode);
  const template = data?.catalog.templates.find(
    (t) => t.code === data.catalog.defaultTemplateCode && t.nicheCode === niche?.code,
  );
  useEffect(() => {
    if (user && niche && template && draft?.templateCode !== template.code) {
      try {
        savePendingTemplate(user.id, niche.code, template.code);
        setDraft(readPendingSelection(user.id));
      } catch (e) {
        setError(errorMessage(e));
      }
    }
  }, [user?.id, niche?.code, template?.code, draft?.templateCode]);
  async function proceed() {
    if (!user || !plan || !niche || !template || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await api('/onboarding/niche-selection', {
        method: 'POST',
        body: JSON.stringify({ planCode: plan.code, nicheCode: niche.code }),
      });
      savePendingTemplate(user.id, niche.code, template.code);
      navigate('/app/onboarding/setup');
    } catch (e) {
      setError(errorMessage(e));
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
          <Button onClick={() => setRevision((n) => n + 1)}>Tentar novamente</Button>
          <Link to="/app/onboarding/plan">Voltar aos planos</Link>
        </Card>
      </div>
    ) : (
      <Loading />
    );
  if (!plan) return <Navigate to="/app/onboarding/plan" replace />;
  if (step === 'template')
    return (
      <Navigate
        to={niche && template ? '/app/onboarding/setup' : '/app/onboarding/niche'}
        replace
      />
    );
  return (
    <div className="gf-plans-page gf-catalog-page">
      <Link className="gf-back" to="/app/onboarding/plan">
        <ArrowLeft size={17} />
        Alterar plano
      </Link>
      <Progress step={1} />
      <div className="gf-plans-heading">
        <div className="gf-kicker">DO SEU JEITO</div>
        <h1>Qual é o seu negócio?</h1>
        <p>Seu negócio já vem com o Gradefy Mini Site.</p>
      </div>
      <Feedback>{error}</Feedback>
      <Feedback success>Plano {plan.name} selecionado.</Feedback>
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
              onChange={() => {
                if (!user) return;
                try {
                  savePendingNiche(user.id, item.code);
                  setDraft(readPendingSelection(user.id));
                  setError('');
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
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
        <Button busy={busy} disabled={!template} onClick={proceed}>
          Continuar <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}
