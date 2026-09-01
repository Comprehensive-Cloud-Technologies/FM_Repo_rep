import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAssetByQR, fetchAssetByBarcode, fetchPreQrByUid } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import { useAuth } from '../context/AuthContext';
import { canRegisterAssets } from '../utils/permissions';

export default function QRScannerScreen() {
  const { theme } = useTheme();
  const { capabilities } = useAuth();
  const isEngineer = canRegisterAssets(capabilities);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet    = Math.min(width, height) >= 600;
  // Viewfinder: wider on tablets/landscape, taller on phones
  const vfWidth  = isTablet ? Math.min(width * 0.55, 520) : width * 0.84;
  const vfHeight = isTablet ? 160 : isLandscape ? 110 : 130;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!permission) {
    return <View style={[styles.safe, { backgroundColor: '#000' }]} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={styles.center}>
          <MaterialCommunityIcons name="camera-off" size={64} color={theme.textMuted} />
          <Text style={[styles.permText, { color: theme.textPrimary }]}>Camera Permission Required</Text>
          <Text style={[styles.permSub, { color: theme.textSecondary }]}>We need camera access to scan barcodes on your assets.</Text>
          <TouchableOpacity style={[styles.permBtn, { backgroundColor: theme.primary }]} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);

    try {
      const raw = data.trim();

      // 1. Pre-generated QR code (old "QR-" prefix OR new asset-ID format like CCT-MH-000001)
      //    Try the pre-QR lookup first for any barcode-shaped string, so both linked and
      //    unlinked QR codes are handled correctly before falling through to asset lookup.
      const barcodePattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/i;
      if (barcodePattern.test(raw)) {
        try {
          const qr = await fetchPreQrByUid(raw);
          if (!qr.assetId) {
            // Unlinked → let user register a new asset
            router.replace({ pathname: '/register-asset', params: { qrUid: raw, qrId: String(qr.id), companyName: qr.companyName ?? '' } });
          } else {
            // Linked → show the asset details page (PMS, calibration, warranty, etc.),
            // from where the user can also report a problem.
            router.replace({ pathname: '/asset-details', params: { assetId: String(qr.assetId), fromQR: '1' } });
          }
          return;
        } catch (preQrErr: any) {
          // Not a pre-generated QR code (404) → try as a direct asset barcode below
          if (preQrErr?.status !== 404) {
            const detail = preQrErr?.message || 'Could not reach the server. Check your connection.';
            Alert.alert('QR Lookup Failed', detail, [
              { text: 'Scan Again', onPress: () => setScanned(false) },
            ]);
            return;
          }
        }

        // Not in pre-QR table → try direct asset lookup by barcode (asset_unique_id)
        try {
          const asset = await fetchAssetByBarcode(raw) as any;
          router.replace({ pathname: '/asset-details', params: { assetId: String(asset.id), fromQR: '1' } });
          return;
        } catch {
          if (isEngineer) {
            Alert.alert(
              'Asset Not Found',
              'No asset matches this barcode. Would you like to register it as a new asset?',
              [
                { text: 'Register Asset', onPress: () => router.replace({ pathname: '/add-asset', params: { barcode: raw } }) },
                { text: 'Scan Again', style: 'cancel', onPress: () => setScanned(false) },
              ],
            );
          } else {
            Alert.alert('Not Found', 'Could not find an asset for this barcode.', [
              { text: 'Scan Again', onPress: () => setScanned(false) },
            ]);
          }
          return;
        }
      }

      // 2. Try numeric asset ID (legacy QR codes with URL)
      const numericId = raw.match(/\/asset-scan\/(\d+)/i)?.[1]
        ?? raw.match(/\/assets?\/(\d+)/i)?.[1]
        ?? raw.match(/[?&]assetId=(\d+)/i)?.[1]
        ?? (raw.match(/^(\d+)$/) ? raw : null);

      if (numericId) {
        router.replace({ pathname: '/asset-details', params: { assetId: numericId, fromQR: '1' } });
        return;
      }

      if (isEngineer) {
        Alert.alert(
          'Asset Not Found',
          'No asset matches this code. Would you like to register it as a new asset?',
          [
            { text: 'Register Asset', onPress: () => router.replace({ pathname: '/add-asset', params: { barcode: raw } }) },
            { text: 'Scan Again', style: 'cancel', onPress: () => setScanned(false) },
          ],
        );
      } else {
        Alert.alert('Not Found', 'Could not find an asset for this barcode.', [
          { text: 'Scan Again', onPress: () => setScanned(false) },
        ]);
      }
    } catch {
      Alert.alert('Not Found', 'Could not find an asset for this barcode.', [
        { text: 'Scan Again', onPress: () => setScanned(false) },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.scanWrap}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" onBarcodeScanned={scanned ? undefined : handleScan}>
        {/* Overlay */}
        <SafeAreaView style={styles.overlay} edges={['top']}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtnScan}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.scanTitle}>Scan Asset Barcode</Text>
        </SafeAreaView>

        {/* Viewfinder — responsive rectangle for barcodes */}
        <View style={[styles.viewfinder, {
          width: vfWidth,
          height: vfHeight,
          marginLeft: -vfWidth / 2,
          marginTop: isLandscape ? -(vfHeight / 2) : -(vfHeight / 2),
        }]}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        <View style={styles.bottomOverlay}>
          <Text style={styles.scanHint}>
            {loading ? 'Looking up asset…' : 'Point camera at the barcode on the asset label'}
          </Text>
          {scanned && !loading ? (
            <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
              <Text style={styles.rescanText}>Tap to Scan Again</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </CameraView>
    </View>
  );
}

const CORNER = 24;
const styles = StyleSheet.create({
  safe:        { flex: 1 },
  scanWrap:    { flex: 1, backgroundColor: '#000' },
  backBtn:     { margin: Spacing.lg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.lg },
  permText:    { ...Typography.h3, textAlign: 'center' },
  permSub:     { ...Typography.body, textAlign: 'center' },
  permBtn:     { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.md },
  permBtnText: { ...Typography.h4, color: '#fff' },
  overlay:     { padding: Spacing.lg, gap: Spacing.md },
  backBtnScan: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  scanTitle:   { ...Typography.h3, color: '#fff', textAlign: 'center' },
  // Viewfinder: position is controlled inline via dynamic margins
  viewfinder:  { position: 'absolute', top: '45%', left: '50%' },
  corner:      { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff', borderWidth: 3 },
  cornerTL:    { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR:    { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL:    { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR:    { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  bottomOverlay:{ position: 'absolute', bottom: 80, left: 0, right: 0, alignItems: 'center', gap: Spacing.md },
  scanHint:    { ...Typography.body, color: '#fff', textAlign: 'center', paddingHorizontal: Spacing.xl },
  rescanBtn:   { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  rescanText:  { ...Typography.label, color: '#fff' },
});
