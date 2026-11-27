import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { C } from '@/lib/theme';

/** The logo (brand/logo-icon): a navy and a teal circle, light aqua where they overlap. */
const D = 96;
const GAP = Math.round(D * 0.48); // left edge to left edge, as in the logo
const LENS = '#a9ddda';
const START = D * 1.6;

/**
 * Opening animation: the two circles slide together and the lens forms where they overlap, the
 * wordmark fades in, then everything fades into the app (which has been loading underneath).
 * Skipped when the phone is set to reduce motion.
 */
export function IntroSplash({ onDone }: { onDone: () => void }) {
  const left = useRef(new Animated.Value(-START)).current; // navy circle, offset from its place
  const right = useRef(new Animated.Value(START)).current; // teal circle
  const word = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      if (reduce) return onDone();
      const ease = Easing.out(Easing.cubic);
      Animated.sequence([
        Animated.parallel([
          Animated.timing(left, { toValue: 0, duration: 700, easing: ease, useNativeDriver: true }),
          Animated.timing(right, { toValue: 0, duration: 700, easing: ease, useNativeDriver: true }),
        ]),
        Animated.timing(word, { toValue: 1, duration: 350, easing: ease, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => alive && onDone());
    });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const appear = left.interpolate({ inputRange: [-START, 0], outputRange: [0, 1] });
  // The lens is a light-aqua circle at the navy circle's position, clipped by the teal circle.
  const lensX = Animated.add(-GAP, Animated.subtract(left, right));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.screen, { opacity: fade }]} accessibilityLabel="Kush Enterprise">
      <View style={{ width: GAP + D, height: D }}>
        <Animated.View style={[s.circle, { backgroundColor: C.navy, opacity: appear, transform: [{ translateX: left }] }]} />
        <Animated.View style={[s.circle, { left: GAP, backgroundColor: C.teal, overflow: 'hidden', opacity: appear, transform: [{ translateX: right }] }]}>
          <Animated.View style={[s.circle, { backgroundColor: LENS, transform: [{ translateX: lensX }] }]} />
        </Animated.View>
      </View>
      <Animated.View style={{ marginTop: 28, opacity: word, transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
        <Text style={s.word}><Text style={{ fontWeight: '700' }}>Kush</Text> Enterprise</Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  screen: { backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  circle: { position: 'absolute', top: 0, left: 0, width: D, height: D, borderRadius: D / 2 },
  word: { fontSize: 28, color: C.ink, letterSpacing: 0.2 },
});
