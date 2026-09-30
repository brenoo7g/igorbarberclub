import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  createBooking,
  emptyData,
  parseSavedData,
  type Booking,
  type SavedData,
} from '../lib/booking';

const KEY = '@igor-barber-mobile:v1';
type Club = {
  data: SavedData;
  loading: boolean;
  error: string;
  busy: boolean;
  retry: () => void;
  saveProfile: (name: string) => Promise<void>;
  reserve: (input: {
    serviceId: string;
    date: string;
    time: string;
    customer: string;
  }) => Promise<Booking>;
  cancel: (id: string) => Promise<void>;
};
const Context = createContext<Club | null>(null);
export function ClubProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SavedData>(emptyData);
  const latest = useRef(data);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    AsyncStorage.getItem(KEY)
      .then(parseSavedData)
      .then((saved) => {
        if (active) {
          latest.current = saved;
          setData(saved);
        }
      })
      .catch(() => {
        if (active) setError('Não foi possível ler seus dados locais. Tente novamente.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function commit(update: (current: SavedData) => SavedData) {
    if (loading || error) throw new Error('Aguarde o carregamento dos seus dados.');
    if (lock.current) throw new Error('Aguarde a operação atual.');
    lock.current = true;
    setBusy(true);
    try {
      const next = update(latest.current);
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      latest.current = next;
      setData(next);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reserve(input: {
    serviceId: string;
    date: string;
    time: string;
    customer: string;
  }) {
    let result!: Booking;
    await commit((current) => {
      result = createBooking(input, current.bookings);
      return {
        ...current,
        profile: { name: input.customer.trim() },
        bookings: [...current.bookings, result],
      };
    });
    return result;
  }
  return (
    <Context.Provider
      value={{
        data,
        loading,
        error,
        busy,
        retry: () => setAttempt((n) => n + 1),
        reserve,
        saveProfile: async (name) => {
          if (name.trim().length < 2 || name.trim().length > 80)
            throw new Error('Informe seu nome (de 2 a 80 caracteres).');
          await commit((current) => ({ ...current, profile: { name: name.trim() } }));
        },
        cancel: async (id) => {
          await commit((current) => ({
            ...current,
            bookings: current.bookings.map((booking) =>
              booking.id === id ? { ...booking, status: 'cancelled' } : booking,
            ),
          }));
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useClub() {
  const context = useContext(Context);
  if (!context) throw new Error('ClubProvider ausente.');
  return context;
}
