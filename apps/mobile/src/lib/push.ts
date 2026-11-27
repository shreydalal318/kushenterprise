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

/**
 * Register this phone for push notifications (order updates, new orders for staff). Needs an EAS
 * project id in app.json (extra.eas.projectId) once the app is built with EAS; skipped until then.
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
    if (!projectId) return;
    void (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await register.mutateAsync({ platform: Platform.OS === 'ios' ? 'ios' : 'android', pushToken: token });
      await rememberPushToken(token);
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
