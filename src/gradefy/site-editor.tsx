import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, ArrowDown, ImagePlus, Save, ShieldCheck } from 'lucide-react';
import { useApp } from '../context';
import { ApiError, errorMessage } from '../lib';
import { useCompanies } from './company-access';
import { Button, ButtonLink, Card, Feedback, Input, Loading } from './components';

interface Settings {
  version: number;
  slogan: string;
  description: string;
  primary_color: string | null;
  secondary_color: string | null;
  whatsapp: string;
  phone: string;
  instagram_url: string;
  address: string;
  city: string;
  region: string;
  location_url: string;
  sections: { about: boolean; gallery: boolean };
}
interface State {
  company: { id: string; name: string; slug: string; sitePublished: boolean };
  settings: Settings;
  images: { logo: string | null; banner: string | null };
  gallery: { id: string; title: string; image: string; version: number }[];
  storage: { configured: boolean; maxBytes: number; formats: string[]; cleanupPending: number };
  operations: { services: number; professionals: number };
}
type Form = Settings & { name: string };
const labels: {
  key: keyof Omit<Settings, 'version' | 'sections' | 'description'> | 'name';
  label: string;
  max: number;
}[] = [
  { key: 'name', label: 'Nome público da empresa', max: 100 },
  { key: 'slogan', label: 'Slogan (opcional)', max: 180 },
  { key: 'whatsapp', label: 'WhatsApp', max: 30 },
  { key: 'phone', label: 'Telefone', max: 30 },
  { key: 'instagram_url', label: 'Instagram', max: 200 },
  { key: 'address', label: 'Endereço', max: 250 },
  { key: 'city', label: 'Cidade', max: 100 },
  { key: 'region', label: 'Estado (UF)', max: 2 },
  { key: 'location_url', label: 'Link de localização', max: 500 },
];
export default function SiteEditor() {
  const { user, loading, api } = useApp();
  const { companies, business, error: accessError, retry } = useCompanies();
  const [query, setQuery] = useSearchParams();
  const allowed = companies?.filter((c) => ['owner', 'manager'].includes(c.role));
  const companyId = query.get('empresa') || (allowed?.length === 1 ? allowed[0].id : '');
  const [data, setData] = useState<State | null>(null),
    [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const submitting = useRef(false);
  useEffect(() => {
    if (!user || !companies || !companyId) return;
    let active = true;
    setData(null);
    setForm(null);
    setError('');
    setMessage('');
    api<State>('/company-site', { headers: { 'X-Gradefy-Company-Id': companyId } })
      .then((result) => {
        if (active) {
          setData(result);
          setForm({ ...result.settings, name: result.company.name });
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [user?.id, companies, companyId, api, revision]);
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/app/login" replace state={{ sessionRequired: true }} />;
  if (accessError)
    return (
      <div className="gf-ready">
        <Card>
          <Feedback>{accessError}</Feedback>
          <Button onClick={retry}>Tentar novamente</Button>
        </Card>
      </div>
    );
  if (!companies) return <Loading />;
  if (!allowed?.length)
    return (
      <div className="gf-ready">
        <Card>
          <h1>Meu Site</h1>
          <p>
            {business
              ? 'Conclua a configuração da empresa antes de personalizar seu site.'
              : 'Você precisa de permissão de proprietário ou gestor para editar um site.'}
          </p>
          <ButtonLink to={business ? '/app/onboarding/operations' : '/app/conta'}>
            Voltar para minha conta
          </ButtonLink>
        </Card>
      </div>
    );
  async function mutate(path: string, options: RequestInit, preserveForm = true) {
    if (submitting.current || !data) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setFieldErrors({});
    try {
      const next = await api<State>(`/company-site${path}`, {
        ...options,
        headers: { 'X-Gradefy-Company-Id': companyId, ...options.headers },
      });
      setData(next);
      setForm((previous) =>
        preserveForm && previous
          ? { ...previous, version: next.settings.version }
          : { ...next.settings, name: next.company.name },
      );
      setConfirmUnpublish(false);
      setMessage(
        path === '/publish'
          ? 'Seu site está no ar!'
          : path === '/unpublish'
            ? 'Site retirado do ar. Suas reservas foram preservadas.'
            : path.startsWith('/uploads')
              ? 'Imagem salva.'
              : 'Alterações salvas.',
      );
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError)
        setFieldErrors(Object.fromEntries(e.details.map((d) => [d.field, d.message])));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function change<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }
  function save(e: FormEvent) {
    e.preventDefault();
    if (form) void mutate('', { method: 'PUT', body: JSON.stringify(form) }, false);
  }
  function upload(purpose: string, file: File | undefined) {
    if (!file || !data) return;
    if (!data.storage.formats.includes(file.type)) {
      setError('Escolha uma imagem JPG, PNG ou WebP. SVG não é permitido.');
      return;
    }
    if (file.size > data.storage.maxBytes) {
      setError('A imagem deve ter no máximo 3 MB.');
      return;
    }
    void mutate(`/uploads/${purpose}`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type, 'X-Site-Version': String(data.settings.version) },
    });
  }
  function move(position: number, direction: number) {
    if (!data) return;
    const ids = data.gallery.map((g) => g.id);
    [ids[position], ids[position + direction]] = [ids[position + direction], ids[position]];
    void mutate('/gallery/order', {
      method: 'PUT',
      body: JSON.stringify({ version: data.settings.version, ids }),
    });
  }
  return (
    <div className="gf-plans-page gf-site-editor">
      <Link className="gf-back" to="/app/conta">
        <ArrowLeft size={16} />
        Voltar para minha conta
      </Link>
      <div className="gf-plans-heading">
        <div className="gf-kicker">SEU NEGÓCIO, SUA IDENTIDADE</div>
        <h1>Meu Site</h1>
        <p>Personalize o Barber Classic com as informações da sua empresa.</p>
      </div>
      {allowed.length > 1 && (
        <div className="gf-field">
          <label htmlFor="editor-company">Empresa</label>
          <select
            id="editor-company"
            value={companyId}
            disabled={busy}
            onChange={(e) => setQuery({ empresa: e.target.value })}
          >
            <option value="">Escolha sua empresa</option>
            {allowed.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Feedback>{error}</Feedback>
      <Feedback success>{message}</Feedback>
      {error && (
        <Button variant="secondary" disabled={busy} onClick={() => setRevision((r) => r + 1)}>
          Recarregar dados
        </Button>
      )}
      {!companyId ? (
        <Card>
          <p>Selecione uma empresa para continuar.</p>
        </Card>
      ) : !data || !form ? (
        !error && <Loading />
      ) : (
        <>
          <div className="gf-site-status">
            <ShieldCheck size={19} />
            {data.company.sitePublished
              ? 'Salvar atualiza o site já publicado.'
              : 'Seu site ainda não foi publicado. Salvar não publica o site.'}
          </div>
          <Card>
            <h2>{data.company.sitePublished ? 'Seu site está no ar!' : 'Prévia e publicação'}</h2>
            <p>
              {data.company.sitePublished
                ? 'Status: publicado. Alterações salvas atualizam o site público.'
                : 'Status: não publicado. Visualize os dados salvos antes de publicar.'}
            </p>
            <div className="gf-site-actions">
              <Link
                className="gf-button gf-secondary"
                to={`/preview/site/${encodeURIComponent(companyId)}`}
              >
                Visualizar meu site
              </Link>
              {data.company.sitePublished ? (
                <>
                  <a
                    className="gf-button gf-primary"
                    href={`/${encodeURIComponent(data.company.slug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir meu site
                  </a>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${window.location.origin}/${data.company.slug}`,
                        );
                        setMessage('Link copiado.');
                      } catch {
                        setError('Não foi possível copiar. Selecione o endereço abaixo.');
                      }
                    }}
                  >
                    Copiar link
                  </Button>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onClick={async () => {
                      try {
                        const url = `${window.location.origin}/${data.company.slug}`;
                        if (navigator.share)
                          await navigator.share({ title: data.company.name, url });
                        else {
                          await navigator.clipboard.writeText(url);
                          setMessage('Link copiado para compartilhar.');
                        }
                      } catch (e) {
                        if (!(e instanceof Error && e.name === 'AbortError'))
                          setError('Não foi possível compartilhar. Copie o endereço do site.');
                      }
                    }}
                  >
                    Compartilhar
                  </Button>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onClick={() => setConfirmUnpublish(true)}
                  >
                    Retirar site do ar
                  </Button>
                </>
              ) : (
                <Button
                  disabled={busy}
                  busy={busy}
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
            {data.company.sitePublished && (
              <p className="gf-public-address">
                {window.location.origin}/{data.company.slug}
              </p>
            )}
            {confirmUnpublish && (
              <div className="gf-feedback" role="group" aria-label="Confirmação de despublicação">
                <p>
                  Retirar o site do ar? Novos agendamentos ficarão indisponíveis. Fotos, serviços e
                  reservas anteriores serão preservados.
                </p>
                <div className="gf-site-actions">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      mutate('/unpublish', {
                        method: 'POST',
                        body: JSON.stringify({ version: data.settings.version }),
                      })
                    }
                  >
                    Confirmar retirada
                  </Button>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onClick={() => setConfirmUnpublish(false)}
                  >
                    Manter publicado
                  </Button>
                </div>
              </div>
            )}
          </Card>
          <form onSubmit={save}>
            <fieldset disabled={busy} className="gf-site-fieldset">
              <legend className="gf-visually-hidden">Personalização do site</legend>
              <Card>
                <h2>Identidade</h2>
                <div className="gf-business-fields">
                  {labels.slice(0, 2).map(({ key, label, max }) => (
                    <Input
                      key={key}
                      label={label}
                      value={form[key] ?? ''}
                      maxLength={max}
                      required={key === 'name'}
                      minLength={key === 'name' ? 2 : undefined}
                      error={fieldErrors[key]}
                      onChange={(e) => change(key, e.target.value)}
                    />
                  ))}
                  <div className="gf-field gf-business-wide">
                    <label htmlFor="site-description">Descrição</label>
                    <textarea
                      id="site-description"
                      value={form.description}
                      maxLength={1000}
                      onChange={(e) => change('description', e.target.value)}
                    />
                  </div>
                </div>
              </Card>
              <Card>
                <h2>Aparência</h2>
                <div className="gf-field-pair">
                  <Input
                    label="Cor principal"
                    type="color"
                    value={form.primary_color || '#335CFF'}
                    onChange={(e) => change('primary_color', e.target.value)}
                    error={fieldErrors.primary_color}
                  />
                  <Input
                    label="Cor secundária"
                    type="color"
                    value={form.secondary_color || '#EF3340'}
                    onChange={(e) => change('secondary_color', e.target.value)}
                    error={fieldErrors.secondary_color}
                  />
                </div>
                <div
                  className="gf-color-sample"
                  style={{ borderColor: form.primary_color || '#335CFF' }}
                >
                  <span style={{ background: form.secondary_color || '#EF3340' }} />
                  <strong>{form.name}</strong>
                  <p>Amostra das cores do seu site</p>
                  <span
                    className="gf-sample-cta"
                    style={{ background: form.primary_color || '#335CFF' }}
                  >
                    Agendar horário
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setForm({ ...form, primary_color: null, secondary_color: null })}
                >
                  Restaurar cores do template
                </Button>
              </Card>
              <Card>
                <h2>Contato e localização</h2>
                <div className="gf-business-fields">
                  {labels.slice(2).map(({ key, label, max }) => (
                    <Input
                      key={key}
                      label={label}
                      value={form[key] ?? ''}
                      maxLength={max}
                      error={fieldErrors[key]}
                      onChange={(e) =>
                        change(
                          key,
                          key === 'region' ? e.target.value.toUpperCase() : e.target.value,
                        )
                      }
                    />
                  ))}
                </div>
              </Card>
              <Card>
                <h2>Seções opcionais</h2>
                <div className="gf-site-section-options">
                  {(
                    [
                      { key: 'about', label: 'Mostrar seção sobre a empresa' },
                      { key: 'gallery', label: 'Mostrar galeria de trabalhos' },
                    ] as const
                  ).map(({ key, label }) => (
                    <label key={key} className="gf-check">
                      <input
                        type="checkbox"
                        checked={form.sections[key]}
                        onChange={(e) =>
                          change('sections', { ...form.sections, [key]: e.target.checked })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <p>Os textos e o layout do Barber Classic são preservados.</p>
              </Card>
            </fieldset>
            <Button type="submit" busy={busy}>
              <Save size={17} />
              Salvar alterações
            </Button>
          </form>
          <Card className="gf-site-media">
            <h2>Logo e imagem principal</h2>
            <p>As imagens são salvas ao enviar. JPG, PNG ou WebP de até 3 MB.</p>
            {!data.storage.configured && (
              <Feedback>
                O armazenamento de imagens ainda não foi configurado. Textos, cores e seções podem
                ser salvos normalmente.
              </Feedback>
            )}
            <div className="gf-site-image-grid">
              {(['logo', 'banner'] as const).map((purpose) => (
                <div key={purpose}>
                  <h3>{purpose === 'logo' ? 'Logo' : 'Banner principal'}</h3>
                  {data.images[purpose] ? (
                    <img
                      src={data.images[purpose]!}
                      alt={purpose === 'logo' ? 'Logo da empresa' : 'Banner da empresa'}
                    />
                  ) : (
                    <div className="gf-image-empty">
                      <ImagePlus size={28} />
                      Nenhuma imagem
                    </div>
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
              ))}
            </div>
          </Card>
          <Card className="gf-site-media">
            <h2>Galeria</h2>
            <p>{data.gallery.length}/40 fotos. Reordene com as setas.</p>
            <Input
              label="Adicionar fotografia"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || !data.storage.configured || data.gallery.length >= 40}
              onChange={(e) => {
                upload('gallery', e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {!data.gallery.length && <p>Nenhuma fotografia cadastrada.</p>}
            <div className="gf-editor-gallery">
              {data.gallery.map((g, i) => (
                <div key={g.id}>
                  <img src={g.image} alt={g.title} />
                  <div>
                    <Button
                      variant="secondary"
                      disabled={busy || i === 0}
                      aria-label={`Mover foto ${i + 1} para cima`}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={16} />
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy || i === data.gallery.length - 1}
                      aria-label={`Mover foto ${i + 1} para baixo`}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={16} />
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      aria-label={`Excluir foto ${i + 1}`}
                      onClick={() =>
                        mutate(`/gallery/${encodeURIComponent(g.id)}`, {
                          method: 'DELETE',
                          body: JSON.stringify({ version: data.settings.version }),
                        })
                      }
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {data.storage.cleanupPending > 0 && (
              <p>A remoção foi registrada. A limpeza do armazenamento será tentada novamente.</p>
            )}
          </Card>
          <Card>
            <h2>Dados de atendimento</h2>
            <p>
              {data.operations.services} serviços ativos · {data.operations.professionals}{' '}
              profissionais ativos
            </p>
            <p>Os atendimentos usam os cadastros existentes. Não são duplicados no editor.</p>
          </Card>
        </>
      )}
    </div>
  );
}
