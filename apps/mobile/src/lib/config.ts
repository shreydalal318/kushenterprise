import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the Kush Enterprise server is. Set EXPO_PUBLIC_API_URL (e.g. https://app.kushenterprise.in)
 * when building; app.json "extra.apiUrl" is the development default. On the web preview the app is
 * served from the same host as the API, so relative URLs are used.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'web' ? '' : ((Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://localhost:3000'));
