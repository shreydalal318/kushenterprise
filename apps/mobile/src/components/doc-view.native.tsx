import { WebView } from 'react-native-webview';
import { Loading } from './ui';

/**
 * The document page from the server, signed in with the app's token. Pinch to zoom. The page lays itself
 * out into A4 pages with its own small script; the server's CSP lets nothing else load or run.
 */
export function DocView({ url, token, onError }: { url: string; token: string | null; onError: (message: string) => void }) {
  return (
    <WebView
      source={{ uri: url, headers: token ? { Authorization: `Bearer ${token}` } : {} }}
      style={{ flex: 1, backgroundColor: '#e9eef2' }}
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
