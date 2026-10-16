import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useApp } from '../context';
import { errorMessage } from '../lib';
type AddressFields = {
  postal_code: string;
  address: string;
  city: string;
  region: string;
  neighborhood: string;
};
type PostalAddress = { street: string; city: string; region: string; neighborhood: string };
export function usePostalAddress<T extends AddressFields>(
  values: T,
  setValues: Dispatch<SetStateAction<T>>,
) {
  const { api } = useApp();
  const edits = useRef<Record<string, number>>({});
  const cache = useRef(new Map<string, PostalAddress>());
  const [lookup, setLookup] = useState({ busy: false, message: '' });
  const code = values.postal_code.replace('-', '');
  useEffect(() => {
    const controller = new AbortController();
    const before = { ...edits.current };
    setLookup({ busy: false, message: '' });
    if (!/^\d{8}$/.test(code)) return;
    const timer = setTimeout(async () => {
      setLookup({ busy: true, message: 'Consultando CEP…' });
      try {
        const data =
          cache.current.get(code) ||
          (await api<PostalAddress>('/address/cep/' + code, { signal: controller.signal }));
        if (controller.signal.aborted) return;
        if (!data || typeof data.city !== 'string' || typeof data.region !== 'string')
          throw new Error('Não foi possível consultar o CEP. Preencha manualmente.');
        if (cache.current.size > 20) cache.current.clear();
        cache.current.set(code, data);
        setValues((current) => {
          if (controller.signal.aborted || current.postal_code.replace('-', '') !== code)
            return current;
          const next = { ...current };
          for (const [field, value] of Object.entries({
            address: data.street,
            city: data.city,
            region: data.region,
            neighborhood: data.neighborhood,
          }))
            if (typeof value === 'string' && (edits.current[field] || 0) === (before[field] || 0))
              Object.assign(next, { [field]: value });
          return next;
        });
        setLookup({
          busy: false,
          message: data.street
            ? 'Endereço preenchido. Confira os dados e informe o número.'
            : 'CEP localizado sem logradouro. Complete rua e número manualmente.',
        });
      } catch (error) {
        if (!controller.signal.aborted) setLookup({ busy: false, message: errorMessage(error) });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [code, api, setValues]);
  return {
    ...lookup,
    markEdited: (field: string) => {
      edits.current[field] = (edits.current[field] || 0) + 1;
    },
  };
}
