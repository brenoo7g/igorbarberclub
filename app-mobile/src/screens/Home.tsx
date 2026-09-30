import { ImageBackground, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Coffee,
  MapPin,
  Scissors,
  ShieldCheck,
} from 'lucide-react-native';
import { Button, Page } from '../components/UI';
import { colors, fonts, s } from '../theme';
import { gallery } from '../data/gallery';
import { services } from '../data/services';
import { useClub } from '../state/ClubContext';
import { atTime, dateLabel } from '../lib/booking';
export type Tab = 'home' | 'services' | 'booking' | 'gallery' | 'account';
export function Home({
  navigate,
  book,
}: {
  navigate: (tab: Tab) => void;
  book: (id?: string) => void;
}) {
  const { data } = useClub();
  const upcoming = data.bookings
    .filter((b) => b.status === 'local' && atTime(b.date, b.time).getTime() > Date.now())
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  return (
    <Page>
      <View style={s.between}>
        <View style={{ gap: 4 }}>
          <Text style={s.eyebrow}>SEU ESTILO. SEU CLUB.</Text>
          <Text style={s.body}>
            {data.profile.name
              ? 'Salve, ' + data.profile.name.split(' ')[0] + '.'
              : 'Seu próximo nível começa aqui.'}
          </Text>
        </View>
        <Scissors color={colors.light} size={24} />
      </View>
      <ImageBackground
        source={require('../../assets/images/hero.png')}
        imageStyle={{ borderRadius: 20, width: '100%', height: '100%' }}
        style={{
          height: 430,
          width: '100%',
          borderRadius: 20,
          overflow: 'hidden',
          backgroundColor: colors.surface,
        }}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)', '#101014']}
          locations={[0, 0.3, 1]}
          style={{ flex: 1, justifyContent: 'flex-end', padding: 24, gap: 15 }}
        >
          <View style={s.badge}>
            <Text style={s.eyebrow}>ESTILO É IDENTIDADE</Text>
          </View>
          <Text
            accessibilityRole="header"
            accessibilityLabel="Não é só um corte. É sobre você."
            style={{ fontFamily: fonts.heading, fontSize: 49, lineHeight: 49, color: colors.text }}
          >
            NÃO É SÓ UM{'\n'}
            <Text style={{ color: '#6D8BFF' }}>CORTE.</Text> É SOBRE{'\n'}VOCÊ.
          </Text>
          <Text style={[s.body, { color: '#D0D0D5' }]}>
            Corte na régua, barba alinhada.{'\n'}Uma experiência feita pra você.
          </Text>
          <Button
            title="Agendar meu horário"
            onPress={() => book()}
            icon={<ArrowUpRight size={18} color="#FFF" />}
          />
        </LinearGradient>
      </ImageBackground>
      <View style={[s.row, { justifyContent: 'center' }]}>
        <MapPin size={14} color={colors.light} />
        <Text style={s.small}>CAMPO GRANDE · RIO DE JANEIRO</Text>
      </View>
      {upcoming && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver próximo agendamento local"
          onPress={() => navigate('account')}
          style={[s.card, { borderColor: '#334480' }]}
        >
          <Text style={s.eyebrow}>SEU PRÓXIMO VISUAL · DEMONSTRAÇÃO</Text>
          <Text style={s.title}>
            {services.find((item) => item.id === upcoming.serviceId)?.name}
          </Text>
          <Text style={s.body}>
            {dateLabel(upcoming.date, true)} às {upcoming.time} · salvo neste aparelho
          </Text>
        </Pressable>
      )}
      <View style={s.row}>
        {[
          { icon: CalendarDays, title: 'Serviços', tab: 'services' },
          { icon: Scissors, title: 'Os cortes', tab: 'gallery' },
          { icon: MapPin, title: 'O Club', tab: 'account' },
        ].map((item) => (
          <Pressable
            key={item.tab}
            accessibilityRole="button"
            onPress={() => navigate(item.tab as Tab)}
            style={({ pressed }) => [
              s.card,
              { flex: 1, alignItems: 'center', padding: 14, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <item.icon size={22} color={colors.light} />
            <Text style={s.small}>{item.title}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.stack}>
        <Text accessibilityRole="header" style={[s.heading, { fontSize: 29 }]}>
          PRECISÃO EM CADA DETALHE.
        </Text>
        {[
          { icon: Scissors, title: 'Corte na régua', text: 'Técnica, estilo e personalidade.' },
          {
            icon: ShieldCheck,
            title: 'Cuidado de verdade',
            text: 'Do início ao último acabamento.',
          },
          { icon: Coffee, title: 'Seu momento', text: 'Um bom papo. Um novo visual.' },
        ].map((item) => (
          <View key={item.title} style={[s.row, { paddingVertical: 8 }]}>
            <item.icon size={22} color={colors.light} />
            <View style={s.grow}>
              <Text style={s.label}>{item.title}</Text>
              <Text style={s.body}>{item.text}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={s.between}>
        <Text accessibilityRole="header" style={[s.heading, { fontSize: 29 }]}>
          FEITO NO CLUB.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver galeria"
          onPress={() => navigate('gallery')}
          style={{ padding: 12 }}
        >
          <ArrowRight size={21} color={colors.light} />
        </Pressable>
      </View>
      <View style={s.row}>
        {gallery.slice(0, 2).map((photo) => (
          <Pressable
            key={photo.id}
            accessibilityRole="button"
            accessibilityLabel={'Ver galeria: ' + photo.title}
            onPress={() => navigate('gallery')}
            style={{ flex: 1, gap: 8 }}
          >
            <Image
              source={photo.image}
              accessibilityLabel={photo.title}
              style={{ width: '100%', aspectRatio: 0.85, borderRadius: 14 }}
            />
            <Text style={s.label}>{photo.title}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[s.small, { textAlign: 'center', letterSpacing: 2 }]}>
        IGOR BARBER CLUB · ESTILO COM IDENTIDADE
      </Text>
    </Page>
  );
}
