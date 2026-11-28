import { createElement, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Loading } from './ui';

/** Web build (review preview only): fetch the page with the token and show it in an isolated frame (its own layout script runs; it can't reach the app). The phone uses doc-view.native.tsx. */
export function DocView({ url, token, onError }: { url: string; token: string | null; onError: (message: string) => void }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: 'include' })
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 404 ? 'This document was not found, or you can’t see it.' : 'Could not open the preview.'); return r.text(); })
      .then((t) => { if (live) setHtml(t); })
      .catch((e: Error) => { if (live) onError(e.message); });
    return () => { live = false; };
  }, [url, token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (html == null) return <Loading />;
  return <View style={{ flex: 1, backgroundColor: '#e9eef2' }}>{createElement('iframe', { srcDoc: html, sandbox: 'allow-scripts', title: 'Document preview', style: { flex: 1, width: '100%', height: '100%', border: 0, background: '#fff' } })}</View>;
}
