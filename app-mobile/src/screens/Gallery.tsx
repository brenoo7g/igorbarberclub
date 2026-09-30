import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, ExternalButton, Heading, Page } from '../components/UI';
import { gallery } from '../data/gallery';
import { instagram } from '../data/services';
import { colors, s } from '../theme';
export function Gallery({ book }: { book: () => void }) {
  const [filter, setFilter] = useState('Todos');
  const [selected, setSelected] = useState<(typeof gallery)[number] | null>(null);
  return (
    <>
      <Page>
        <Heading
          eyebrow="Nosso trabalho"
          title="O detalhe faz o estilo."
          subtitle="Cortes reais do Igor Barber Club. Encontre sua próxima inspiração."
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {['Todos', 'Degradê', 'Disfarçado', 'Acabamento'].map((category) => (
            <Chip
              key={category}
              title={category}
              selected={filter === category}
              onPress={() => setFilter(category)}
            />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {gallery
            .filter((photo) => filter === 'Todos' || photo.category === filter)
            .map((photo) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Ampliar ' + photo.title}
                key={photo.id}
                onPress={() => setSelected(photo)}
                style={{ width: '48%', flexGrow: 1, maxWidth: '100%', gap: 9, marginBottom: 12 }}
              >
                <Image
                  source={photo.image}
                  accessibilityLabel={photo.title}
                  style={{
                    width: '100%',
                    aspectRatio: 0.8,
                    borderRadius: 16,
                    backgroundColor: colors.surface,
                  }}
                />
                <Text style={s.eyebrow}>{photo.category}</Text>
                <Text style={s.label}>{photo.title}</Text>
              </Pressable>
            ))}
        </View>
        <ExternalButton title="Mais cortes no Instagram" url={instagram} />
        <Button title="Quero renovar meu visual" onPress={book} />
      </Page>
      <Modal visible={!!selected} animationType="fade" onRequestClose={() => setSelected(null)}>
        <SafeAreaView style={s.page}>
          <View style={{ flex: 1, padding: 22, gap: 20 }}>
            {selected && (
              <>
                <Text accessibilityRole="header" style={s.heading}>
                  {selected.title}
                </Text>
                <Image
                  source={selected.image}
                  accessibilityLabel={selected.title}
                  contentFit="contain"
                  style={{ flex: 1, width: '100%' }}
                />
                <Button title="Fechar foto" onPress={() => setSelected(null)} secondary />
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
