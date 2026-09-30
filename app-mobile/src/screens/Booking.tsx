import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CalendarCheck2, Check, ChevronLeft } from 'lucide-react-native';
import { Button, ExternalButton, Heading, Page, ServiceCard } from '../components/UI';
import { instagram, money, services } from '../data/services';
import {
  brazilDay,
  dateLabel,
  demoTimes,
  isAvailable,
  nextDays,
  type Booking as Reservation,
} from '../lib/booking';
import { useClub } from '../state/ClubContext';
import { colors, fonts, s } from '../theme';
export function Booking({
  initialService,
  viewAccount,
}: {
  initialService?: string;
  viewAccount: () => void;
}) {
  const { data, reserve, busy } = useClub();
  const [step, setStep] = useState(initialService ? 1 : 0);
  const [serviceId, setServiceId] = useState(initialService ?? '');
  const [date, setDate] = useState(brazilDay());
  const [time, setTime] = useState('');
  const [customer, setCustomer] = useState(data.profile.name);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Reservation | null>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const service = services.find((item) => item.id === serviceId);
  const available = !!time && isAvailable(date, time, data.bookings, now);
  async function confirm() {
    setError('');
    try {
      setResult(await reserve({ serviceId, date, time, customer }));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Não foi possível salvar. Tente novamente.',
      );
    }
  }
  if (result)
    return (
      <Page>
        <View style={{ alignItems: 'center', paddingTop: 28, gap: 18 }}>
          <View style={{ padding: 24, borderRadius: 60, backgroundColor: '#18234D' }}>
            <CalendarCheck2 size={42} color={colors.light} />
          </View>
          <Text style={s.eyebrow}>TUDO CERTO NESTE APARELHO</Text>
          <Text accessibilityRole="header" style={[s.heading, { textAlign: 'center' }]}>
            Seu visual já tem um plano.
          </Text>
        </View>
        <View style={s.card}>
          <Text style={s.eyebrow}>AGENDAMENTO LOCAL · DEMONSTRAÇÃO</Text>
          <Text style={s.title}>{service?.name}</Text>
          <Text style={s.body}>
            {dateLabel(result.date)} às {result.time}
          </Text>
          <View style={s.divider} />
          <Text style={s.label}>{result.customer} · Igor Borges</Text>
          <Text style={s.body}>{money(service?.price ?? 0)} · 40 minutos</Text>
        </View>
        <Text accessibilityRole="alert" style={s.note}>
          Salvo somente neste aparelho. A barbearia não recebeu uma reserva. Fale com Igor pelo
          Instagram para combinar um horário real.
        </Text>
        <ExternalButton title="Falar com Igor no Instagram" url={instagram} secondary={false} />
        <Button title="Ver meus agendamentos" onPress={viewAccount} secondary />
      </Page>
    );
  return (
    <Page>
      <Heading
        eyebrow="Reserve seu momento"
        title="Seu próximo visual."
        subtitle="Escolha o serviço, encontre um horário e revise os detalhes."
      />
      <View style={[s.row, { gap: 8 }]}>
        {['Serviço', 'Horário', 'Revisão'].map((label, index) => (
          <View key={label} style={{ flex: 1, gap: 8 }}>
            <View
              style={{
                height: 3,
                borderRadius: 2,
                backgroundColor: index <= step ? colors.blue : colors.border,
              }}
            />
            <Text style={[s.small, { color: index === step ? colors.text : colors.muted }]}>
              {index + 1}. {label}
            </Text>
          </View>
        ))}
      </View>
      <View style={[s.card, { backgroundColor: '#131A2C', borderColor: '#273353', padding: 14 }]}>
        <Text style={s.note}>
          Modo demonstração: horários ilustrativos, no fuso de Brasília. A reserva fica apenas neste
          aparelho.
        </Text>
      </View>
      {step === 0 && (
        <View style={s.stack}>
          {services.map((item) => (
            <ServiceCard
              key={item.id}
              service={item}
              selected={item.id === serviceId}
              onPress={() => {
                setServiceId(item.id);
                setError('');
              }}
            />
          ))}
        </View>
      )}
      {step === 1 && (
        <View style={{ gap: 22 }}>
          <View style={s.card}>
            <Text style={s.label}>{service?.name}</Text>
            <Text style={s.body}>{money(service?.price ?? 0)} · 40 min · Igor Borges</Text>
          </View>
          <Text accessibilityRole="header" style={s.title}>
            Qual dia fica melhor?
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {nextDays(now).map((day) => (
              <Pressable
                key={day.date}
                accessibilityRole="button"
                accessibilityLabel={dateLabel(day.date) + (day.closed ? ', fechado' : '')}
                accessibilityState={{ selected: date === day.date, disabled: day.closed }}
                disabled={day.closed}
                onPress={() => {
                  setDate(day.date);
                  setTime('');
                  setError('');
                }}
                style={[
                  s.card,
                  { padding: 12, minWidth: 76, alignItems: 'center', gap: 4 },
                  date === day.date && { borderColor: colors.blue, backgroundColor: '#18234D' },
                  day.closed && { opacity: 0.35 },
                ]}
              >
                <Text style={s.small}>
                  {dateLabel(day.date, true).split(' de ').slice(1).join(' ')}
                </Text>
                <Text style={{ fontFamily: fonts.heading, fontSize: 29, color: colors.text }}>
                  {day.date.slice(-2)}
                </Text>
                <Text style={s.small}>
                  {new Date(day.date + 'T12:00:00-03:00').toLocaleDateString('pt-BR', {
                    weekday: 'short',
                    timeZone: 'America/Sao_Paulo',
                  })}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={s.body}>{dateLabel(date)}</Text>
          <Text accessibilityRole="header" style={s.title}>
            Escolha seu horário
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {demoTimes.map((slot) => {
              const enabled = isAvailable(date, slot, data.bookings, now);
              return (
                <Pressable
                  key={slot}
                  accessibilityRole="button"
                  accessibilityLabel={'Horário ' + slot}
                  accessibilityState={{ selected: time === slot, disabled: !enabled }}
                  disabled={!enabled}
                  onPress={() => {
                    setTime(slot);
                    setError('');
                  }}
                  style={[
                    s.chip,
                    { minWidth: 78, alignItems: 'center' },
                    slot === time && s.chipActive,
                    !enabled && { opacity: 0.3 },
                  ]}
                >
                  <Text style={s.label}>{slot}</Text>
                </Pressable>
              );
            })}
          </View>
          {!demoTimes.some((slot) => isAvailable(date, slot, data.bookings, now)) && (
            <Text style={s.note}>Sem horários neste dia. Selecione outra data.</Text>
          )}
        </View>
      )}
      {step === 2 && (
        <View style={{ gap: 20 }}>
          <View style={s.card}>
            <Text style={s.eyebrow}>CONFIRA SEU AGENDAMENTO</Text>
            <Text style={s.title}>{service?.name}</Text>
            <Text style={s.body}>
              {dateLabel(date)} às {time}
            </Text>
            <Text style={s.body}>Igor Borges · Campo Grande, RJ</Text>
            <View style={s.divider} />
            <View style={s.between}>
              <Text style={s.body}>40 minutos · valor do serviço</Text>
              <Text style={s.title}>{money(service?.price ?? 0)}</Text>
            </View>
          </View>
          <View style={s.stack}>
            <Text style={s.label}>Como podemos te chamar?</Text>
            <TextInput
              accessibilityLabel="Seu nome"
              value={customer}
              onChangeText={setCustomer}
              placeholder="Seu nome"
              placeholderTextColor={colors.muted}
              autoComplete="name"
              autoCapitalize="words"
              maxLength={80}
              style={s.input}
            />
            <Text style={s.small}>Não há pagamento nem envio à barbearia nesta versão.</Text>
          </View>
          {!available && (
            <Text style={s.error}>
              Esse horário expirou ou ficou indisponível. Volte e escolha outro.
            </Text>
          )}
        </View>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <View style={s.stack}>
        <Button
          title={
            step === 0
              ? 'Escolher data e horário'
              : step === 1
                ? 'Revisar agendamento'
                : 'Confirmar agendamento local'
          }
          disabled={
            step === 0
              ? !service
              : step === 1
                ? !available
                : !available || customer.trim().length < 2
          }
          loading={busy}
          icon={step === 2 ? <Check size={18} color="#FFF" /> : undefined}
          onPress={() => {
            if (step < 2) {
              setStep(step + 1);
              setError('');
            } else void confirm();
          }}
        />
        {step > 0 && (
          <Button
            title="Voltar uma etapa"
            secondary
            disabled={busy}
            icon={<ChevronLeft size={16} color={colors.text} />}
            onPress={() => {
              setStep(step - 1);
              setError('');
            }}
          />
        )}
      </View>
    </Page>
  );
}
