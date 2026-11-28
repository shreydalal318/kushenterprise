import { WebView } from 'react-native-webview';
import { Loading } from './ui';

/**
 * The document page from the server, signed in with the app's token. Pinch to zoom; no scripts run
 * (the page has none, and the server's CSP blocks them anyway).
 */
export function DocView({ url, token, onError }: { url: string; token: string | null; onError: (message: string) => void }) {
  return (
    <WebView
      source={{ uri: url, headers: token ? { Authorization: `Bearer ${token}` } : {} }}
      style={{ flex: 1, backgroundColor: '#e9eef2' }}
      javaScriptEnabled={false}
      scalesPageToFit
      setBuiltInZoomControls
      setDisplayZoomControls={false}
      startInLoadingState
      renderLoading={() => <Loading />}
      onHttpError={(e) => onError(e.nativeEvent.statusCode === 404 ? 'This document was not found, or you can’t see it.' : 'Could not open the preview.')}
      onError={() => onError('Could not open the preview. Check the internet connection.')}
    />
  );
}
