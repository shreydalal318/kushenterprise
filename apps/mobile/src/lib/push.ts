import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { rememberPushToken, useAuth, useCan } from './auth';
import { appRoute } from './links';
import { trpc } from './trpc';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

// Each tap is acted on once, whether it came while the app was open or launched it from closed.
const opened = new Set<string>();

/** True once this phone is registered for real push; until then the app alerts new orders itself while open. */
let pushReady = false;

/** New orders and updates ring and pop up as a banner (Android needs a high-importance channel for that). */
async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Orders and updates', importance: Notifications.AndroidImportance.MAX, sound: 'default',
    vibrationPattern: [0, 250, 200, 250], lightColor: '#147c79', lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Register this phone for push notifications (order updates, new orders for staff). Android builds with
 * google-services.json register Google's own FCM token (the server sends with the Firebase service account);
 * an EAS build with extra.eas.projectId registers an Expo token instead. Without either, the phone still asks
 * for permission so the in-app alerts below can ring.
 */
export function usePushRegistration() {
  const register = trpc.notifications.registerDevice.useMutation();
  const { me } = useAuth();
  const can = useCan();
  const routeFor = useRef((_link: string | undefined): string | null => null);
  routeFor.current = (link) => appRoute(link, me?.role === 'CUSTOMER', can('VIEW_ORDERS'));

  useEffect(() => {
    if (Platform.OS === 'web' || !Device.isDevice) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    void (async () => {
      await ensureChannel().catch(() => {});
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      let token: string | null = null;
      if (projectId) token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      // Throws when the app was built without google-services.json; the in-app alerts cover that case.
      else if (Platform.OS === 'android') token = String((await Notifications.getDevicePushTokenAsync()).data);
      if (!token) return;
      await register.mutateAsync({ platform: Platform.OS === 'ios' ? 'ios' : 'android', pushToken: token });
      await rememberPushToken(token);
      pushReady = true;
    })().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tapping a notification opens the matching screen (once we know who is signed in).
  const userId = me?.id;
  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return;
    const open = (r: Notifications.NotificationResponse | null) => {
      if (!r || opened.has(r.notification.request.identifier)) return;
      opened.add(r.notification.request.identifier);
      void Notifications.clearLastNotificationResponseAsync().catch(() => {}); // so a later launch doesn't reopen it
      const to = routeFor.current(r.notification.request.content.data?.link as string | undefined);
      if (to) router.push(to);
    };
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [userId]);
}

/**
 * While the app is open, new notifications (a new order, "You'll deliver…") ring as a normal phone
 * notification even when real push isn't set up: the unread count is checked every 30 seconds, and each new
 * one is shown once. With real push the system shows them, so this stays quiet.
 */
export function useInAppAlerts() {
  const { me } = useAuth();
  const utils = trpc.useUtils();
  const unread = trpc.notifications.unreadCount.useQuery(undefined, { enabled: !!me, refetchInterval: 30_000, refetchIntervalInBackground: true });
  const last = useRef<number | null>(null);
  const shown = useRef(new Set<string>());
  const since = useRef(Date.now());
  useEffect(() => {
    const n = unread.data;
    if (n == null || Platform.OS === 'web') return;
    const grew = last.current != null && n > last.current;
    last.current = n;
    if (!grew || pushReady) return;
    void utils.notifications.list.fetch({ unreadOnly: true, limit: 5 }).then((rows) => {
      for (const r of rows.filter((x) => !shown.current.has(x.id) && new Date(x.createdAt).getTime() >= since.current - 60_000).slice(0, 3).reverse()) {
        shown.current.add(r.id);
        void Notifications.scheduleNotificationAsync({
          content: { title: r.title, body: r.body, sound: 'default', data: r.link ? { link: r.link } : {} },
          // Right away, on the loud "orders" channel on Android.
          trigger: Platform.OS === 'android' ? { channelId: 'orders' } : null,
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [unread.data]); // eslint-disable-line react-hooks/exhaustive-deps
}
