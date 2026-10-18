import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Check,
  Clock3,
  Eye,
  ImagePlus,
  LayoutDashboard,
  MapPin,
  Palette,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import type { Form, State } from './site-editor';
import { Button, Card, Feedback, Input } from './components';
import { WorkingHours } from './working-hours';
import './minisite-editor.css';
const sections = [
  { id: 'overview', name: 'Visão geral', Icon: LayoutDashboard },
  { id: 'identity', name: 'Identidade', Icon: Palette },
  { id: 'portfolio', name: 'Portfólio', Icon: ImagePlus },
  { id: 'contact', name: 'Contatos e localização', Icon: MapPin },
  { id: 'hours', name: 'Horário de funcionamento', Icon: Clock3 },
  { id: 'publication', name: 'Publicação', Icon: Send },
] as const;
type Section = (typeof sections)[number]['id'];
interface Props {
  data: State;
  form: Form;
  companyId: string;
  allowed: { id: string; name: string }[];
  onCompany: (id: string) => void;
  onboarding: boolean;
  busy: boolean;
  error: string;
  message: string;
  fieldErrors: Record<string, string>;
  change: <K extends keyof Form>(key: K, value: Form[K]) => void;
  save: (event: FormEvent) => void;
  mutate: (path: string, options: RequestInit, preserveForm?: boolean) => Promise<void>;
  upload: (purpose: string, file: File | undefined) => void;
  move: (index: number, direction: number) => void;
  reload: () => void;
}
export default function MiniSiteEditor({
  data,
  form,
  companyId,
  allowed,
  onCompany,
  onboarding,
  busy,
  error,
  message,
  fieldErrors,
  change,
  save,
  mutate,
  upload,
  move,
  reload,
}: Props) {
  const [section, setSection] = useState<Section>('overview'),
    [confirmUnpublish, setConfirmUnpublish] = useState(false),
    [discard, setDiscard] = useState(false);
  const dirty =
    JSON.stringify({ ...form, version: 0 }) !==
    JSON.stringify({ ...data.settings, name: data.company.name, version: 0 });
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const preview = `/preview/site/${encodeURIComponent(companyId)}`;
  const ready = Boolean(
    form.name.trim() &&
    data.operations.services &&
    data.operations.professionals &&
    data.plan.valid,
  );
  const input = (
    key:
      | 'name'
      | 'slogan'
      | 'whatsapp'
      | 'phone'
      | 'instagram_url'
      | 'address'
      | 'city'
      | 'region'
      | 'location_url',
    label: string,
    max: number,
  ) => (
    <Input
      label={label}
      value={form[key]}
      maxLength={max}
      required={key === 'name'}
      minLength={key === 'name' ? 2 : undefined}
      error={fieldErrors[key]}
      onChange={(e) =>
        change(key, key === 'region' ? e.target.value.toUpperCase() : e.target.value)
      }
    />
  );
  const image = (purpose: 'logo' | 'banner') => (
    <div className="gf-mini-upload" key={purpose}>
      <h3>{purpose === 'logo' ? 'Logotipo' : 'Banner opcional'}</h3>
      {data.images[purpose] ? (
        <img
          src={data.images[purpose]!}
          alt={purpose === 'logo' ? 'Logo da empresa' : 'Banner da empresa'}
        />
      ) : (
        <span className="gf-mini-image-empty">
          <ImagePlus size={22} />
          {purpose === 'logo' ? 'Sua marca aqui' : 'Imagem de destaque'}
        </span>
      )}
      <Input
        label={purpose === 'logo' ? 'Enviar logo' : 'Enviar banner'}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy || !data.storage.configured}
        onChange={(e) => {
          upload(purpose, e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {data.images[purpose] && (
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            mutate(`/images/${purpose}`, {
              method: 'DELETE',
              body: JSON.stringify({ version: data.settings.version }),
            })
          }
        >
          Remover {purpose === 'logo' ? 'logo' : 'banner'}
        </Button>
      )}
    </div>
  );
  return (
    <div className="gf-mini-editor gf-plans-page">
      <Link
        className="gf-back"
        to={onboarding ? '/app/onboarding/complete' : '/app/dashboard'}
        onClick={(e) => {
          if (dirty || busy) e.preventDefault();
        }}
      >
        <ArrowLeft size={16} />
        {onboarding ? 'Revisão do negócio' : 'Voltar ao painel'}
      </Link>
      <header className="gf-mini-heading">
        <div>
          <div className="gf-kicker">GRADEFY MINI SITE</div>
          <h1>{onboarding ? 'Personalize seu Mini Site' : 'Meu Site'}</h1>
          <p>{data.company.name}</p>
        </div>
        <span className={'gf-mini-status ' + (data.company.sitePublished ? 'is-published' : '')}>
          {data.company.sitePublished ? 'Publicado' : 'Rascunho'}
        </span>
      </header>
      {allowed.length > 1 && (
        <div className="gf-field">
          <label htmlFor="mini-company">Empresa</label>
          <select
            id="mini-company"
            value={companyId}
            disabled={busy || dirty}
            onChange={(e) => onCompany(e.target.value)}
          >
            {allowed.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Feedback>{error ? [error, ...new Set(Object.values(fieldErrors))].join(' ') : ''}</Feedback>
      <Feedback success>{message}</Feedback>
      {error && (
        <div className="gf-mini-reload">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => (dirty ? setDiscard(true) : reload())}
          >
            Recarregar dados
          </Button>
          {discard && (
            <>
              <p>Descartar as alterações não salvas e carregar a versão atual?</p>
              <Button type="button" onClick={reload}>
                Descartar e recarregar
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDiscard(false)}>
                Continuar editando
              </Button>
            </>
          )}
        </div>
      )}
      <div className="gf-mini-workspace">
        <nav aria-label="Seções do editor">
          {sections.map(({ id, name, Icon }) => (
            <button
              type="button"
              key={id}
              aria-current={section === id ? 'page' : undefined}
              disabled={busy}
              onClick={() => setSection(id)}
            >
              <Icon size={18} />
              {name}
            </button>
          ))}
        </nav>
        <form onSubmit={save} className="gf-mini-content">
          <fieldset disabled={busy} className="gf-site-fieldset">
            <legend className="gf-visually-hidden">Personalização do Mini Site</legend>
            {section === 'overview' && (
              <Card className="gf-mini-overview">
                <div className="gf-mini-section-title">
                  <div>
                    <h2>Seu negócio, sua identidade</h2>
                    <p>Configure, confira e publique quando estiver pronto.</p>
                  </div>
                  <Eye size={22} />
                </div>
                <div className="gf-mini-overview-grid">
                  <div>
                    <strong>{form.name}</strong>
                    <p>{data.company.slug}</p>
                    <ul>
                      <li>
                        <Check size={16} />
                        Logo e cores da sua marca
                      </li>
                      <li>
                        <Check size={16} />
                        Até cinco fotos do seu trabalho
                      </li>
                      <li>
                        <Check size={16} />
                        Agendamento integrado
                      </li>
                    </ul>
                    <Button type="button" onClick={() => setSection('identity')}>
                      Começar pela identidade <ArrowRight size={16} />
                    </Button>
                    <Link className="gf-mini-preview-link" to={preview}>
                      Visualizar meu site
                    </Link>
                  </div>
                  <div className="gf-mini-preview">
                    <iframe
                      title="Prévia do Mini Site"
                      src={`${preview}?v=${data.settings.version}`}
                      loading="lazy"
                    />
                    <small>Prévia privada dos dados salvos · Agendamentos desativados</small>
                  </div>
                </div>
              </Card>
            )}
            {section === 'identity' && (
              <Card>
                <h2>Identidade</h2>
                <div className="gf-business-fields">
                  {input('name', 'Nome público da empresa', 100)}
                  {input('slogan', 'Slogan (opcional)', 180)}
                  <div className="gf-field gf-business-wide">
                    <label htmlFor="mini-description">Descrição</label>
                    <textarea
                      id="mini-description"
                      value={form.description}
                      maxLength={1000}
                      onChange={(e) => change('description', e.target.value)}
                    />
                  </div>
                </div>
                <div className="gf-mini-media-grid">
                  {image('logo')}
                  {image('banner')}
                </div>
                {!data.storage.configured && (
                  <Feedback>
                    Armazenamento de imagens indisponível. Continue salvando seus textos e tente
                    enviar as fotos mais tarde.
                  </Feedback>
                )}
                <div className="gf-field-pair">
                  <Input
                    label="Cor principal"
                    type="color"
                    value={form.primary_color || '#6C5CE7'}
                    onChange={(e) => change('primary_color', e.target.value)}
                    error={fieldErrors.primary_color}
                  />
                  <Input
                    label="Cor secundária"
                    type="color"
                    value={form.secondary_color || '#00D4FF'}
                    onChange={(e) => change('secondary_color', e.target.value)}
                    error={fieldErrors.secondary_color}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    change('primary_color', null);
                    change('secondary_color', null);
                  }}
                >
                  Restaurar cores do template
                </Button>
              </Card>
            )}
            {section === 'portfolio' && (
              <Card>
                <div className="gf-mini-section-title">
                  <h2>Portfólio</h2>
                  <span>{data.gallery.length}/5 fotos</span>
                </div>
                <p className="gf-mini-muted">
                  Fotos são salvas ao enviar. Use as setas para mudar a ordem.
                </p>
                <Input
                  label="Adicionar fotografia"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || !data.storage.configured || data.gallery.length >= 5}
                  onChange={(e) => {
                    upload('gallery', e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                {!data.storage.configured && (
                  <Feedback>
                    Armazenamento indisponível. Seus dados e fotos anteriores estão preservados.
                  </Feedback>
                )}
                {!data.gallery.length && (
                  <div className="gf-mini-empty">
                    <ImagePlus />
                    <p>Mostre seus melhores trabalhos. Adicione sua primeira foto.</p>
                  </div>
                )}
                <div className="gf-editor-gallery gf-mini-gallery">
                  {data.gallery.map((photo, index) => (
                    <div key={photo.id}>
                      <img src={photo.image} alt={photo.title} />
                      <div>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy || index === 0}
                          aria-label={`Mover foto ${index + 1} para cima`}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy || index === data.gallery.length - 1}
                          aria-label={`Mover foto ${index + 1} para baixo`}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          aria-label={`Excluir foto ${index + 1}`}
                          onClick={() =>
                            mutate(`/gallery/${encodeURIComponent(photo.id)}`, {
                              method: 'DELETE',
                              body: JSON.stringify({ version: data.settings.version }),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {section === 'contact' && (
              <Card>
                <h2>Contatos e localização</h2>
                <div className="gf-business-fields">
                  {input('whatsapp', 'WhatsApp', 30)}
                  {input('phone', 'Telefone', 30)}
                  {input('instagram_url', 'Instagram', 200)}
                  {input('location_url', 'Link de localização', 500)}
                  {input('address', 'Endereço', 250)}
                  {input('city', 'Cidade', 100)}
                  {input('region', 'Estado (UF)', 2)}
                </div>
                {data.addressDetails?.postal_code && (
                  <p className="gf-mini-muted">
                    Endereço preenchido no cadastro · CEP {data.addressDetails.postal_code}.
                  </p>
                )}
              </Card>
            )}
            {section === 'hours' && (
              <Card>
                <h2>Horário de funcionamento</h2>
                <p>Expediente do estabelecimento, independente das agendas individuais.</p>
                <small className="gf-mini-muted">
                  Fuso: {data.company.timezone.replaceAll('_', ' ')}
                </small>
                <WorkingHours
                  days={form.working_days ?? null}
                  onChange={(days) => change('working_days', days)}
                  disabled={busy || !data.plan.valid}
                />
                {!data.plan.valid && (
                  <Feedback>
                    Horários disponíveis para consulta. Verifique a situação do plano para alterar.
                  </Feedback>
                )}
              </Card>
            )}
            {section === 'publication' && (
              <Card>
                <h2>{data.company.sitePublished ? 'Seu site está no ar!' : 'Publicação'}</h2>
                <ul className="gf-mini-checklist">
                  {[
                    [Boolean(form.name.trim()), 'Nome do estabelecimento'],
                    [Boolean(data.operations.services), 'Serviços cadastrados'],
                    [Boolean(data.operations.professionals), 'Profissionais cadastrados'],
                    [data.plan.valid, 'Plano ou teste grátis vigente'],
                    [!dirty, 'Alterações salvas'],
                  ].map(([ok, label]) => (
                    <li key={String(label)}>
                      <span className={ok ? 'is-ready' : ''}>
                        {ok ? <Check size={16} /> : <Clock3 size={16} />}
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
                <p className="gf-mini-muted">
                  A agenda e os recursos são validados novamente ao publicar.
                </p>
                <div className="gf-mini-actions">
                  <Link
                    className="gf-button gf-secondary"
                    to={preview}
                    onClick={(e) => {
                      if (busy) e.preventDefault();
                    }}
                  >
                    Visualizar meu site
                  </Link>
                  {data.company.sitePublished ? (
                    <>
                      <a
                        className="gf-button gf-secondary"
                        href={`/${data.company.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir meu site
                      </a>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy || dirty}
                        onClick={() => setConfirmUnpublish(true)}
                      >
                        Retirar site do ar
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      disabled={busy || dirty || !ready}
                      onClick={() =>
                        mutate('/publish', {
                          method: 'POST',
                          body: JSON.stringify({ version: data.settings.version }),
                        })
                      }
                    >
                      Publicar meu site
                    </Button>
                  )}
                </div>
                {confirmUnpublish && (
                  <div className="gf-mini-confirm">
                    <p>Retirar o site do ar? As reservas anteriores serão preservadas.</p>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        await mutate('/unpublish', {
                          method: 'POST',
                          body: JSON.stringify({ version: data.settings.version }),
                        });
                        setConfirmUnpublish(false);
                      }}
                    >
                      Confirmar retirada
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setConfirmUnpublish(false)}
                    >
                      Manter publicado
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </fieldset>
          <footer className="gf-mini-savebar">
            <span role="status">
              {busy ? 'Salvando…' : dirty ? 'Alterações não salvas' : 'Tudo salvo'}
            </span>
            <Button type="submit" busy={busy} disabled={!dirty}>
              <Save size={17} />
              {onboarding ? 'Salvar rascunho' : 'Salvar alterações'}
            </Button>
            {onboarding && (
              <Link
                className="gf-button gf-secondary"
                aria-disabled={dirty || busy}
                onClick={(e) => {
                  if (dirty || busy) e.preventDefault();
                }}
                to="/app/onboarding/complete"
              >
                Concluir e revisar <ArrowRight size={16} />
              </Link>
            )}
          </footer>
        </form>
      </div>
    </div>
  );
}
