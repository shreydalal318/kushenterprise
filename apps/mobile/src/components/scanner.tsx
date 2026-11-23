import { useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { C, R } from '@/lib/theme';
import { Button, Row, s } from './ui';

/**
 * Camera barcode scanner (Code 128, QR, EAN/UPC, GS1 DataMatrix) with a typed fallback that also
 * takes input from a Bluetooth scanner. The same code is ignored for 1.5 s so one box isn't counted twice.
 */
export function Scanner({ onScan, height = 220, label = 'Scan code' }: { onScan: (code: string) => void | Promise<void>; height?: number; label?: string }) {
  const [perm, requestPerm] = useCameraPermissions();
  const [camera, setCamera] = useState(Platform.OS !== 'web');
  const [typed, setTyped] = useState('');
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const busy = useRef(false);
  async function handle(code: string) {
    const c = code.trim();
    if (!c || busy.current) return;
    const now = Date.now();
    if (c === last.current.code && now - last.current.at < 1500) return;
    last.current = { code: c, at: now };
    busy.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try { await onScan(c); } finally { busy.current = false; }
  }
  return (
    <View style={{ gap: 8 }}>
      {camera && perm?.granted && (
        <View style={{ height, borderRadius: R.lg, overflow: 'hidden', backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={(r) => void handle(r.data)}
            barcodeScannerSettings={{ barcodeTypes: ['code128', 'datamatrix', 'qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code39'] }} />
          <View pointerEvents="none" style={{ position: 'absolute', left: '12%', right: '12%', top: '30%', bottom: '30%', borderWidth: 2, borderColor: C.aqua, borderRadius: 12 }} />
        </View>
      )}
      {camera && perm && !perm.granted && <Button title="Allow camera to scan" onPress={() => void requestPerm()} />}
      <Row>
        <TextInput accessibilityLabel={label} value={typed} onChangeText={setTyped} placeholder="Type or scan a code" autoCapitalize="characters" autoCorrect={false}
          onSubmitEditing={() => { void handle(typed); setTyped(''); }} returnKeyType="go" blurOnSubmit={false} style={[s.input, { flex: 1 }]} placeholderTextColor="#9aa5b1" />
        <Pressable accessibilityRole="button" accessibilityLabel={camera ? 'Hide camera' : 'Use camera'} onPress={() => setCamera(!camera)} style={{ padding: 10, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.white }}>
          <Ionicons name={camera ? 'videocam-off-outline' : 'camera-outline'} size={22} color={C.navy} />
        </Pressable>
      </Row>
      {!camera && <Text style={{ fontSize: 12, color: C.muted }}>Camera off. Type a code and press Go, or use a Bluetooth scanner.</Text>}
    </View>
  );
}
