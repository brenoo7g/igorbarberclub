import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, errorMessage } from '../lib';
import { ErrorBox } from './UI';

export function PasswordRecoveryForm({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(30000),
      });
      setMessage(result.message);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return message ? (
    <div className="form-stack">
      <p role="status">{message}</p>
      <p className="form-note">
        O link vale por 30 minutos. Caso precise solicitar outro, aguarde pelo menos um minuto.
      </p>
      <button type="button" className="button secondary" onClick={() => setMessage('')}>
        Solicitar outro link
      </button>
    </div>
  ) : (
    <form className="form-stack" onSubmit={submit}>
      <p>Informe o e-mail da sua conta para receber um link de recuperação.</p>
      <ErrorBox message={error} />
      <label>
        E-mail da conta
        <input
          type="email"
          autoComplete="email"
          required
          maxLength={200}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
        />
      </label>
      <button type="submit" className="button primary full" disabled={busy}>
        {busy ? 'Aguarde...' : 'Enviar link de recuperação'}
      </button>
    </form>
  );
}
