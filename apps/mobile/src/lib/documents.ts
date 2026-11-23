import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_URL } from './config';
import { loadToken } from './token';

/**
 * Download an invoice / proforma / statement PDF with the app's token and open the share sheet
 * (WhatsApp, email, print, save to Files). On the web preview it opens in a new tab.
 */
export async function openPdf(path: string, filename: string) {
  const token = await loadToken();
  const url = `${API_URL}${path}`;
  if (Platform.OS === 'web') {
    const res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: 'include' });
    if (!res.ok) throw new Error('Could not download the PDF');
    window.open(URL.createObjectURL(await res.blob()), '_blank');
    return;
  }
  const file = await File.downloadFileAsync(url, new File(Paths.cache, filename.replace(/[^\w.-]+/g, '-')), { headers: token ? { authorization: `Bearer ${token}` } : {}, idempotent: true });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: filename, UTI: 'com.adobe.pdf' });
}
export const docPath = (kind: 'invoice' | 'proforma' | 'credit-note', id: string) => `/api/documents/${kind}/${id}`;
