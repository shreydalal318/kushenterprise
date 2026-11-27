import { useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IntroSplash } from '@/components/intro-splash';
import { AuthProvider } from '@/lib/auth';
import { C } from '@/lib/theme';
import { makeTrpcClient, trpc } from '@/lib/trpc';

/**
 * Catalogue and stock answers are kept on the phone for a week, so the catalogue still opens in a
 * basement OT with no signal; they refresh as soon as the connection is back.
 */
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'ke-query-cache-v1' });
const CACHED = new Set(['portal.catalogue', 'portal.filters', 'portal.product', 'portal.home', 'portal.orders', 'portal.checkout', 'products.list', 'inventory.overview', 'sales.customers']);

export default function RootLayout() {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 7 * 24 * 3600_000, retry: 1, networkMode: 'offlineFirst' }, mutations: { networkMode: 'always' } } }));
  const [client] = useState(makeTrpcClient);
  const [intro, setIntro] = useState(true);
  return (
    <SafeAreaProvider>
      <trpc.Provider client={client} queryClient={qc}>
        <PersistQueryClientProvider client={qc} persistOptions={{
          persister, maxAge: 7 * 24 * 3600_000,
          dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && CACHED.has(((q.queryKey[0] as string[] | undefined) ?? []).join('.')) },
        }}>
          <AuthProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerTintColor: C.navy, headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: C.canvas } }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="customer" options={{ headerShown: false }} />
              <Stack.Screen name="staff" options={{ headerShown: false }} />
              <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
            </Stack>
          </AuthProvider>
        </PersistQueryClientProvider>
      </trpc.Provider>
      {intro && <IntroSplash onDone={() => setIntro(false)} />}
    </SafeAreaProvider>
  );
}
