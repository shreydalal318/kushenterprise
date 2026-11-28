import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C } from '@/lib/theme';
import { Card } from './ui';

/**
 * "Yes, that's done" — every confirmation shows in the middle of the screen: a green tick, what happened,
 * and (when there is one) the next step. It never blocks a tap and fades away by itself, so quick work
 * (adding items, scanning) carries on.
 */
type Msg = { title: string; detail?: string; ms: number; id: number };
let listener: ((m: Msg) => void) | null = null;
let seq = 0;
const native = Platform.OS !== 'web';

/** Show a centred confirmation. Title "Dispatched", detail "Next: mark it delivered…". */
export function showDone(title: string, detail?: string, ms?: number) {
  const len = title.length + (detail?.length ?? 0);
  listener?.({ title, detail, ms: ms ?? Math.min(4500, Math.max(1800, 1400 + len * 30)), id: ++seq });
}

/** The app's messages read "Dispatched ✓ Next: …": the part before the tick is the title, the rest the detail. */
export function showDoneText(text: string) {
  const i = text.indexOf('✓');
  if (i < 0) return showDone(text.trim());
  const title = text.slice(0, i).trim();
  const detail = text.slice(i + 1).trim();
  showDone(title || 'Done', detail || undefined);
}

/** Drop-in for a "flash" message held in state: shows it in the middle once, then clears it. */
export function Done({ message, onShown }: { message: string | null | undefined | false; onShown?: () => void }) {
  useEffect(() => {
    if (!message) return;
    showDoneText(message);
    onShown?.();
  }, [message]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Mounted once at the root, above every screen. */
export function DoneHost() {
  const [msg, setMsg] = useState<Msg | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const last = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  useEffect(() => {
    listener = (m) => {
      // The same message twice in a moment (a double render) shows once.
      const text = `${m.title}|${m.detail ?? ''}`;
      if (text === last.current.text && Date.now() - last.current.at < 800) return;
      last.current = { text, at: Date.now() };
      clearTimeout(timer.current);
      setMsg(m);
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, useNativeDriver: native, friction: 7, tension: 80 }).start();
      if (native) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(m.detail ? `${m.title}. ${m.detail}` : m.title);
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: native }).start(({ finished }) => { if (finished) setMsg(null); });
      }, m.ms);
    };
    return () => { listener = null; clearTimeout(timer.current); };
  }, [anim]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Animated.View accessibilityLiveRegion="polite" accessibilityRole="alert"
        style={{ opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }], width: '100%', maxWidth: 340 }}>
        {msg && (
          <View style={{ alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 22, paddingVertical: 24, paddingHorizontal: 22, elevation: 12, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
            <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: C.ok, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={42} color={C.white} />
            </View>
            <Text style={{ fontSize: 19, fontWeight: '700', color: C.navy, textAlign: 'center' }}>{msg.title}</Text>
            {!!msg.detail && <Text style={{ fontSize: 15, lineHeight: 21, color: C.muted, textAlign: 'center' }}>{msg.detail}</Text>}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

/**
 * A finished task (payment recorded, invoice made, order saved): the whole screen says so, centred —
 * big tick, title, the key facts — with the next steps as buttons at the bottom.
 */
export function SuccessScreen({ title, lines = [], children, footer, waiting = false }: { title: string; lines?: (string | false | null | undefined)[]; children?: ReactNode; footer?: ReactNode; /** Saved on the phone, not sent yet (no connection). */ waiting?: boolean }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: native, friction: 6, tension: 70 }).start();
    if (native) void Haptics.notificationAsync(waiting ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(title);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }], opacity: pop }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: waiting ? C.warn : C.ok, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={waiting ? 'cloud-upload-outline' : 'checkmark'} size={waiting ? 50 : 60} color={C.white} />
          </View>
        </Animated.View>
        <Text accessibilityRole="header" style={{ fontSize: 23, fontWeight: '800', color: C.navy, textAlign: 'center' }}>{title}</Text>
        {lines.filter(Boolean).map((l, i) => <Text key={i} style={{ fontSize: 16, lineHeight: 23, color: i === 0 ? C.ink : C.muted, textAlign: 'center' }}>{l}</Text>)}
        {!!children && <Card style={{ alignSelf: 'stretch', marginTop: 4 }}>{children}</Card>}
      </View>
      {!!footer && <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>{footer}</View>}
    </View>
  );
}
