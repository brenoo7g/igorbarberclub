import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Images, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../lib';
import { EmptyState, ErrorBox, Modal, PageHeading, Spinner } from '../components/UI';
import { PortfolioImage } from '../components/Portfolio';
import type { PortfolioPhoto } from '../components/Portfolio';

async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Escolha uma foto JPG, PNG ou WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Escolha uma foto de até 10 MB.');
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível abrir a foto.'));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = source;
  try {
    await image.decode();
  } catch {
    throw new Error('Não foi possível ler a foto. Escolha outro arquivo.');
  }
  if (
    !image.naturalWidth ||
    !image.naturalHeight ||
    image.naturalWidth * image.naturalHeight > 40000000
  )
    throw new Error('A resolução da foto é muito grande. Use uma foto de até 40 megapixels.');
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não conseguiu preparar a foto.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL('image/webp', 0.82);
  if (result.length > 1400000) throw new Error('A foto ficou muito grande. Escolha outra imagem.');
  return result;
}

export function PortfolioAdmin() {
  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<PortfolioPhoto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PortfolioPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const [formError, setFormError] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Degradês');
  const [image, setImage] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setError('');
    setLoading(true);
    try {
      setPhotos(await api<PortfolioPhoto[]>('/portfolio', { signal }));
    } catch (e) {
      if (!signal?.aborted) setError(errorMessage(e));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  function edit(photo: PortfolioPhoto | 'new') {
    setTitle(photo === 'new' ? '' : photo.title);
    setCategory(photo === 'new' ? 'Degradês' : photo.category);
    setImage('');
    setFormError('');
    setEditing(photo);
  }
  async function upload(file?: File) {
    if (!file || operation.current) return;
    operation.current = true;
    setBusy(true);
    setFormError('');
    try {
      setImage(await preparePhoto(file));
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || operation.current) return;
    if (editing === 'new' && !image) {
      setFormError('Escolha a foto do corte.');
      return;
    }
    operation.current = true;
    setBusy(true);
    setFormError('');
    try {
      const saved = await api<PortfolioPhoto>(
        `/admin/portfolio${editing === 'new' ? '' : `/${editing.id}`}`,
        {
          method: editing === 'new' ? 'POST' : 'PUT',
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            title,
            category,
            ...(image ? { image } : {}),
            ...(editing === 'new' ? {} : { version: editing.version }),
          }),
        },
      );
      setPhotos((items) =>
        editing === 'new'
          ? [saved, ...items]
          : items.map((item) => (item.id === saved.id ? saved : item)),
      );
      setNotice('Foto publicada em Nossos Trabalhos.');
      setEditing(null);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting || operation.current) return;
    operation.current = true;
    setBusy(true);
    setFormError('');
    try {
      await api(`/admin/portfolio/${deleting.id}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(30000),
      });
      setPhotos((items) => items.filter((item) => item.id !== deleting.id));
      setDeleting(null);
      setNotice('Foto removida da galeria.');
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading eyebrow="PORTFÓLIO DA BARBEARIA" title="Nossos Trabalhos">
        <button
          className="button primary"
          disabled={loading || photos.length >= 40}
          onClick={() => edit('new')}
        >
          <Plus size={18} />
          Adicionar foto
        </button>
      </PageHeading>
      <p className="muted">
        Publique fotos dos seus cortes. As mais recentes aparecem primeiro no site. Até 40 fotos.
      </p>
      {notice && (
        <p role="status" className="portfolio-notice">
          {notice}
        </p>
      )}
      <ErrorBox message={error} />
      <button
        className="text-link portfolio-refresh"
        disabled={loading}
        onClick={() => void load()}
      >
        Atualizar galeria
      </button>
      {loading ? (
        <Spinner />
      ) : !error && !photos.length ? (
        <EmptyState icon={<Images />} title="Mostre seu trabalho">
          Adicione a primeira foto de um corte realizado na barbearia.
        </EmptyState>
      ) : (
        <div className="portfolio-admin-grid">
          {photos.map((photo) => (
            <article className="panel portfolio-admin-card" key={photo.id}>
              <PortfolioImage photo={photo} />
              <div>
                <h3>{photo.title}</h3>
                <p className="muted">{photo.category}</p>
                <div className="portfolio-admin-actions">
                  <button
                    className="button ghost"
                    aria-label={`Editar ${photo.title}`}
                    onClick={() => edit(photo)}
                  >
                    <Pencil size={16} />
                    Editar
                  </button>
                  <button
                    className="button danger"
                    aria-label={`Remover ${photo.title}`}
                    onClick={() => {
                      setFormError('');
                      setDeleting(photo);
                    }}
                  >
                    <Trash2 size={16} />
                    Remover
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <Modal
          title={editing === 'new' ? 'Adicionar foto' : 'Editar foto'}
          onClose={() => {
            if (!operation.current) setEditing(null);
          }}
        >
          <form className="form-stack" onSubmit={save}>
            <ErrorBox message={formError} />
            <label>
              Foto do corte
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <p className="form-note">
              JPG, PNG ou WebP, até 10 MB. A foto será otimizada para o site.
            </p>
            {(image || editing !== 'new') && (
              <img
                className="portfolio-preview"
                src={image || (editing as PortfolioPhoto).image}
                alt="Prévia da foto do corte"
              />
            )}
            <label>
              Título do corte
              <input
                required
                minLength={2}
                maxLength={80}
                value={title}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Degradê na régua"
              />
            </label>
            <label>
              Categoria
              <input
                required
                minLength={2}
                maxLength={40}
                value={category}
                disabled={busy}
                onChange={(e) => setCategory(e.target.value)}
                list="portfolio-categories"
              />
            </label>
            <datalist id="portfolio-categories">
              {['Degradês', 'Barba', 'Coloração', 'Cortes clássicos'].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <button className="button primary full" disabled={busy}>
              {busy ? 'Aguarde...' : 'Publicar foto'}
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Remover foto?"
          onClose={() => {
            if (!operation.current) setDeleting(null);
          }}
        >
          <p>A foto “{deleting.title}” será removida de Nossos Trabalhos.</p>
          <ErrorBox message={formError} />
          <div className="modal-actions">
            <button className="button ghost" disabled={busy} onClick={() => setDeleting(null)}>
              Voltar
            </button>
            <button className="button danger" disabled={busy} onClick={remove}>
              {busy ? 'Removendo...' : 'Confirmar remoção'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
