import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Clock3,
  FolderOpen,
  Plus,
  Scissors,
  Search,
  UsersRound,
} from 'lucide-react';
import { useApp } from '../context';
import { errorMessage, money } from '../lib';
import { Button, Card, Feedback } from './components';
import type { Professional, Service } from './business-types';
import type { ReportState } from './reports-types';
import './services-desktop.css';

export function ServicesDesktop({
  companyId,
  services,
  professionals,
  editable,
  search,
  onSearch,
  onCreate,
  onEdit,
  onStatus,
}: {
  companyId: string;
  services: Service[];
  professionals: Professional[];
  editable: boolean;
  search: string;
  onSearch: (value: string) => void;
  onCreate: () => void;
  onEdit: (service: Service) => void;
  onStatus: (service: Service) => void;
}) {
  const { api } = useApp();
  const [report, setReport] = useState<ReportState | null>(null);
  const [reportError, setReportError] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    setCategory('');
    setStatus('');
  }, [companyId]);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setReportError('');
    api<ReportState>('/admin/reports?area=services&period=last30', {
      signal: controller.signal,
      headers: { 'X-Gradefy-Company-Id': companyId },
    })
      .then((value) => {
        if (!controller.signal.aborted) setReport(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setReportError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [api, companyId, services]);
  const categories = [
    ...new Set(services.map((service) => service.category.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const categoryFor = (service: Service) => service.category.trim() || 'Sem categoria';
  const visible = services.filter(
    (service) =>
      service.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) &&
      (!category || categoryFor(service) === category) &&
      (!status || String(service.active) === status),
  );
  const linked = (service: Service) =>
    professionals.filter((person) => person.services.includes(service.id));
  const categoryCounts = [
    ...categories.map((name) => ({
      name,
      count: services.filter((service) => categoryFor(service) === name).length,
    })),
    ...(services.some((service) => !service.category.trim())
      ? [
          {
            name: 'Sem categoria',
            count: services.filter((service) => !service.category.trim()).length,
          },
        ]
      : []),
  ];
  const top = report?.topServices?.filter((service) => service.quantity > 0).slice(0, 5) || [];
  const peak = Math.max(1, ...top.map((service) => service.quantity));
  const stats = [
    { label: 'Serviços cadastrados', value: services.length, icon: Scissors },
    {
      label: 'Serviços ativos',
      value: services.filter((service) => service.active === 1).length,
      icon: Activity,
    },
    { label: 'Categorias utilizadas', value: categoryCounts.length, icon: FolderOpen },
    {
      label: 'Serviços com profissional',
      value: services.filter((service) => linked(service).length > 0).length,
      icon: UsersRound,
    },
  ];
  return (
    <div className="gf-services-desktop" aria-label="Catálogo de serviços">
      <div className="gf-services-metrics">
        {stats.map(({ label, value, icon: Icon }, index) => (
          <Card className={'gf-services-metric gf-services-metric-' + index} key={label}>
            <Icon size={23} aria-hidden="true" />
            <span>{label}</span>
            <strong>{value}</strong>
          </Card>
        ))}
      </div>
      <div className="gf-services-workspace">
        <Card className="gf-services-catalog">
          <div className="gf-services-heading">
            <div>
              <h2>Catálogo de serviços</h2>
              <p>
                {visible.length} de {services.length} serviço(s) exibido(s)
              </p>
            </div>
            <Button disabled={!editable} onClick={onCreate}>
              <Plus size={17} /> Novo serviço
            </Button>
          </div>
          <div className="gf-services-toolbar">
            <label className="gf-services-search">
              <Search size={17} />
              <span className="sr-only">Buscar serviço</span>
              <input
                type="search"
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Buscar serviço..."
              />
            </label>
            <label>
              <span className="sr-only">Filtrar categoria</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">Todas as categorias</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {categoryCounts.some((item) => item.name === 'Sem categoria') && (
                  <option value="Sem categoria">Sem categoria</option>
                )}
              </select>
            </label>
            <label>
              <span className="sr-only">Filtrar status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todos os status</option>
                <option value="1">Ativos</option>
                <option value="0">Inativos</option>
              </select>
            </label>
          </div>
          {categories.length > 0 && (
            <div className="gf-services-categories" aria-label="Categorias">
              <button className={!category ? 'is-active' : ''} onClick={() => setCategory('')}>
                Todos
              </button>
              {categories.map((name) => (
                <button
                  key={name}
                  className={category === name ? 'is-active' : ''}
                  onClick={() => setCategory(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="gf-services-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th>Categoria</th>
                  <th>Duração</th>
                  <th>Preço</th>
                  <th>Profissionais</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((service) => {
                  const people = linked(service);
                  return (
                    <tr key={service.id}>
                      <td>
                        <span className="gf-services-identity">
                          <i aria-hidden="true">
                            <Scissors size={18} />
                          </i>
                          <span>
                            <strong>{service.name}</strong>
                            <small title={service.description || 'Sem descrição cadastrada'}>
                              {service.description || 'Sem descrição cadastrada'}
                            </small>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="gf-services-category">{categoryFor(service)}</span>
                      </td>
                      <td>
                        <Clock3 size={14} /> {service.duration} min
                      </td>
                      <td className="gf-services-price">{money(service.price)}</td>
                      <td>
                        {people.length > 1 ? (
                          <details className="gf-services-people">
                            <summary>
                              <span>
                                {people[0].name}
                                {!people[0].active && ' (inativo)'}
                              </span>
                              <small>+{people.length - 1} · Ver todos</small>
                            </summary>
                            <ul>
                              {people.map((person) => (
                                <li key={person.id}>
                                  {person.name}
                                  {!person.active && ' (inativo)'}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : (
                          <span className="gf-services-people">
                            {people.length
                              ? people[0].name + (people[0].active ? '' : ' (inativo)')
                              : 'Nenhum vínculo'}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={'gf-services-status ' + (service.active ? 'is-active' : '')}
                        >
                          {service.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        <div className="gf-services-actions">
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => onEdit(service)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => onStatus(service)}
                          >
                            {service.active ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <p className="gf-services-empty">
              {services.length
                ? 'Nenhum serviço corresponde aos filtros.'
                : 'Nenhum serviço cadastrado. Comece pelo botão Novo serviço.'}
            </p>
          )}
        </Card>
        <aside className="gf-services-aside">
          <Card>
            <div className="gf-services-aside-title">
              <h2>Serviços mais realizados</h2>
              <span>Últimos 30 dias</span>
            </div>
            <Feedback>{reportError}</Feedback>
            {top.length ? (
              <div className="gf-services-ranking">
                {top.map((service, index) => (
                  <div key={service.id}>
                    <span className="gf-services-rank-number">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="gf-services-rank-content">
                      <strong>{service.name}</strong>
                      <i aria-hidden="true">
                        <b style={{ width: `${(100 * service.quantity) / peak}%` }} />
                      </i>
                    </span>
                    <span>{service.quantity}</span>
                  </div>
                ))}
              </div>
            ) : !report && !reportError ? (
              <p className="gf-services-empty">Carregando atendimentos...</p>
            ) : report ? (
              <p className="gf-services-empty">Nenhum atendimento concluído no período.</p>
            ) : null}
          </Card>
          <Card>
            <div className="gf-services-aside-title">
              <h2>Composição do catálogo</h2>
              <span>Serviços cadastrados</span>
            </div>
            {categoryCounts.length ? (
              <div className="gf-services-mix">
                {categoryCounts.map(({ name, count }) => (
                  <div key={name}>
                    <span>{name}</span>
                    <strong>{count}</strong>
                    <i aria-hidden="true">
                      <b style={{ width: `${(100 * count) / services.length}%` }} />
                    </i>
                  </div>
                ))}
              </div>
            ) : (
              <p className="gf-services-empty">Cadastre serviços para visualizar as categorias.</p>
            )}
          </Card>
          <Card className="gf-services-tip">
            <h2>Equipe habilitada</h2>
            <p>
              Vincule cada serviço aos profissionais que realmente o executam. Uma conta de acesso
              não substitui o cadastro profissional.
            </p>
            <a href={'/app/profissionais?empresa=' + encodeURIComponent(companyId)}>
              Gerenciar profissionais <ArrowRight size={16} />
            </a>
          </Card>
        </aside>
      </div>
    </div>
  );
}
