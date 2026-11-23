import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { trpc } from './trpc';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

/**
 * Register this phone for push notifications (order updates, new orders for staff). Needs an EAS
 * project id in app.json (extra.eas.projectId) once the app is built with EAS; skipped until then.
 */
export function usePushRegistration() {
  const register = trpc.notifications.registerDevice.useMutation();
  useEffect(() => {
    if (Platform.OS === 'web' || !Device.isDevice) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (!projectId) return;
    void (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      register.mutate({ platform: Platform.OS === 'ios' ? 'ios' : 'android', pushToken: token });
    })().catch(() => {});
    // Tapping a notification opens the matching screen.
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = r.notification.request.content.data?.link as string | undefined;
      const m = link?.match(/\/(portal|app)\/orders\/([^/?]+)/);
      if (m) router.push(m[1] === 'portal' ? `/customer/order/${m[2]}` : `/staff/order/${m[2]}`);
    });
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
