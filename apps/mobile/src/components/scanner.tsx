import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C, R } from '@/lib/theme';
import { Button, Row, s } from './ui';

/**
 * Camera barcode scanner (Code 128, QR, EAN/UPC, GS1 DataMatrix) with a typed fallback that also
 * takes input from a Bluetooth scanner. The same code is ignored for 1.5 s so one box isn't counted twice.
 * The camera starts only on a tap (`startCamera` when the screen opened the scanner on one) and stops
 * whenever the screen loses focus: tabs and stack screens stay mounted, so it would otherwise keep
 * running in the background and fight another screen's preview.
 */
export function Scanner({ onScan, height = 220, label = 'Scan code', startCamera = false }: { onScan: (code: string) => void | Promise<void>; height?: number; label?: string; startCamera?: boolean }) {
  const focused = useIsFocused();
  const [perm, requestPerm] = useCameraPermissions();
  const [camera, setCamera] = useState(startCamera);
  useEffect(() => { if (!focused) setCamera(false); }, [focused]);
  const live = camera && focused;
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
      {live && perm?.granted && (
        <View style={{ height, borderRadius: R.lg, overflow: 'hidden', backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={(r) => void handle(r.data)}
            barcodeScannerSettings={{ barcodeTypes: ['code128', 'datamatrix', 'qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code39'] }} />
          <View pointerEvents="none" style={{ position: 'absolute', left: '12%', right: '12%', top: '30%', bottom: '30%', borderWidth: 2, borderColor: C.aqua, borderRadius: 12 }} />
        </View>
      )}
      {live && perm && !perm.granted && <Button title="Allow camera to scan" onPress={() => void requestPerm()} />}
      {!live && <Button title="Start camera" icon={<Ionicons name="camera-outline" size={18} color={C.white} />} onPress={() => setCamera(true)} />}
      <Row>
        <TextInput accessibilityLabel={label} value={typed} onChangeText={setTyped} placeholder="Type or scan a code" autoCapitalize="characters" autoCorrect={false}
          onSubmitEditing={() => { void handle(typed); setTyped(''); }} returnKeyType="go" blurOnSubmit={false} style={[s.input, { flex: 1 }]} placeholderTextColor="#9aa5b1" />
        {live && (
          <Pressable accessibilityRole="button" accessibilityLabel="Stop camera" onPress={() => setCamera(false)} style={{ padding: 10, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.white }}>
            <Ionicons name="videocam-off-outline" size={22} color={C.navy} />
          </Pressable>
        )}
      </Row>
      {!live && <Text style={{ fontSize: 12, color: C.muted }}>Camera off. Type a code and press Go, or use a Bluetooth scanner.</Text>}
    </View>
  );
}
