import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { CalendarDays, House, Images, Scissors, UserRound } from 'lucide-react-native';
import { ClubProvider, useClub } from './src/state/ClubContext';
import { Home, type Tab } from './src/screens/Home';
import { Services } from './src/screens/Services';
import { Booking } from './src/screens/Booking';
import { Gallery } from './src/screens/Gallery';
import { Account } from './src/screens/Account';
import { Button } from './src/components/UI';
import { colors, fonts, s } from './src/theme';

const tabs = [
  { id: 'home', label: 'Início', icon: House },
  { id: 'services', label: 'Serviços', icon: Scissors },
  { id: 'booking', label: 'Agendar', icon: CalendarDays },
  { id: 'gallery', label: 'Galeria', icon: Images },
  { id: 'account', label: 'Perfil', icon: UserRound },
] as const;

function ClubApp() {
  const { loading, error, retry } = useClub();
  const [tab, setTab] = useState<Tab>('home');
  const [initialService, setInitialService] = useState<string>();
  const [bookingKey, setBookingKey] = useState(0);
  const book = (id?: string) => {
    setInitialService(id);
    setBookingKey((key) => key + 1);
    setTab('booking');
  };
  const navigate = (next: Tab) => {
    if (next === 'booking' && tab !== 'booking') book();
    else setTab(next);
  };
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'home') return false;
      setTab('home');
      return true;
    });
    return () => subscription.remove();
  }, [tab]);
  return (
    <SafeAreaView style={s.page}>
      <StatusBar style="light" />
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View
          style={[
            s.between,
            {
              paddingHorizontal: 22,
              paddingVertical: 16,
              maxWidth: 760,
              width: '100%',
              alignSelf: 'center',
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Igor Barber Club, início"
            onPress={() => navigate('home')}
            style={s.row}
          >
            <View style={{ width: 4, height: 30, borderRadius: 2, backgroundColor: colors.blue }} />
            <View>
              <Text
                style={{
                  color: colors.text,
                  fontFamily: fonts.heading,
                  fontSize: 25,
                  lineHeight: 26,
                  letterSpacing: 2,
                }}
              >
                IGOR
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  fontFamily: fonts.bold,
                  fontSize: 8,
                  letterSpacing: 2.4,
                }}
              >
                BARBER CLUB
              </Text>
            </View>
          </Pressable>
          <View style={s.row}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blue }} />
            <Text style={s.small}>ESTILO COM IDENTIDADE</Text>
          </View>
        </View>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <ActivityIndicator color={colors.blue} />
          <Text style={s.body}>Preparando seu Club…</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
          <Button title="Tentar novamente" onPress={retry} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={s.grow}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {tab === 'home' && <Home navigate={navigate} book={book} />}
          {tab === 'services' && <Services book={book} />}
          {tab === 'booking' && (
            <Booking
              key={bookingKey}
              initialService={initialService}
              viewAccount={() => navigate('account')}
            />
          )}
          {tab === 'gallery' && <Gallery book={book} />}
          {tab === 'account' && <Account book={book} />}
        </KeyboardAvoidingView>
      )}
      <View
        style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#111111' }}
      >
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: 'row',
            maxWidth: 760,
            width: '100%',
            alignSelf: 'center',
            paddingTop: 8,
            paddingBottom: 6,
          }}
        >
          {tabs.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: tab === item.id }}
              onPress={() => navigate(item.id)}
              style={{ flex: 1, alignItems: 'center', gap: 5, paddingVertical: 9 }}
            >
              <item.icon size={21} color={tab === item.id ? colors.light : colors.muted} />
              <Text
                style={{
                  fontFamily: tab === item.id ? fonts.bold : fonts.medium,
                  fontSize: 10,
                  color: tab === item.id ? colors.light : colors.muted,
                }}
              >
                {item.label}
              </Text>
              <View
                style={{
                  height: 3,
                  width: 15,
                  borderRadius: 2,
                  backgroundColor: tab === item.id ? colors.blue : 'transparent',
                }}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [loaded, error] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    BarlowCondensed_700Bold,
  });
  if (!loaded && !error)
    return (
      <View style={[s.page, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <ClubProvider>
        <ClubApp />
      </ClubProvider>
    </SafeAreaProvider>
  );
}
