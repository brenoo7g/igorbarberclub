import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Chip, Heading, Page, ServiceCard } from '../components/UI';
import { services } from '../data/services';
import { s } from '../theme';
export function Services({ book }: { book: (id: string) => void }) {
  const [filter, setFilter] = useState('Todos');
  return (
    <Page>
      <Heading
        eyebrow="Nossos serviços"
        title="Na medida do seu estilo."
        subtitle="Do cuidado com a barba ao acabamento. Escolha seu próximo visual."
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {['Todos', 'Barba', 'Combos', 'Acabamento'].map((category) => (
          <Chip
            key={category}
            title={category}
            selected={filter === category}
            onPress={() => setFilter(category)}
          />
        ))}
      </ScrollView>
      <View style={s.stack}>
        {services
          .filter((service) => filter === 'Todos' || service.category === filter)
          .map((service) => (
            <ServiceCard key={service.id} service={service} onPress={() => book(service.id)} />
          ))}
      </View>
      <Text style={s.small}>
        Atendimento com Igor Borges. Cada sessão dura 40 minutos. Escolha um serviço para começar.
      </Text>
    </Page>
  );
}
