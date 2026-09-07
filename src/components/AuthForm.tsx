import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useApp } from '../context';
import { api, errorMessage } from '../lib';
import type { User } from '../types';
import { ErrorBox } from './UI';

export function AuthForm({
  admin = false,
  onSuccess,
}: {
  admin?: boolean;
  onSuccess?: () => void;
}) {
  const [register, setRegister] = useState(!admin);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { setUser, config } = useApp();
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
      {!admin && (
        <div className="segmented auth-tabs">
          <button
            type="button"
            className={register ? 'selected' : ''}
            onClick={() => {
              setRegister(true);
              setError('');
            }}
          >
            Criar minha conta
          </button>
          <button
            type="button"
            className={!register ? 'selected' : ''}
            onClick={() => {
              setRegister(false);
              setError('');
            }}
          >
            Já tenho conta
          </button>
        </div>
      )}
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
    </div>
  );
}
