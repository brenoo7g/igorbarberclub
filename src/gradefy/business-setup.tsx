import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import { ArrowLeft, Check, Building2 } from 'lucide-react';
import { useApp } from '../context';
import { ApiError, errorMessage, newIdempotencyKey } from '../lib';
import { Button, ButtonLink, Card, Feedback, Input, Loading } from './components';
import { Progress } from './plans';
import { readPendingSelection } from './pending-plan';
import type { Plan } from './pending-plan';
import type { PendingBusiness } from './business-types';
import { usePostalAddress } from './postal-address';

interface Catalog {
  niches: { code: string; name: string }[];
  templates: { code: string; name: string; nicheCode: string }[];
}
const empty = {
  name: '',
  slug: '',
  description: '',
  phone: '',
  whatsapp: '',
  instagram: '',
  city: '',
  region: '',
  address: '',
  postal_code: '',
  neighborhood: '',
  address_number: '',
  address_complement: '',
};
type Field = keyof typeof empty;
const states = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];
export default function BusinessSetup() {
  const { user, api } = useApp();
  const { business, refreshBusiness } = useOutletContext<{
    business: PendingBusiness | null;
    refreshBusiness: () => void;
  }>();
  const [created, setCreated] = useState<PendingBusiness | null>(null);
  const pending = created || business;
  const [data, setData] = useState<{ plans: Plan[]; catalog: Catalog } | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [values, setValues] = useState(empty);
  const postal = usePostalAddress(values, setValues);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const submitting = useRef(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const draft = user ? readPendingSelection(user.id) : null;
  useEffect(() => {
    if (pending) return;
    let active = true;
    setError('');
    setData(null);
    Promise.all([api<Plan[]>('/plans'), api<Catalog>('/onboarding/catalog')])
      .then(([plans, catalog]) => {
        if (active) setData({ plans, catalog });
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
      });
    return () => {
      active = false;
    };
  }, [api, pending, revision]);
  const plan = data?.plans.find((item) => item.code === draft?.planCode);
  const niche = data?.catalog.niches.find((item) => item.code === draft?.nicheCode);
  const template = data?.catalog.templates.find(
    (item) => item.code === draft?.templateCode && item.nicheCode === niche?.code,
  );
  function update(field: Field, value: string) {
    postal.markEdited(field);
    setValues((previous) => ({ ...previous, [field]: value }));
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!plan || !niche || !template || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setFieldErrors({});
    const payload = JSON.stringify({
      ...values,
      street:
        values.postal_code ||
        values.address_number ||
        values.neighborhood ||
        values.address_complement
          ? values.address
          : undefined,
      planCode: plan.code,
      nicheCode: niche.code,
      templateCode: template.code,
    });
    try {
      if (attempt.current?.payload !== payload) {
        const key = newIdempotencyKey();
        attempt.current = { payload, key };
      }
      const result = await api<{ company: PendingBusiness }>('/onboarding/business', {
        method: 'POST',
        headers: { 'Idempotency-Key': attempt.current!.key },
        body: payload,
      });
      setCreated(result.company);
      refreshBusiness();
    } catch (failure) {
      if (failure instanceof ApiError) {
        const errors: Partial<Record<Field, string>> = {};
        for (const detail of failure.details || [])
          if (detail.field === 'street') errors.address = detail.message;
          else if (detail.field in empty) errors[detail.field as Field] = detail.message;
        setFieldErrors(errors);
        if (failure.status === 409) {
          // Also recovers a successful request whose response was lost, including across reloads.
          try {
            const result = await api<{ company: PendingBusiness | null }>('/onboarding/business');
            if (result.company) {
              setCreated(result.company);
              refreshBusiness();
              return;
            }
          } catch {
            /* Preserve the actionable original failure. */
          }
        }
      }
      setError(errorMessage(failure));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (pending)
    return (
      <div className="gf-plans-page gf-business-page">
        <Progress step={3} />
        <Card className="gf-setup-summary">
          <span className="gf-ready-icon">
            <Check size={28} />
          </span>
          <h1>Seu negócio está em configuração.</h1>
          <Feedback success>Empresa criada com sucesso.</Feedback>
          <dl>
            <div>
              <dt>Estabelecimento</dt>
              <dd>{pending.name}</dd>
            </div>
            <div>
              <dt>Nome público</dt>
              <dd>{pending.slug}</dd>
            </div>
            <div>
              <dt>Plano</dt>
              <dd>{pending.plan.name}</dd>
            </div>
            <div>
              <dt>Segmento</dt>
              <dd>{pending.niche.name}</dd>
            </div>
            <div>
              <dt>Template</dt>
              <dd>{pending.template.name}</dd>
            </div>
          </dl>
          <p>Seu site ainda não foi publicado. Seu teste grátis ainda não começou.</p>
          <p>Cadastre serviços, equipe e horários antes de iniciar seus 7 dias grátis.</p>
          <ButtonLink to="/app/onboarding/operations">Configurar serviços e equipe</ButtonLink>
          <ButtonLink to="/app/conta" variant="secondary">
            Voltar para minha conta
          </ButtonLink>
        </Card>
      </div>
    );
  if (!data)
    return error ? (
      <div className="gf-ready">
        <Card>
          <Feedback>{error}</Feedback>
          <Button onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button>
          <ButtonLink to="/app/onboarding/template" variant="secondary">
            Voltar aos templates
          </ButtonLink>
        </Card>
      </div>
    ) : (
      <Loading />
    );
  if (!plan) return <Navigate to="/app/onboarding/plan" replace />;
  if (!niche) return <Navigate to="/app/onboarding/niche" replace />;
  if (!template) return <Navigate to="/app/onboarding/template" replace />;
  return (
    <div className="gf-plans-page gf-business-page">
      <Link className="gf-back" to="/app/onboarding/template">
        <ArrowLeft size={17} />
        Alterar template
      </Link>
      <Progress step={3} />
      <div className="gf-plans-heading">
        <div className="gf-kicker">SEU NEGÓCIO NO GRADEFY</div>
        <h1>Agora vamos configurar seu negócio.</h1>
        <p>Conte o essencial sobre seu estabelecimento.</p>
      </div>
      <Card className="gf-business-choices">
        <Building2 size={24} />
        <div>
          <strong>
            {plan.name} · {niche.name} · {template.name}
          </strong>
          <div className="gf-business-choice-links">
            <Link to="/app/onboarding/plan">Alterar plano</Link>
            <Link to="/app/onboarding/niche">Alterar segmento</Link>
          </div>
        </div>
      </Card>
      <Card className="gf-business-form-card">
        <form onSubmit={submit}>
          <Feedback>{error}</Feedback>
          <fieldset disabled={busy} className="gf-business-fields">
            <legend className="gf-visually-hidden">Dados do estabelecimento</legend>
            <Input
              label="Nome do estabelecimento"
              value={values.name}
              onChange={(event) => update('name', event.target.value)}
              required
              minLength={2}
              maxLength={100}
              autoComplete="organization"
              error={fieldErrors.name}
            />
            <Input
              label="Nome público / slug"
              value={values.slug}
              onChange={(event) => update('slug', event.target.value.toLowerCase())}
              required
              minLength={3}
              maxLength={60}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              autoCapitalize="none"
              spellCheck={false}
              hint="Exemplo: minha-barbearia. Use letras, números e hífens."
              error={fieldErrors.slug}
            />
            <div className="gf-field gf-business-wide">
              <label htmlFor="business-description">Descrição</label>
              <textarea
                id="business-description"
                maxLength={1000}
                value={values.description}
                onChange={(event) => update('description', event.target.value)}
                aria-invalid={!!fieldErrors.description}
                aria-describedby={fieldErrors.description ? 'description-error' : undefined}
              />
              {fieldErrors.description && (
                <p id="description-error" className="gf-field-error">
                  {fieldErrors.description}
                </p>
              )}
            </div>
            <Input
              label="Telefone"
              type="tel"
              value={values.phone}
              onChange={(event) => update('phone', event.target.value)}
              required
              maxLength={30}
              autoComplete="tel"
              hint="Inclua o DDD."
              error={fieldErrors.phone}
            />
            <Input
              label="WhatsApp"
              type="tel"
              value={values.whatsapp}
              onChange={(event) => update('whatsapp', event.target.value)}
              maxLength={30}
              hint="Opcional. Inclua o DDD."
              error={fieldErrors.whatsapp}
            />
            <Input
              label="Instagram"
              type="url"
              value={values.instagram}
              onChange={(event) => update('instagram', event.target.value)}
              maxLength={200}
              placeholder="https://instagram.com/seu_perfil"
              error={fieldErrors.instagram}
            />
            <div className="gf-business-wide">
              <h2>Endereço do estabelecimento</h2>
              <Input
                label="CEP"
                value={values.postal_code}
                onChange={(e) => update('postal_code', e.target.value)}
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={9}
                pattern="[0-9]{5}-?[0-9]{3}"
                hint="Opcional. Ao completar oito números, buscamos seu endereço."
                error={fieldErrors.postal_code}
              />
              {postal.message && (
                <p role="status" aria-live="polite" className="gf-hint">
                  {postal.message}
                </p>
              )}
            </div>
            <Input
              label="Cidade"
              value={values.city}
              onChange={(event) => update('city', event.target.value)}
              required
              minLength={2}
              maxLength={100}
              autoComplete="address-level2"
              error={fieldErrors.city}
            />
            <div className="gf-field">
              <label htmlFor="business-region">Estado</label>
              <select
                id="business-region"
                required
                value={values.region}
                onChange={(event) => update('region', event.target.value)}
                autoComplete="address-level1"
                aria-invalid={!!fieldErrors.region}
                aria-describedby={fieldErrors.region ? 'region-error' : undefined}
              >
                <option value="">Selecione seu estado</option>
                {states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              {fieldErrors.region && (
                <p id="region-error" className="gf-field-error">
                  {fieldErrors.region}
                </p>
              )}
            </div>
            <Input
              label="Endereço (opcional)"
              value={values.address}
              onChange={(event) => update('address', event.target.value)}
              maxLength={250}
              autoComplete="street-address"
              error={fieldErrors.address}
              hint="Rua ou logradouro. Você pode corrigir o endereço manualmente."
            />
            <Input
              label="Bairro"
              value={values.neighborhood}
              onChange={(e) => update('neighborhood', e.target.value)}
              maxLength={100}
              autoComplete="address-level3"
              error={fieldErrors.neighborhood}
            />
            <Input
              label="Número do imóvel"
              value={values.address_number}
              onChange={(e) => update('address_number', e.target.value)}
              maxLength={20}
              required={
                !!values.postal_code || !!values.neighborhood || !!values.address_complement
              }
              hint="Informe s/n quando não houver número."
              error={fieldErrors.address_number}
            />
            <Input
              label="Complemento (opcional)"
              value={values.address_complement}
              onChange={(e) => update('address_complement', e.target.value)}
              maxLength={100}
              autoComplete="address-line2"
              error={fieldErrors.address_complement}
            />
          </fieldset>
          <p className="gf-hint">
            Seu teste grátis ainda não começou. Criar a empresa não publica seu site nem gera
            cobrança.
          </p>
          <Button type="submit" busy={busy}>
            {busy ? 'Criando empresa…' : 'Criar minha empresa'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
