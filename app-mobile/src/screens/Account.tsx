import { useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { MapPin, Scissors, UserRound } from 'lucide-react-native';
import { Button, ExternalButton, Heading, Page } from '../components/UI';
import { instagram, money, services } from '../data/services';
import { atTime, dateLabel } from '../lib/booking';
import { useClub } from '../state/ClubContext';
import { colors, s } from '../theme';
export function Account({ book }: { book: () => void }) {
  const { data, saveProfile, cancel, busy } = useClub();
  const [name, setName] = useState(data.profile.name);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  async function save() {
    setFeedback('');
    setError('');
    try {
      await saveProfile(name);
      setFeedback('Perfil salvo neste aparelho.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar.');
    }
  }
  async function cancelBooking() {
    if (!cancelId) return;
    setError('');
    try {
      await cancel(cancelId);
      setCancelId(null);
    } catch {
      setError('Não foi possível cancelar. Tente novamente.');
    }
  }
  return (
    <>
      <Page>
        <Heading
          eyebrow="Você faz parte do Club"
          title="Minha conta."
          subtitle="Seu perfil, seus horários e o caminho até a cadeira."
        />
        <View style={s.card}>
          <View style={s.row}>
            <View style={{ padding: 14, borderRadius: 30, backgroundColor: '#18234D' }}>
              <UserRound size={23} color={colors.light} />
            </View>
            <View style={s.grow}>
              <Text style={s.title}>{data.profile.name || 'Seu espaço no Club'}</Text>
              <Text style={s.small}>Perfil local · sem login nesta versão</Text>
            </View>
          </View>
          <Text style={s.label}>Seu nome</Text>
          <TextInput
            accessibilityLabel="Nome do perfil"
            value={name}
            onChangeText={setName}
            maxLength={80}
            autoCapitalize="words"
            autoComplete="name"
            placeholder="Como podemos te chamar?"
            placeholderTextColor={colors.muted}
            style={s.input}
          />
          <Button title="Salvar perfil" onPress={() => void save()} loading={busy} secondary />
          {!!feedback && (
            <Text accessibilityLiveRegion="polite" style={s.note}>
              {feedback}
            </Text>
          )}
        </View>
        {!!error && !cancelId && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        <View style={s.stack}>
          <Text accessibilityRole="header" style={[s.heading, { fontSize: 29 }]}>
            MEUS AGENDAMENTOS
          </Text>
          <Text style={s.small}>
            Demonstrações salvas neste aparelho. Sem sincronização com a agenda de Igor.
          </Text>
          {data.bookings.length === 0 ? (
            <View style={s.card}>
              <Text style={s.title}>Seu próximo visual começa aqui.</Text>
              <Text style={s.body}>Você ainda não tem agendamentos locais.</Text>
              <Button title="Escolher meu serviço" onPress={book} />
            </View>
          ) : (
            [...data.bookings]
              .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
              .map((booking) => {
                const service = services.find((item) => item.id === booking.serviceId);
                const past = atTime(booking.date, booking.time).getTime() <= Date.now();
                return (
                  <View key={booking.id} style={s.card}>
                    <Text style={s.eyebrow}>
                      {booking.status === 'cancelled'
                        ? 'CANCELADO LOCALMENTE'
                        : past
                          ? 'DEMONSTRAÇÃO · DATA PASSADA'
                          : 'AGENDAMENTO LOCAL'}
                    </Text>
                    <Text style={s.title}>{service?.name}</Text>
                    <Text style={s.body}>
                      {dateLabel(booking.date, true)} às {booking.time} ·{' '}
                      {money(service?.price ?? 0)}
                    </Text>
                    {booking.status === 'local' && !past && (
                      <Button
                        title="Cancelar agendamento local"
                        onPress={() => {
                          setError('');
                          setCancelId(booking.id);
                        }}
                        secondary
                        disabled={busy}
                      />
                    )}
                  </View>
                );
              })
          )}
        </View>
        <View style={s.divider} />
        <Heading eyebrow="Muito além da cadeira" title="Prazer, Igor Borges." />
        <Image
          source={require('../../assets/images/shop.png')}
          accessibilityLabel="Imagem conceitual do ambiente da barbearia, copiada do site"
          style={{ width: '100%', aspectRatio: 1.6, borderRadius: 18 }}
        />
        <View style={s.row}>
          <Scissors size={24} color={colors.light} />
          <Text style={[s.title, s.grow]}>Técnica e personalidade em cada atendimento.</Text>
        </View>
        <Text style={s.body}>
          Em Campo Grande, no coração do Rio, a Igor Barber Club é um espaço para cuidar do visual,
          trocar uma ideia e sair com a confiança renovada. À frente da cadeira, Igor Borges coloca
          seu estilo em primeiro lugar.
        </Text>
        <View style={s.card}>
          <View style={s.row}>
            <MapPin size={22} color={colors.light} />
            <View style={s.grow}>
              <Text style={s.title}>Campo Grande</Text>
              <Text style={s.body}>Rio de Janeiro · RJ</Text>
            </View>
          </View>
          <Text style={s.body}>
            Atendimento com hora marcada. Consulte o endereço exato e os horários com Igor pelo
            Instagram.
          </Text>
          <ExternalButton
            title="Ver região no mapa"
            url="https://www.google.com/maps/search/?api=1&query=Campo+Grande+Rio+de+Janeiro+RJ"
          />
          <ExternalButton title="@igor_barber_club" url={instagram} secondary={false} />
        </View>
        <Text style={s.small}>
          Seus dados ficam neste dispositivo. Limpar os dados do app remove o perfil e o histórico
          local.
        </Text>
      </Page>
      <Modal
        visible={!!cancelId}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) setCancelId(null);
        }}
      >
        <View style={{ flex: 1, backgroundColor: '#000B', justifyContent: 'center', padding: 24 }}>
          <View style={[s.card, { width: '100%', maxWidth: 460, alignSelf: 'center' }]}>
            <Text accessibilityRole="header" style={s.title}>
              Cancelar este agendamento?
            </Text>
            <Text style={s.body}>O horário ficará livre na demonstração deste aparelho.</Text>
            {!!error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            <Button
              title="Sim, cancelar localmente"
              onPress={() => void cancelBooking()}
              loading={busy}
            />
            <Button
              title="Manter agendamento"
              onPress={() => setCancelId(null)}
              disabled={busy}
              secondary
            />
          </View>
        </View>
      </Modal>
    </>
  );
}
