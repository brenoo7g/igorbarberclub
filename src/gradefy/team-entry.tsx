import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Store, UsersRound } from 'lucide-react';
import { useApp } from '../context';
import { errorMessage } from '../lib';
import { invitationCode, invitationToken } from '../../server/invitation-code.js';
import { Button, Feedback, Input } from './components';
import { FormFrame } from './pages';
import './team.css';

export function EntryProfile() {
  const { user } = useApp();
  return (
    <FormFrame title="Como deseja usar o Gradefy?" description="Escolha uma opção para começar.">
      <div className="gf-entry-profiles">
        <Link className="gf-entry-profile" to={user ? '/app/onboarding/plan' : '/app/cadastro'}>
          <Store size={32} aria-hidden="true" />
          <div>
            <h2>Sou proprietário</h2>
            <p>Quero cadastrar e gerenciar meu estabelecimento.</p>
          </div>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
        <Link className="gf-entry-profile" to="/app/entrar-equipe">
          <UsersRound size={32} aria-hidden="true" />
          <div>
            <h2>Sou colaborador</h2>
            <p>Recebi um convite para fazer parte de uma equipe.</p>
          </div>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
      </div>
      <p className="gf-form-switch">
        <Link to={user ? '/app/conta' : '/app/login'}>
          {user ? 'Minha conta' : 'Já tenho uma conta'}
        </Link>
      </p>
    </FormFrame>
  );
}

export function TeamEntry() {
  const { api, user } = useApp();
  const navigate = useNavigate();
  const [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const working = useRef(false);
  const token = invitationToken(code);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working.current) return;
    setError('');
    if (!token) {
      setError('Confira o código completo enviado pelo proprietário.');
      return;
    }
    working.current = true;
    setBusy(true);
    try {
      await api('/team/invitations/inspect', { method: 'POST', body: JSON.stringify({ code }) });
      // Reuse the original link flow. The secret survives refresh/authentication
      // only in a URL fragment, never in storage, query parameters or HTTP paths.
      navigate('/app/convite#token=' + token, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <FormFrame
      title="Entrar em uma equipe"
      description="Digite o código de convite enviado pelo proprietário do estabelecimento."
      backTo="/app/comecar"
    >
      <form className="gf-form" onSubmit={submit} noValidate aria-busy={busy}>
        <Feedback>{error}</Feedback>
        <Input
          label="Código do convite"
          placeholder="Cole ou digite seu código"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError('');
          }}
          onBlur={() => {
            if (token) setCode(invitationCode(token));
          }}
          maxLength={160}
          required
          disabled={busy}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          hint="Código individual em grupos de 4 caracteres. Espaços, hífens e letras minúsculas são aceitos."
        />
        <Button type="submit" busy={busy}>
          Continuar <ArrowRight size={18} />
        </Button>
      </form>
      <p className="gf-form-switch">
        <Link to={user ? '/app/conta' : '/app/login' + (token ? '#token=' + token : '?equipe=1')}>
          {user ? 'Minha conta' : 'Já tenho uma conta'}
        </Link>
      </p>
    </FormFrame>
  );
}
