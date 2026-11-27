import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errorCode } from './format';
import { loadToken, saveToken } from './token';
import { setBearer, trpc, type RouterOutputs } from './trpc';

type Me = NonNullable<RouterOutputs['auth']['me']>;
interface AuthApi { ready: boolean; me: Me | null; signIn: (token: string) => Promise<void>; signOut: () => Promise<void> }
const Ctx = createContext<AuthApi | null>(null);

// The last answer to "who am I", so a start with no signal still opens the saved catalogue and offline queue.
const ME_KEY = 'ke-me-v1';
const PUSH_KEY = 'ke-push-token';
/** push.ts records the token it registered, so signing out can stop this phone getting that user's pushes. */
export const rememberPushToken = (t: string) => AsyncStorage.setItem(PUSH_KEY, t).catch(() => {});
// Signing out must not hang on a weak connection.
const atMost = (p: Promise<unknown>, ms: number) => Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, ms))]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [tokenReady, setTokenReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [saved, setSaved] = useState<Me | null>(null);
  useEffect(() => {
    void Promise.all([loadToken().catch(() => null), AsyncStorage.getItem(ME_KEY).catch(() => null)]).then(([t, m]) => {
      setBearer(t); setHasToken(!!t);
      try { setSaved(t && m ? (JSON.parse(m) as Me) : null); } catch { setSaved(null); }
      setTokenReady(true);
    });
  }, []);
  const me = trpc.auth.me.useQuery(undefined, { enabled: tokenReady && hasToken, retry: 1, staleTime: 5 * 60_000 });
  const logout = trpc.auth.logout.useMutation();
  const unregister = trpc.notifications.unregisterDevice.useMutation();
  useEffect(() => {
    if (me.data === undefined) return;
    if (me.data) void AsyncStorage.setItem(ME_KEY, JSON.stringify(me.data)).catch(() => {});
    else { setSaved(null); void AsyncStorage.removeItem(ME_KEY).catch(() => {}); }
  }, [me.data]);

  const signIn = useCallback(async (token: string) => {
    await AsyncStorage.removeItem(ME_KEY).catch(() => {});
    await saveToken(token); setBearer(token); qc.clear(); setSaved(null); setHasToken(true);
  }, [qc]);
  const signOut = useCallback(async () => {
    const push = await AsyncStorage.getItem(PUSH_KEY).catch(() => null);
    if (push) await atMost(unregister.mutateAsync({ pushToken: push }), 5000); // needs the session, so before logout
    await atMost(logout.mutateAsync(), 5000);
    await AsyncStorage.multiRemove([ME_KEY, PUSH_KEY]).catch(() => {});
    await saveToken(null); setBearer(null); qc.clear(); setSaved(null); setHasToken(false);
  }, [logout, unregister, qc]);

  // Only the server saying "not signed in" signs out; no signal or a server error keeps the last known user.
  const signedOut = !hasToken || errorCode(me.error) === 'UNAUTHORIZED';
  const current = signedOut ? null : me.data !== undefined ? me.data : saved;
  // With a token, wait for the first answer about who we are, unless we already know from last time.
  const ready = tokenReady && (!hasToken || !!saved || me.status !== 'pending');
  return <Ctx.Provider value={{ ready, me: current, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

export function useCan() {
  const { me } = useAuth();
  return (p: string) => !!me && (me.role === 'OWNER' || (me.permissions as string[]).includes(p));
}
