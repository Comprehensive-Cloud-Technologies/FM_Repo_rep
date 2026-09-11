/**
 * Deep-link target for asset QR codes.
 *
 * The QR encodes  https://htm.catalystservices.eco/asset-scan/<assetId>
 * When the app is installed (verified Android App Link), Android opens the app
 * here instead of the browser; we forward to the asset-details screen — the same
 * destination as the in-app scanner. When the app is NOT installed, the same URL
 * opens in the browser and the web page handles it.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function AssetScanDeepLink() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  if (!assetId) return <Redirect href="/(tabs)/home" />;
  return (
    <Redirect
      href={{ pathname: '/asset-details', params: { assetId: String(assetId), fromQR: '1' } }}
    />
  );
}
