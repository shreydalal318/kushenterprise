import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DocView } from '@/components/doc-view';
import { Alert, Button, Loading } from '@/components/ui';
import { API_URL } from '@/lib/config';
import { docPath, openPdf, type DocKind } from '@/lib/documents';
import { errorText } from '@/lib/format';
import { C } from '@/lib/theme';
import { loadToken } from '@/lib/token';

const NAME: Record<DocKind, string> = { invoice: 'Invoice', proforma: 'Proforma', 'credit-note': 'Credit note', 'purchase-order': 'Purchase order' };

/** See a tax invoice / proforma / credit note / purchase order as it prints, then share the PDF. */
export default function Preview() {
  const { kind, id, number, copies } = useLocalSearchParams<{ kind: DocKind; id: string; number?: string; copies?: string }>();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const [share, setShare] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  useEffect(() => { void loadToken().then(setToken); }, []);
  const path = `${docPath(kind, id)}${copies ? `?copies=${copies}` : ''}`;
  const url = `${API_URL}${docPath(kind, id)}?format=html${copies ? `&copies=${copies}` : ''}`;
  const title = `${NAME[kind] ?? 'Document'}${number ? ` ${number}` : ''}`;

  async function sharePdf() {
    setShare({ busy: true, error: null });
    try { await openPdf(path, `${(number ?? kind).replace(/\//g, '-')}.pdf`); setShare({ busy: false, error: null }); }
    catch (e) { const t = errorText(e); setShare({ busy: false, error: /pdf/i.test(t) ? t : `Could not share the PDF. ${t}` }); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <Stack.Screen options={{ title }} />
      {failed ? <View style={{ padding: 16, gap: 12 }}><Alert>{failed}</Alert><Button variant="secondary" title="Try again" onPress={() => setFailed(null)} /></View>
        : token === undefined ? <Loading />
          : <DocView url={url} token={token} onError={setFailed} />}
      <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>
        {!!share.error && <Alert>{share.error}</Alert>}
        <Button title="Share PDF (WhatsApp, print, save)" icon={<Ionicons name="share-outline" size={20} color={C.white} />} loading={share.busy} onPress={() => void sharePdf()} />
      </View>
    </View>
  );
}
