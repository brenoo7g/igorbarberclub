import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useApp } from '../context';
import { api, errorMessage } from '../lib';
import { ErrorBox, Eyebrow } from '../components/UI';
import { PasswordRecoveryForm } from '../components/PasswordRecoveryForm';

export default function PasswordRecovery() {
  const location = useLocation();
  return <RecoveryPage key={`${location.pathname}${location.hash}`} />;
}

function RecoveryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser } = useApp();
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const reset = location.pathname === '/redefinir-senha';
  const complete = Boolean(location.state?.passwordResetComplete);
  const validToken = /^[a-f0-9]{64}$/.test(token);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (password !== confirmation) {
      setError('As senhas não coincidem.');
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError('A senha deve ter no máximo 72 bytes.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password, confirmPassword: confirmation }),
        signal: AbortSignal.timeout(30000),
      });
      setUser(null);
      setPassword('');
      setConfirmation('');
      navigate('/redefinir-senha', { replace: true, state: { passwordResetComplete: true } });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="container recovery-page">
      <div className="recovery-card">
        <LockKeyhole className="recovery-icon" size={30} />
        <Eyebrow>SUA CONTA NO CLUB</Eyebrow>
        <h1>
          {complete ? 'Senha redefinida' : reset ? 'Crie sua nova senha' : 'Esqueceu sua senha?'}
        </h1>
        {complete ? (
          <p role="status">
            Sua senha foi alterada e as sessões anteriores foram encerradas. Entre novamente com a
            nova senha.
          </p>
        ) : !reset ? (
          <PasswordRecoveryForm />
        ) : !validToken ? (
          <ErrorBox message="Este link é inválido ou expirou. Solicite um novo link de recuperação." />
        ) : (
          <form className="form-stack" onSubmit={submit}>
            <p>Use pelo menos 8 caracteres. Contas administrativas exigem 12 caracteres.</p>
            <ErrorBox message={error} />
            <label>
              Nova senha
              <div className="password-field">
                <input
                  autoComplete="new-password"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  maxLength={72}
                  required
                  disabled={busy}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <label>
              Confirmar nova senha
              <input
                autoComplete="new-password"
                type={show ? 'text' : 'password'}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                minLength={8}
                maxLength={72}
                required
                disabled={busy}
              />
            </label>
            <button className="button primary full" type="submit" disabled={busy}>
              {busy ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </form>
        )}
        <div className="recovery-links">
          {reset && !complete && (
            <Link className="text-link" to="/esqueci-senha">
              Solicitar novo link
            </Link>
          )}
          <Link className={complete ? 'button primary full' : 'text-link'} to="/minha-conta">
            Voltar para minha conta
          </Link>
          {complete && (
            <Link className="text-link" to="/admin">
              Acessar painel administrativo
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
