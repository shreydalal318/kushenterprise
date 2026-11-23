import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** One app, two modes: customers get ordering, staff get scanning and billing. */
export default function Index() {
  const { ready, me } = useAuth();
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center' }}><Loading /></View>;
  if (!me) return <Redirect href="/login" />;
  if (me.mustChangePassword) return <Redirect href="/change-password" />;
  return <Redirect href={me.role === 'CUSTOMER' ? '/customer' : '/staff'} />;
}
