import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** The session token lives in the device keychain (Keychain / Keystore); localStorage on the web preview. */
const KEY = 'ke_session_token';
export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') { try { return localStorage.getItem(KEY); } catch { return null; } }
  return SecureStore.getItemAsync(KEY);
}
export async function saveToken(token: string | null) {
  if (Platform.OS === 'web') { try { if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY); } catch { /* ignore */ } return; }
  if (token) await SecureStore.setItemAsync(KEY, token); else await SecureStore.deleteItemAsync(KEY);
}
