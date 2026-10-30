import { Platform } from 'react-native';

export const Colors = {
  background: '#171A20',
  surface: '#171A20',
  surfaceRecessed: '#181B22',
  cardSurface: '#21252E',
  tabBar: '#171A20',
  navigationBar: '#171A20',
  border: '#2B303A',
  primary: '#F59E0B',
  alertAccent: '#F59E0B',
  alertBackground: '#302516',
  alertBorder: '#493A21',
  alertHighlight: '#665024',
  textPrimary: '#F3F4F6',
  textSecondary: '#969DAA',
} as const;

export const Fonts = {
  sans: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'System',
  }),
  mono: Platform.select({
    ios: 'SpaceMono',
    android: 'monospace',
    default: 'monospace',
  }),
} as const;

export const Theme = {
  colors: Colors,
  fonts: Fonts,
} as const;
