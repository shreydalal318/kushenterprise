import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Small } from '@/components/ui';
import { errorText } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

type DevUser = { id: string; name: string; role: string; email: string | null; mobile: string | null; permissions: string[] };

const kind = (u: DevUser): { label: string; icon: keyof typeof Ionicons.glyphMap } =>
  u.role === 'OWNER' ? { label: 'Owner', icon: 'ribbon-outline' }
    : u.role === 'CUSTOMER' ? { label: 'Customer', icon: 'person-outline' }
      : u.permissions.length ? { label: 'Staff', icon: 'storefront-outline' } : { label: 'Delivery', icon: 'bicycle-outline' };

/**
 * Demo and development only: tap anyone to sign in as them. The server returns the list only when it has
 * DEV_QUICK_LOGIN=true in development or DEMO_QUICK_LOGIN=true on a hosted demo, so this renders nothing otherwise.
 */
export function DevQuickLogin({ onDone }: { onDone: (r: { token: string | null }) => void }) {
  const users = trpc.auth.devUsers.useQuery(undefined, { retry: false });
  const login = trpc.auth.devLogin.useMutation({ onSuccess: onDone });
  if (!users.data?.length) return null;
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: R.lg, borderWidth: 1, borderColor: '#fcd34d', backgroundColor: C.warn50 }}>
      <Text style={{ fontWeight: '600', color: C.warn }}>Quick login (demo)</Text>
      <Small>Tap anyone to see the app as them. No password or OTP needed.</Small>
      {users.data.map((u) => {
        const k = kind(u);
        return (
          <Pressable
            key={u.id}
            disabled={login.isPending}
            onPress={() => login.mutate({ userId: u.id, client: 'mobile' })}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: R.md,
              borderWidth: 1, borderColor: '#fde68a', backgroundColor: pressed ? '#fef3c7' : C.white, opacity: login.isPending ? 0.6 : 1,
            })}
          >
            <Ionicons name={k.icon} size={18} color={C.warn} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '500', color: C.ink }} numberOfLines={1}>{u.name}</Text>
              <Small>{u.email ?? u.mobile}</Small>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.warn }}>{k.label}</Text>
          </Pressable>
        );
      })}
      {login.error && <Alert>{errorText(login.error)}</Alert>}
    </View>
  );
}
