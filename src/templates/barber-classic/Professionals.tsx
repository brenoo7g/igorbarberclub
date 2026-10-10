import { useEffect, useState } from 'react';
import { useApp } from '../../context';
import type { Barber } from '../../types';
import { errorMessage } from '../../lib';
import { ErrorBox, Eyebrow } from '../../components/UI';

export function Professionals() {
  const { api } = useApp();
  const [people, setPeople] = useState<Barber[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<Barber[]>('/barbers', { signal: controller.signal })
      .then(setPeople)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [api]);
  return (
    <section className="section container" aria-labelledby="professionals-title">
      <Eyebrow>NOSSA EQUIPE</Eyebrow>
      <h2 id="professionals-title">QUEM CUIDA DO SEU ESTILO.</h2>
      <ErrorBox message={error} />
      <div className="service-grid">
        {people.map((person) => (
          <article className="site-professional-card" key={person.id}>
            {person.photo_url && (
              <img
                className="site-professional-photo"
                src={person.photo_url}
                alt={person.name}
                loading="lazy"
              />
            )}
            <h3>{person.name}</h3>
            {person.specialty && <p>{person.specialty}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
