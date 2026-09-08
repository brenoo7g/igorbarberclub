import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, LockKeyhole, Save, UserRound } from 'lucide-react';
import { useApp } from '../context';
import { api, ApiError, errorMessage } from '../lib';
import { prepareProfileImage } from '../profile-image';
import type { User } from '../types';
import { Avatar } from '../components/Avatar';
import { AuthForm } from '../components/AuthForm';
import { ErrorBox, PageHeading, Spinner } from '../components/UI';

const draftOf = (user: User) => ({
  name: user.name,
  email: user.email,
  phone: user.phone,
  avatar: user.avatar,
  profileVersion: user.profileVersion,
});

export function ProfileSettings({ user }: { user: User }) {
  const { setUser, notify } = useApp();
  const [draft, setDraft] = useState(() => draftOf(user));
  const [saved, setSaved] = useState(() => draftOf(user));
  const [emailPassword, setEmailPassword] = useState('');
  const [passwords, setPasswords] = useState({ current: '', next: '', confirmation: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [conflict, setConflict] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const changedEmail = draft.email.trim().toLowerCase() !== saved.email;
  const minPassword = user.role === 'admin' ? 12 : 8;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function start(action: string) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(action);
    return true;
  }
  function finish() {
    pending.current = false;
    if (mounted.current) setBusy('');
  }
  function accept(next: User) {
    setDraft(draftOf(next));
    setSaved(draftOf(next));
    setUser(next);
    setEmailPassword('');
    setConflict(false);
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!start('profile')) return;
    setError('');
    try {
      const result = await api<{ user: User }>('/auth/profile', {
        method: 'PATCH',
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          ...draft,
          ...(changedEmail ? { currentPassword: emailPassword } : {}),
        }),
      });
      if (mounted.current) accept(result.user);
      else setUser(result.user);
      notify('Perfil atualizado com sucesso.');
    } catch (error) {
      if (mounted.current) {
        setError(errorMessage(error));
        setConflict(error instanceof ApiError && error.status === 409);
      }
    } finally {
      finish();
    }
  }
  async function reloadProfile() {
    if (!start('reload')) return;
    setError('');
    try {
      const result = await api<{ user: User | null }>('/auth/me', {
        signal: AbortSignal.timeout(30000),
      });
      if (!result.user) {
        setUser(null);
        return;
      }
      if (mounted.current) accept(result.user);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      finish();
    }
  }
  async function selectPhoto(file?: File) {
    if (!file || !start('photo')) return;
    setError('');
    try {
      const avatar = await prepareProfileImage(file);
      if (mounted.current) setDraft((previous) => ({ ...previous, avatar }));
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
      finish();
    }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError('');
    if (passwords.next !== passwords.confirmation) {
      setPasswordError('A confirmação não coincide com a nova senha.');
      return;
    }
    if (new TextEncoder().encode(passwords.next).length > 72) {
      setPasswordError(
        'A senha deve ter no máximo 72 bytes. Acentos e emojis ocupam mais de um byte.',
      );
      return;
    }
    if (!start('password')) return;
    try {
      const result = await api<{ user: User }>('/auth/password', {
        method: 'PATCH',
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ currentPassword: passwords.current, password: passwords.next }),
      });
      setUser(result.user);
      if (mounted.current) setPasswords({ current: '', next: '', confirmation: '' });
      notify('Senha alterada. As outras sessões foram encerradas.');
    } catch (error) {
      if (mounted.current) setPasswordError(errorMessage(error));
    } finally {
      finish();
    }
  }
  return (
    <>
      <PageHeading eyebrow="SUA CONTA" title="Meu perfil" />
      <p className="profile-intro">Cuide dos seus dados e mantenha seu acesso atualizado.</p>
      <div className="profile-grid">
        <section className="profile-panel" aria-labelledby="profile-details-title">
          <h2 id="profile-details-title">
            <UserRound size={20} /> Informações pessoais
          </h2>
          <p>Seu nome de exibição identifica sua conta e seus agendamentos.</p>
          <form className="form-stack" onSubmit={saveProfile}>
            <fieldset disabled={!!busy} className="profile-fields">
              <div className="profile-photo-row">
                <Avatar name={draft.name} avatar={draft.avatar} large />
                <div>
                  <div className="profile-photo-actions">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => fileInput.current?.click()}
                    >
                      <Camera size={16} />
                      {busy === 'photo' ? 'Preparando...' : 'Alterar foto'}
                    </button>
                    {draft.avatar && (
                      <button
                        type="button"
                        className="text-button danger-text"
                        onClick={() => setDraft({ ...draft, avatar: null })}
                      >
                        Remover foto
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInput}
                    hidden
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label="Selecionar foto de perfil"
                    onChange={(event) => selectPhoto(event.target.files?.[0])}
                  />
                  <small>JPG, PNG ou WebP. Até 5 MB. Recorte central automático.</small>
                </div>
              </div>
              <label>
                Nome de exibição
                <input
                  autoComplete="name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  minLength={2}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  autoComplete="email"
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  maxLength={200}
                  required
                />
              </label>
              <label>
                WhatsApp
                <input
                  type="tel"
                  autoComplete="tel"
                  value={draft.phone}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                  maxLength={30}
                  required
                  aria-describedby="profile-phone-help"
                />
              </label>
              <small id="profile-phone-help">
                Inclua o DDD. Usaremos este número nas informações de agendamento.
              </small>
              {changedEmail && (
                <label>
                  Senha atual para alterar o e-mail
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={emailPassword}
                    onChange={(event) => setEmailPassword(event.target.value)}
                    maxLength={72}
                    required
                  />
                  <small>
                    Você passará a entrar com o novo e-mail. Outras sessões serão encerradas.
                  </small>
                </label>
              )}
              <ErrorBox message={error} />
              {(conflict || user.profileVersion !== saved.profileVersion) && (
                <div className="profile-reload">
                  <p>
                    Para usar os dados salvos na conta, recarregue o perfil. Isso descarta as
                    edições deste formulário.
                  </p>
                  <button type="button" className="button ghost" onClick={reloadProfile}>
                    Recarregar dados do perfil
                  </button>
                </div>
              )}
              <div className="profile-save-row">
                <button className="button primary" disabled={!dirty}>
                  <Save size={16} />
                  {busy === 'profile' ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <span role="status">
                  {dirty ? 'Alterações ainda não salvas' : 'Dados atualizados'}
                </span>
              </div>
            </fieldset>
          </form>
        </section>
        <section className="profile-panel" aria-labelledby="profile-password-title">
          <h2 id="profile-password-title">
            <LockKeyhole size={20} /> Segurança da conta
          </h2>
          <p>Ao alterar a senha, seus outros dispositivos precisarão entrar novamente.</p>
          <form className="form-stack" onSubmit={changePassword}>
            <input type="text" autoComplete="username" value={user.email} readOnly hidden />
            <fieldset disabled={!!busy} className="profile-fields">
              <label>
                Senha atual
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passwords.current}
                  onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
                  maxLength={72}
                  required
                />
              </label>
              <label>
                Nova senha
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.next}
                  onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
                  minLength={minPassword}
                  maxLength={72}
                  required
                  aria-describedby="profile-password-help"
                />
              </label>
              <small id="profile-password-help">
                Use pelo menos {minPassword} caracteres e uma senha diferente da atual.
              </small>
              <label>
                Confirmar nova senha
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirmation}
                  onChange={(event) =>
                    setPasswords({ ...passwords, confirmation: event.target.value })
                  }
                  minLength={minPassword}
                  maxLength={72}
                  required
                />
              </label>
              <ErrorBox message={passwordError} />
              <button className="button primary" type="submit">
                {busy === 'password' ? 'Alterando...' : 'Alterar senha'}
              </button>
            </fieldset>
          </form>
        </section>
      </div>
    </>
  );
}

export default function Profile() {
  const { user, loading } = useApp();
  if (loading) return <Spinner />;
  return (
    <div className="container account-page">
      <Link className="text-link profile-back" to="/minha-conta">
        <ArrowLeft size={16} /> Voltar para minha conta
      </Link>
      {user ? (
        <ProfileSettings key={user.id} user={user} />
      ) : (
        <div className="auth-panel">
          <h1>Entre para editar seu perfil</h1>
          <AuthForm />
        </div>
      )}
    </div>
  );
}
