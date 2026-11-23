import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loadToken, saveToken } from './token';
import { setBearer, trpc, type RouterOutputs } from './trpc';

type Me = NonNullable<RouterOutputs['auth']['me']>;
interface AuthApi { ready: boolean; me: Me | null; signIn: (token: string) => Promise<void>; signOut: () => Promise<void> }
const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [tokenReady, setTokenReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => { void loadToken().then((t) => { setBearer(t); setHasToken(!!t); setTokenReady(true); }); }, []);
  const me = trpc.auth.me.useQuery(undefined, { enabled: tokenReady && hasToken, retry: 1, staleTime: 5 * 60_000 });
  const logout = trpc.auth.logout.useMutation();

  const signIn = useCallback(async (token: string) => {
    await saveToken(token); setBearer(token); qc.clear(); setHasToken(true);
  }, [qc]);
  const signOut = useCallback(async () => {
    await logout.mutateAsync().catch(() => {});
    await saveToken(null); setBearer(null); qc.clear(); setHasToken(false);
  }, [logout, qc]);

  // With a token, wait until the first answer about who we are (pending covers the moment before the fetch starts).
  const ready = tokenReady && (!hasToken || me.status !== 'pending');
  return <Ctx.Provider value={{ ready, me: hasToken ? (me.data ?? null) : null, signIn, signOut }}>{children}</Ctx.Provider>;
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
