// Platform-independent tokens: future native adapters can consume this same object.
export const gradefyTokens = {
  colors: {
    primary: '#6C5CE7',
    accent: '#00D4FF',
    background: '#090D18',
    surface: '#121827',
    text: '#F8FAFC',
    muted: '#94A3B8',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
  },
  fonts: { heading: 'Sora', body: 'Inter' },
  radius: { input: 12, button: 14, card: 24 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
} as const;
