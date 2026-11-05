import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Check,
  Circle,
  ClipboardList,
  Info,
  Link2,
  MapPin,
  Pencil,
  Phone,
  Store,
} from 'lucide-react';
import { useApp } from '../context';
import { ApiError, errorMessage, newIdempotencyKey } from '../lib';
import { Button, ButtonLink, Card, Feedback, Input, Loading } from './components';
import { Progress } from './plans';
import { readPendingSelection } from './pending-plan';
import type { Plan } from './pending-plan';
import type { PendingBusiness } from './business-types';
import { usePostalAddress } from './postal-address';
import './business-setup.css';

interface Catalog {
  defaultTemplateCode: string | null;
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
function readBusinessDraft(userId?: string) {
  if (!userId) return empty;
  try {
    const stored = JSON.parse(sessionStorage.getItem(`gradefy:business-draft:${userId}`) || 'null');
    if (!stored || typeof stored !== 'object') return empty;
    return Object.fromEntries(
      Object.keys(empty).map((field) => [
        field,
        typeof stored[field] === 'string' ? stored[field] : '',
      ]),
    ) as typeof empty;
  } catch {
    return empty;
  }
}
function phoneValid(value: string) {
  return /^\d{10,13}$/.test(value.replace(/\D/g, ''));
}
function sectionState(complete: boolean, started: boolean) {
  return complete ? 'Completo' : started ? 'Em preenchimento' : 'Pendente';
}
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
  const [values, setValues] = useState(() => readBusinessDraft(user?.id));
  const postal = usePostalAddress(values, setValues);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const submitting = useRef(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const draft = user ? readPendingSelection(user.id) : null;
  useEffect(() => {
    if (!user || pending) return;
    try {
      sessionStorage.setItem(`gradefy:business-draft:${user.id}`, JSON.stringify(values));
    } catch {
      // The form remains usable when browser storage is unavailable.
    }
  }, [user?.id, pending, values]);
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
    (item) => item.code === data?.catalog.defaultTemplateCode && item.nicheCode === niche?.code,
  );
  const publicOrigin = typeof window === 'undefined' ? '' : window.location.origin;
  const publicHost = typeof window === 'undefined' ? '' : window.location.host;
  const slugPreview = values.slug || 'seu-estabelecimento';
  const publicPreview = `${publicOrigin}/${slugPreview}`;
  const namePreview =
    values.name.trim() || (niche?.code === 'barbershop' ? 'Sua barbearia' : 'Seu estabelecimento');
  const basicComplete =
    values.name.trim().length >= 2 &&
    values.name.length <= 100 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug) &&
    values.slug.length >= 3 &&
    values.slug.length <= 60 &&
    !fieldErrors.name &&
    !fieldErrors.slug;
  const contactComplete =
    phoneValid(values.phone) &&
    (!values.whatsapp || phoneValid(values.whatsapp)) &&
    (!values.instagram ||
      /^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/.test(values.instagram)) &&
    !fieldErrors.phone &&
    !fieldErrors.whatsapp &&
    !fieldErrors.instagram;
  const addressStarted = !!(
    values.postal_code ||
    values.address ||
    values.neighborhood ||
    values.address_number ||
    values.address_complement
  );
  const locationComplete =
    values.city.trim().length >= 2 &&
    states.includes(values.region) &&
    (!values.postal_code || /^\d{5}-?\d{3}$/.test(values.postal_code)) &&
    (!addressStarted || (!!values.address.trim() && !!values.address_number.trim())) &&
    !fieldErrors.city &&
    !fieldErrors.region &&
    !fieldErrors.address &&
    !fieldErrors.address_number &&
    !fieldErrors.postal_code;
  const progress = [
    {
      label: 'Dados básicos',
      detail: 'Nome e endereço do site',
      complete: basicComplete,
      started: !!(values.name || values.slug || values.description),
    },
    {
      label: 'Contato',
      detail: 'Telefone e canais opcionais',
      complete: contactComplete,
      started: !!(values.phone || values.whatsapp || values.instagram),
    },
    {
      label: 'Localização',
      detail: 'Cidade, estado e endereço se informado',
      complete: locationComplete,
      started: !!(values.city || values.region || addressStarted),
    },
  ];
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
      try {
        sessionStorage.removeItem(`gradefy:business-draft:${user?.id}`);
      } catch {
        /* Browser storage may be unavailable. */
      }
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
              <dt>Site</dt>
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
          <ButtonLink to="/app/onboarding/niche" variant="secondary">
            Voltar ao segmento
          </ButtonLink>
        </Card>
      </div>
    ) : (
      <Loading />
    );
  if (!plan) return <Navigate to="/app/onboarding/plan" replace />;
  if (!niche) return <Navigate to="/app/onboarding/niche" replace />;
  if (!template) return <Navigate to="/app/onboarding/niche" replace />;
  return (
    <div className="gf-plans-page gf-business-page">
      <div className="gf-business-topline">
        <Link className="gf-back" to="/app/onboarding/niche">
          <ArrowLeft size={17} />
          Alterar segmento
        </Link>
        <Progress step={3} />
      </div>
      <div className="gf-plans-heading">
        <h1>Configure seu estabelecimento</h1>
        <p>Preencha os dados para criar sua empresa.</p>
      </div>
      <div className="gf-business-layout">
        <Card className="gf-business-choices">
          <span className="gf-business-choices-heading">
            <Building2 size={25} aria-hidden="true" />
            <strong>Suas escolhas</strong>
          </span>
          <span className="gf-business-choice-badges">
            <span>{plan.name}</span>
            <span>{niche.name}</span>
            <span>{template.name}</span>
          </span>
          <div className="gf-business-choice-links">
            <Link to="/app/onboarding/plan">
              <Pencil size={15} aria-hidden="true" /> Alterar plano
            </Link>
            <Link to="/app/onboarding/niche">
              <Pencil size={15} aria-hidden="true" /> Alterar segmento
            </Link>
          </div>
        </Card>
        <aside className="gf-business-preview" aria-labelledby="business-preview-title">
          <Card className="gf-business-preview-card">
            <h2 id="business-preview-title">
              <ClipboardList size={23} aria-hidden="true" /> Prévia e progresso
            </h2>
            <p>Veja como seu negócio ficará no Gradefy e acompanhe seu progresso.</p>
            <div
              className="gf-business-preview-site"
              role="group"
              aria-label="Simulação da vitrine do estabelecimento"
            >
              <div className="gf-business-preview-scene">
                <span>
                  <Store size={31} aria-hidden="true" />
                </span>
              </div>
              <strong>{namePreview}</strong>
              <span className="gf-business-preview-niche">{niche.name}</span>
              <span className="gf-business-preview-address">{publicPreview}</span>
              <small>Prévia visual · endereço disponível após publicação</small>
            </div>
            <div className="gf-business-progress">
              <h3>Progresso da configuração</h3>
              <ol>
                {progress.map((item) => (
                  <li key={item.label}>
                    {item.complete ? (
                      <Check size={19} aria-hidden="true" />
                    ) : (
                      <Circle size={19} aria-hidden="true" />
                    )}
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                      <small>{sectionState(item.complete, item.started)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <p className="gf-business-trial-note">
              <Info size={19} aria-hidden="true" /> Seu teste grátis ainda não começou. Criar a
              empresa não publica seu site nem gera cobrança.
            </p>
          </Card>
        </aside>
        <Card className="gf-business-form-card">
          <form onSubmit={submit}>
            <Feedback>{error}</Feedback>
            <fieldset disabled={busy} className="gf-business-fields">
              <legend className="gf-visually-hidden">Dados do estabelecimento</legend>
              <section
                className="gf-business-group gf-business-wide"
                aria-labelledby="business-about-title"
              >
                <h2 id="business-about-title">
                  <span className="gf-business-group-icon">
                    <Store size={22} aria-hidden="true" />
                  </span>
                  Sobre o negócio
                </h2>
                <div className="gf-business-group-fields">
                  <Input
                    label="Nome do estabelecimento"
                    value={values.name}
                    onChange={(event) => update('name', event.target.value)}
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Ex.: Seu estabelecimento"
                    autoComplete="organization"
                    error={fieldErrors.name}
                  />
                  <div className="gf-field gf-business-wide">
                    <label htmlFor="business-description">Descrição</label>
                    <textarea
                      id="business-description"
                      maxLength={1000}
                      placeholder="Conte brevemente o que torna seu espaço especial."
                      value={values.description}
                      onChange={(event) => update('description', event.target.value)}
                      aria-invalid={!!fieldErrors.description}
                      aria-describedby={fieldErrors.description ? 'description-error' : undefined}
                    />
                    <p className="gf-hint">
                      Esta descrição aparecerá no seu site após a publicação.
                    </p>
                    {fieldErrors.description && (
                      <p id="description-error" className="gf-field-error">
                        {fieldErrors.description}
                      </p>
                    )}
                  </div>
                </div>
              </section>
              <section
                className="gf-business-group gf-business-wide"
                aria-labelledby="business-site-title"
              >
                <h2 id="business-site-title">
                  <span className="gf-business-group-icon">
                    <Link2 size={22} aria-hidden="true" />
                  </span>
                  Endereço do site
                </h2>
                <div className="gf-business-site-row">
                  <div className="gf-field gf-business-slug-field">
                    <label htmlFor="business-slug">Nome público / slug</label>
                    <div
                      className={`gf-business-slug-control ${fieldErrors.slug ? 'gf-invalid' : ''}`}
                    >
                      <span aria-hidden="true">{publicHost}/</span>
                      <input
                        id="business-slug"
                        value={values.slug}
                        onChange={(event) => update('slug', event.target.value.toLowerCase())}
                        required
                        minLength={3}
                        maxLength={60}
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="seu-estabelecimento"
                        aria-invalid={!!fieldErrors.slug}
                        aria-describedby="business-slug-help"
                      />
                    </div>
                    <p
                      id="business-slug-help"
                      className={fieldErrors.slug ? 'gf-field-error' : 'gf-hint'}
                    >
                      {fieldErrors.slug || 'Use letras minúsculas, números e hífens.'}
                    </p>
                  </div>
                  <p className="gf-business-site-address">
                    <strong>Prévia do endereço após publicação</strong>
                    <span>{publicPreview}</span>
                  </p>
                </div>
              </section>
              <section
                className="gf-business-group gf-business-wide"
                aria-labelledby="business-contact-title"
              >
                <h2 id="business-contact-title">
                  <span className="gf-business-group-icon">
                    <Phone size={22} aria-hidden="true" />
                  </span>
                  Contatos
                </h2>
                <div className="gf-business-group-fields gf-business-contact-fields">
                  <Input
                    label="Telefone"
                    type="tel"
                    value={values.phone}
                    onChange={(event) => update('phone', event.target.value)}
                    required
                    maxLength={30}
                    autoComplete="tel"
                    placeholder="(11) 99999-0000"
                    hint="Inclua o DDD."
                    error={fieldErrors.phone}
                  />
                  <Input
                    label="WhatsApp"
                    type="tel"
                    value={values.whatsapp}
                    onChange={(event) => update('whatsapp', event.target.value)}
                    maxLength={30}
                    placeholder="(11) 99999-0000"
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
                </div>
              </section>
              <section
                className="gf-business-group gf-business-wide"
                aria-labelledby="business-location-title"
              >
                <h2 id="business-location-title">
                  <span className="gf-business-group-icon">
                    <MapPin size={22} aria-hidden="true" />
                  </span>
                  Localização
                </h2>
                <div className="gf-business-group-fields gf-business-location-fields">
                  <Input
                    label="CEP"
                    value={values.postal_code}
                    onChange={(e) => update('postal_code', e.target.value)}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={9}
                    pattern="[0-9]{5}-?[0-9]{3}"
                    placeholder="00000-000"
                    hint="Opcional. Ao completar oito números, buscamos seu endereço."
                    error={fieldErrors.postal_code}
                  />
                  {postal.message && (
                    <p role="status" aria-live="polite" className="gf-hint gf-business-wide">
                      {postal.message}
                    </p>
                  )}
                  <Input
                    label="Cidade"
                    value={values.city}
                    onChange={(event) => update('city', event.target.value)}
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="address-level2"
                    placeholder="Ex.: São Paulo"
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
                      <option value="">Selecione</option>
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
                    placeholder="Ex.: Rua do Contorno"
                    error={fieldErrors.address}
                    hint="Rua ou logradouro. Você pode corrigir o endereço manualmente."
                  />
                  <Input
                    label="Número do imóvel"
                    value={values.address_number}
                    onChange={(e) => update('address_number', e.target.value)}
                    maxLength={20}
                    placeholder="Ex.: 123 ou s/n"
                    required={
                      !!values.postal_code || !!values.neighborhood || !!values.address_complement
                    }
                    hint="Informe s/n quando não houver número."
                    error={fieldErrors.address_number}
                  />
                  <Input
                    label="Bairro"
                    value={values.neighborhood}
                    onChange={(e) => update('neighborhood', e.target.value)}
                    maxLength={100}
                    autoComplete="address-level3"
                    placeholder="Ex.: Centro"
                    error={fieldErrors.neighborhood}
                  />
                  <Input
                    label="Complemento (opcional)"
                    value={values.address_complement}
                    onChange={(e) => update('address_complement', e.target.value)}
                    maxLength={100}
                    autoComplete="address-line2"
                    placeholder="Ex.: Sala 2, Loja A"
                    error={fieldErrors.address_complement}
                  />
                </div>
              </section>
            </fieldset>
            <div className="gf-business-actions">
              <ButtonLink to="/app/onboarding/niche" variant="secondary">
                <ArrowLeft size={18} aria-hidden="true" /> Voltar
              </ButtonLink>
              <Button type="submit" busy={busy}>
                <Building2 size={18} aria-hidden="true" />
                {busy ? 'Criando empresa…' : 'Criar minha empresa'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
