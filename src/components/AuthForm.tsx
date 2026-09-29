import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useApp } from '../context';
import { api, errorMessage } from '../lib';
import type { User, Visitor } from '../types';
import { ErrorBox, Modal } from './UI';
import { PasswordRecoveryForm } from './PasswordRecoveryForm';

export function AuthForm({
  admin = false,
  onSuccess,
  guest,
}: {
  admin?: boolean;
  onSuccess?: () => void;
  guest?: {
    selected: boolean;
    onSelect: (selected: boolean) => void;
    content: ReactNode;
    busy: boolean;
  };
}) {
  const [register, setRegister] = useState(!admin);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recover, setRecover] = useState(false);
  const { setUser, setVisitor, config } = useApp();
  const [testAccess, setTestAccess] = useState(false);
  async function enterTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ visitor: Visitor }>('/auth/test-access', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setUser(null);
      setVisitor(result.visitor);
      setTestAccess(false);
      onSuccess?.();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const data = await api<{ user: User }>(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          ...(register ? { name: form.get('name'), phone: form.get('phone') } : {}),
        }),
      });
      setUser(data.user);
      onSuccess?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-form-wrap">
      {!admin && config?.testGuestAccess && (
        <button
          type="button"
          className="button secondary full"
          disabled={busy}
          onClick={() => {
            setError('');
            setTestAccess(true);
          }}
        >
          Acessar agendamentos de teste
        </button>
      )}
      {!admin && (
        <div className={`segmented auth-tabs ${guest ? 'with-guest' : ''}`}>
          <button
            type="button"
            className={register && !guest?.selected ? 'selected' : ''}
            disabled={busy || guest?.busy}
            aria-pressed={register && !guest?.selected}
            onClick={() => {
              guest?.onSelect(false);
              setRegister(true);
              setError('');
            }}
          >
            Criar minha conta
          </button>
          <button
            type="button"
            className={!register && !guest?.selected ? 'selected' : ''}
            disabled={busy || guest?.busy}
            aria-pressed={!register && !guest?.selected}
            onClick={() => {
              guest?.onSelect(false);
              setRegister(false);
              setError('');
            }}
          >
            Já tenho conta
          </button>
          {guest && (
            <button
              type="button"
              className={guest.selected ? 'selected' : ''}
              aria-pressed={guest.selected}
              disabled={busy || guest.busy}
              onClick={() => {
                setError('');
                guest.onSelect(true);
              }}
            >
              Continuar Sem Login
            </button>
          )}
        </div>
      )}
      {guest?.selected ? (
        guest.content
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <ErrorBox message={error} />
          {register && (
            <label>
              Nome completo
              <input
                name="name"
                autoComplete="name"
                placeholder="Como podemos chamar você?"
                minLength={3}
                maxLength={100}
                required
              />
            </label>
          )}
          <label>
            E-mail
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          {register && (
            <label>
              WhatsApp
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                placeholder="(21) 99999-9999"
                pattern="[+()\s0-9-]{10,20}"
                title="Informe seu telefone com DDD"
                required
              />
            </label>
          )}
          <label>
            Senha
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={register ? 'Pelo menos 8 caracteres' : 'Sua senha'}
                minLength={register ? 8 : 1}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {!register && (
            <button
              type="button"
              className="text-link forgot-password-link"
              disabled={busy}
              onClick={() => setRecover(true)}
            >
              Esqueci minha senha
            </button>
          )}
          {register && (
            <p className="form-note">
              <LockKeyhole size={14} />
              Seus dados serão usados para gerenciar sua conta e enviar informações sobre seu
              agendamento.
            </p>
          )}
          <button type="submit" className="button primary full" disabled={busy}>
            {busy ? 'Aguarde...' : register ? 'Criar conta e continuar' : 'Entrar na minha conta'}
            <ArrowRight size={17} />
          </button>
          {admin && config?.demo && (
            <div className="demo-login">
              <p>Ambiente de demonstração com dados fictícios.</p>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setEmail('admin@igorbarberclub.com.br');
                  setPassword('IgorDemo2026!');
                }}
              >
                Preencher acesso de demonstração
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </form>
      )}
      {recover && (
        <Modal title="Esqueceu sua senha?" onClose={() => setRecover(false)}>
          <PasswordRecoveryForm initialEmail={email} />
        </Modal>
      )}
      {testAccess && (
        <Modal
          title="Acesso de teste"
          onClose={() => {
            if (!busy) setTestAccess(false);
          }}
        >
          <form className="form-stack" onSubmit={enterTest}>
            <p>
              Use o e-mail informado no agendamento de teste. Sem senha ou confirmação neste
              ambiente temporário.
            </p>
            <ErrorBox message={error} />
            <label>
              E-mail do agendamento
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
              {busy ? 'Aguarde...' : 'Entrar no teste'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
