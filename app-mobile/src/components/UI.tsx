import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ArrowUpRight, Check, Clock3, Scissors } from 'lucide-react-native';
import { colors, s } from '../theme';
import { money, type Service } from '../data/services';

export function Page({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
export function Heading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={s.stack}>
      <Text style={s.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={s.heading}>
        {title}
      </Text>
      {subtitle && <Text style={s.body}>{subtitle}</Text>}
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary,
  disabled,
  loading,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color="#FFF" /> : icon}
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function Chip({
  title,
  selected,
  onPress,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chip, selected && s.chipActive]}
    >
      <Text style={[s.label, { color: selected ? colors.light : colors.muted }]}>{title}</Text>
    </Pressable>
  );
}
export function ExternalButton({
  title,
  url,
  secondary = true,
}: {
  title: string;
  url: string;
  secondary?: boolean;
}) {
  const [error, setError] = useState('');
  return (
    <View style={s.stack}>
      <Button
        title={title}
        secondary={secondary}
        icon={<ArrowUpRight size={17} color={colors.text} />}
        onPress={() => {
          setError('');
          Linking.openURL(url).catch(() =>
            setError('Não foi possível abrir o link. Tente novamente.'),
          );
        }}
      />
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
export function ServiceCard({
  service,
  onPress,
  selected = false,
}: {
  service: Service;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={service.name + ', ' + money(service.price) + ', 40 minutos'}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        selected && { borderColor: colors.blue, backgroundColor: '#121A30' },
        pressed && { opacity: 0.8 },
      ]}
    >
      {service.id === 'combo' && <Text style={s.eyebrow}>A EXPERIÊNCIA COMPLETA</Text>}
      <View style={s.between}>
        <View style={{ backgroundColor: '#202643', padding: 10, borderRadius: 10 }}>
          <Scissors color={colors.light} size={20} />
        </View>
        <View style={s.row}>
          <Clock3 size={12} color={colors.muted} />
          <Text style={s.small}>{service.duration} min</Text>
        </View>
      </View>
      <View style={{ gap: 5 }}>
        <Text style={s.title}>{service.name}</Text>
        <Text style={s.body}>{service.description}</Text>
      </View>
      <View style={s.between}>
        <Text style={[s.title, { fontSize: 22 }]}>
          {money(service.price)}
          <Text style={s.small}> / sessão</Text>
        </Text>
        {selected ? (
          <Check size={21} color={colors.light} />
        ) : (
          <ArrowUpRight size={21} color={colors.light} />
        )}
      </View>
    </Pressable>
  );
}
