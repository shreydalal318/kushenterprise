import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_URL } from '@/lib/config';
import { loadToken } from '@/lib/token';

const KINDS = {
  xlsx: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', UTI: 'org.openxmlformats.spreadsheetml.sheet' },
  xml: { mimeType: 'application/xml', UTI: 'public.xml' },
  json: { mimeType: 'application/json', UTI: 'public.json' },
  pdf: { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' },
} as const;
export type FileKind = keyof typeof KINDS;

/** Plain words for a refused download ("response has status: 403" means nothing to most people). */
function plain(status: number, body = ''): Error {
  if (status === 401) return new Error('Your sign-in has ended. Sign out and sign in again.');
  if (status === 403) return new Error('You don’t have permission for this file.');
  if (status === 404) return new Error('That file wasn’t found.');
  if (status >= 500) return new Error('The server had a problem making the file. Please try again.');
  return new Error(body.trim().slice(0, 200) || 'The server could not make this file for these dates.');
}

/**
 * Download an Excel / Tally XML / JSON file from the website's download links with the app's token
 * (the same way lib/documents opens PDFs) and open the share sheet: WhatsApp, email, Drive, Files.
 * On the web preview the browser downloads it.
 */
export async function shareFile(path: string, filename: string, kind: FileKind) {
  const token = await loadToken();
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  const name = filename.replace(/[^\w.-]+/g, '-');
  if (Platform.OS === 'web') {
    const res = await fetch(url, { headers, credentials: 'include' });
    if (!res.ok) throw plain(res.status, await res.text().catch(() => ''));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = name;
    a.click();
    return;
  }
  let file: File;
  try {
    file = await File.downloadFileAsync(url, new File(Paths.cache, name), { headers, idempotent: true });
  } catch (e) {
    const status = Number(/status:?\s*(\d{3})/.exec(e instanceof Error ? e.message : String(e))?.[1]);
    throw status ? plain(status) : e;
  }
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: KINDS[kind].mimeType, dialogTitle: filename, UTI: KINDS[kind].UTI });
}
