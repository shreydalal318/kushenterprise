import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '@/lib/cart';
import { C, R } from '@/lib/theme';

type Show = (title: string, detail?: string, ms?: number) => void;
const Ctx = createContext<Show>(() => {});
const native = Platform.OS !== 'web';

/**
 * "Yes, that's done": a green banner after every action (added to cart, request sent, invoice
 * downloaded). It hides by itself; a new one replaces the old, so quick taps never pile up.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ title: string; detail?: string } | null>(null);
  const [fade] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insets = useSafeAreaInsets();
  // A new banner interrupts this fade-out (finished = false), so it is never cleared by mistake.
  const hide = useCallback(() => Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: native }).start(({ finished }) => { if (finished) setMsg(null); }), [fade]);
  const show = useCallback<Show>((title, detail, ms = 2500) => {
    clearTimeout(timer.current);
    setMsg({ title, detail });
    Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: native }).start();
    timer.current = setTimeout(hide, ms);
    // Android reads the live region out by itself; iOS has to be told.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(detail ? `${title}. ${detail}` : title);
  }, [fade, hide]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Ctx.Provider value={show}>
      <View style={{ flex: 1 }}>
        {children}
        {/* Always mounted, so Android's live region reads each new message out. */}
        <Animated.View accessibilityLiveRegion="polite" pointerEvents={msg ? 'box-none' : 'none'} style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 8, opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }}>
          {msg && (
            <Pressable accessibilityRole="alert" accessibilityHint="Tap to close" onPress={hide}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.ok, borderRadius: R.lg, paddingVertical: 12, paddingHorizontal: 14, minHeight: 56, elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
              <Ionicons name="checkmark-circle" size={28} color={C.white} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.white, fontWeight: '700', fontSize: 16 }}>{msg.title}</Text>
                {!!msg.detail && <Text style={{ color: C.white, fontSize: 15 }}>{msg.detail}</Text>}
              </View>
            </Pressable>
          )}
        </Animated.View>
      </View>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

/** Change a cart quantity and say so: "Added to cart — 2 × BSS 500 ml". */
export function useCartQty() {
  const cart = useCart();
  const toast = useToast();
  return (variantId: string, name: string, qty: number) => {
    const before = cart.items[variantId] ?? 0;
    const n = Math.max(0, Math.min(500, qty));
    cart.set(variantId, n);
    if (!n) toast('Removed from cart', name);
    else toast(n > before ? 'Added to cart' : 'Cart updated', `${n} × ${name}`);
  };
}
