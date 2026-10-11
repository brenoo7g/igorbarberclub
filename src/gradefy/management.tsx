import type { ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context';
import { useCompanies } from './company-access';
import type { Company } from './company-access';
import { Button, ButtonLink, Card, Feedback, Loading } from './components';
export type ManagementProps = {
  companyId: string;
  companies: Company[];
  choose: (id: string) => void;
};
export function ManagementAccess({
  children,
}: {
  children: (props: ManagementProps) => ReactNode;
}) {
  const { user, loading } = useApp();
  const { companies, business, error, retry } = useCompanies();
  const [query, setQuery] = useSearchParams();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/app/login" replace state={{ sessionRequired: true }} />;
  if (error)
    return (
      <div className="gf-ready">
        <Card>
          <Feedback>{error}</Feedback>
          <Button onClick={retry}>Tentar novamente</Button>
          <ButtonLink to="/app/conta" variant="secondary">
            Minha conta
          </ButtonLink>
        </Card>
      </div>
    );
  if (!companies) return <Loading />;
  if (!companies.length)
    return (
      <Navigate
        to={
          business?.onboardingStatus === 'pending'
            ? '/app/onboarding/operations'
            : '/app/onboarding/plan'
        }
        replace
      />
    );
  const allowed = companies.filter((c) => ['owner', 'manager'].includes(c.role));
  if (!allowed.length)
    return (
      <div className="gf-ready">
        <Card>
          <h1>Acesso à gestão</h1>
          <p>
            Seu vínculo não permite visualizar o painel empresarial. Solicite acesso ao proprietário
            ou gestor.
          </p>
          <ButtonLink to="/app/conta">Minha conta</ButtonLink>
        </Card>
      </div>
    );
  const selected = query.get('empresa') || (allowed.length === 1 ? allowed[0].id : '');
  const choose = (id: string) => setQuery(id ? { empresa: id } : {});
  if (!allowed.some((c) => c.id === selected))
    return (
      <div className="gf-ready">
        <Card>
          <div className="gf-kicker">SEU PAINEL EMPRESARIAL</div>
          <h1>Escolha sua empresa</h1>
          <p>Selecione o estabelecimento que deseja administrar.</p>
          {selected && <Feedback>Sem acesso à empresa selecionada.</Feedback>}
          <CompanySelector companies={allowed} value="" choose={choose} />
          <ButtonLink to="/app/conta" variant="secondary">
            Minha conta
          </ButtonLink>
        </Card>
      </div>
    );
  return <div key={selected}>{children({ companyId: selected, companies: allowed, choose })}</div>;
}
export function CompanySelector({
  companies,
  value,
  choose,
}: {
  companies: Company[];
  value: string;
  choose: (id: string) => void;
}) {
  return (
    <div className="gf-field">
      <label htmlFor="dashboard-company">Empresa</label>
      <select id="dashboard-company" value={value} onChange={(e) => choose(e.target.value)}>
        <option value="" disabled>
          Selecione uma empresa
        </option>
        {companies.map((c) => (
          <option value={c.id} key={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
