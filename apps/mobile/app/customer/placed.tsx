import { useEffect } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button, Card } from '@/components/ui';
import { Note } from '@/customer/ui';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';

/**
 * Right after Place order: a full screen that says the order really went through (green), or that it
 * is saved on the phone and will go by itself once online (amber). Nobody should wonder "did it work?".
 */
export default function PlacedScreen() {
  const { id, number, total, units, offline } = useLocalSearchParams<{ id?: string; number?: string; total?: string; units?: string; offline?: string }>();
  const saved = offline === '1';
  useEffect(() => {
    if (Platform.OS !== 'web') void Haptics.notificationAsync(saved ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [saved]);
  const [bg, fg] = saved ? [C.warn50, C.warn] : [C.ok50, C.ok];
  const n = Number(units) || 0;
  const amount = [n ? `${n} item${n === 1 ? '' : 's'}` : null, total ? `${rupees(Number(total))} + GST` : null].filter(Boolean).join(' · ');
  // Back to the tabs that are already open (not a second copy of them).
  const track = () => (saved || !id ? router.dismissTo('/customer/orders') : router.replace(`/customer/order/${id}`));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 20 }}>
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel={saved ? `Saved on your phone. ${amount}` : `Order placed. Order number ${number ?? ''}. ${amount}`} style={{ alignItems: 'center', gap: 10 }}>
          <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={saved ? 'cloud-offline' : 'checkmark-circle'} size={96} color={fg} />
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: fg, textAlign: 'center' }}>{saved ? 'Saved on your phone' : 'Order placed ✓'}</Text>
          {saved
            ? <Text style={{ fontSize: 17, color: C.ink, textAlign: 'center', lineHeight: 24 }}>There is no internet right now. Your order will be sent automatically when you're online. You don't need to do anything.</Text>
            : !!number && <><Note>Your order number</Note><Text selectable style={{ fontSize: 24, fontWeight: '800', color: C.navy }}>{number}</Text></>}
          {!!amount && <Text style={{ fontSize: 17, color: C.ink, fontWeight: '600' }}>{amount}</Text>}
        </View>
        <Card style={{ backgroundColor: saved ? C.warn50 : C.aqua50, borderColor: saved ? C.warn50 : C.aqua100 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>What happens next</Text>
          <Text style={{ fontSize: 16, color: C.ink, lineHeight: 23 }}>
            {saved ? 'As soon as your phone is online we send it, and you get the order number. Until then you can see it waiting in Orders.'
              : "We'll make your invoice and send it out. You'll get a message at each step."}
          </Text>
        </Card>
        <View style={{ gap: 10 }}>
          <Button title="Track this order" icon={<Ionicons name="navigate-outline" size={20} color={C.white} />} onPress={track} />
          <Button variant="secondary" title="Back to ordering" onPress={() => router.dismissTo('/customer')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
