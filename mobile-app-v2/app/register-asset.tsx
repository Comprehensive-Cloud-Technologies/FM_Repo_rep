/**
 * register-asset.tsx – Healthcare Equipment Registration Form
 * Shown when a user scans an unlinked pre-generated QR code.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Alert, TextInput, KeyboardAvoidingView, Platform, SectionList, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, Spacing, Radius } from '../utils/theme';
import { registerAssetOnQr, getToken, uploadQueryImage } from '../utils/api';

const MAINTENANCE_OPTIONS = [
  { key: 'warranty',  label: 'Warranty' },
  { key: 'amc',       label: 'AMC' },
  { key: 'cmc',       label: 'CMC' },
  { key: 'inHouse',   label: 'In House' },
  { key: 'catalyst',  label: 'Catalyst' },
];

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={sStyles.sectionHeader}>
      <Text style={sStyles.sectionTitle}>{title}</Text>
    </View>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={sStyles.fieldGroup}>
      <Text style={sStyles.label}>{label}{required ? <Text style={{ color: '#dc2626' }}> *</Text> : null}</Text>
      {children}
    </View>
  );
}

export default function RegisterAssetScreen() {
  const { theme } = useTheme();
  const { qrUid, qrId } = useLocalSearchParams<{ qrUid: string; qrId: string }>();

  // Equipment Details
  const [assetName,           setAssetName]           = useState('');
  const [make,                setMake]                = useState('');
  const [manufacturerCompany, setManufacturerCompany] = useState('');
  const [model,               setModel]               = useState('');
  const [serialNo,            setSerialNo]            = useState('');
  const [accessories,         setAccessories]         = useState('');
  const [dealer,              setDealer]              = useState('');
  const [mfgYear,             setMfgYear]             = useState('');
  const [installationDate,    setInstallationDate]    = useState('');

  // Invoice / Purchase
  const [invoiceNo,     setInvoiceNo]     = useState('');
  const [purchaseDate,  setPurchaseDate]  = useState('');
  const [purchaseCost,  setPurchaseCost]  = useState('');

  // Maintenance
  const [maintenance, setMaintenance] = useState<string[]>([]);
  const [rber,        setRber]        = useState(false);
  const [remarks,     setRemarks]     = useState('');

  // Location
  const [building, setBuilding] = useState('');
  const [floor,    setFloor]    = useState('');
  const [room,     setRoom]     = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [hcImages, setHcImages] = useState<string[]>([]);

  const toggleMaintenance = (key: string) => {
    setMaintenance(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const inp = (extra?: object) => ([sStyles.input, {
    backgroundColor: theme.card,
    borderColor: theme.border,
    color: theme.textPrimary,
    ...(extra || {}),
  }]);

  const handleRegister = async () => {
    if (!assetName.trim()) {
      Alert.alert('Required', 'Equipment Name is required.');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('You must be logged in.');
      let imageUrls: string[] = [];
      if (hcImages.length > 0) {
        const results = await Promise.allSettled(hcImages.map(uri => uploadQueryImage(token, uri)));
        imageUrls = results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
          .map(r => r.value);
      }
      const result = await registerAssetOnQr(token, Number(qrId), {
        assetName: assetName.trim(),
        assetType: 'healthcare',
        location: building.trim() || undefined,
        floor: floor.trim() || undefined,
        room: room.trim() || undefined,
        make: make.trim() || undefined,
        manufacturerCompany: manufacturerCompany.trim() || undefined,
        model: model.trim() || undefined,
        serialNo: serialNo.trim() || undefined,
        accessories: accessories.trim() || undefined,
        dealer: dealer.trim() || undefined,
        mfgYear: mfgYear.trim() || undefined,
        installationDate: installationDate.trim() || undefined,
        invoiceNo: invoiceNo.trim() || undefined,
        purchaseDate: purchaseDate.trim() || undefined,
        purchaseCost: purchaseCost.trim() || undefined,
        maintenance,
        rber,
        remarks: remarks.trim() || undefined,
        hcImages: imageUrls.length ? imageUrls : undefined,
      });
      router.replace({
        pathname: '/asset-query',
        params: {
          assetId: String(result.assetId),
          assetName: result.assetName,
          barcodeStr: result.assetUniqueId,
        },
      });
    } catch (e: any) {
      Alert.alert('Registration Failed', e.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const Checkbox = ({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) => (
    <TouchableOpacity style={sStyles.checkRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={[sStyles.checkBox, checked && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
        {checked && <MaterialCommunityIcons name="check" size={13} color="#fff" />}
      </View>
      <Text style={[sStyles.checkLabel, { color: theme.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[sStyles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[sStyles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[sStyles.headerTitle, { color: theme.textPrimary }]}>Register Equipment</Text>
            <Text style={[sStyles.headerSub, { color: theme.textMuted }]}>{qrUid}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={sStyles.scroll} keyboardShouldPersistTaps="handled">
          {/* QR Banner */}
          <View style={sStyles.banner}>
            <MaterialCommunityIcons name="qrcode-scan" size={24} color="#d97706" />
            <Text style={sStyles.bannerText}>Fill in the details to register this healthcare equipment and link it to the scanned QR code.</Text>
          </View>

          {/* ── EQUIPMENT DETAILS ─────────────────── */}
          <SectionHeader title="Equipment Details" />

          <Field label="Equipment Name" required>
            <TextInput style={inp()} placeholder="e.g. ECG Machine, Ventilator…" placeholderTextColor={theme.textMuted}
              value={assetName} onChangeText={setAssetName} />
          </Field>
          <Field label="Make / Manufacturer">
            <TextInput style={inp()} placeholder="e.g. GE, Philips, Siemens…" placeholderTextColor={theme.textMuted}
              value={make} onChangeText={setMake} />
          </Field>
          <Field label="Manufacturer (Company)">
            <TextInput style={inp()} placeholder="Company name" placeholderTextColor={theme.textMuted}
              value={manufacturerCompany} onChangeText={setManufacturerCompany} />
          </Field>
          <Field label="Model">
            <TextInput style={inp()} placeholder="Model number / name" placeholderTextColor={theme.textMuted}
              value={model} onChangeText={setModel} />
          </Field>
          <Field label="Serial No.">
            <TextInput style={inp()} placeholder="Serial / chassis number" placeholderTextColor={theme.textMuted}
              value={serialNo} onChangeText={setSerialNo} />
          </Field>
          <Field label="Accessories Included">
            <TextInput style={inp()} placeholder="e.g. leads, probe, cables…" placeholderTextColor={theme.textMuted}
              value={accessories} onChangeText={setAccessories} />
          </Field>
          <Field label="Dealer / Distributor">
            <TextInput style={inp()} placeholder="Dealer or supplier name" placeholderTextColor={theme.textMuted}
              value={dealer} onChangeText={setDealer} />
          </Field>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Manufacturing Year">
                <TextInput style={inp()} placeholder="e.g. 2023" placeholderTextColor={theme.textMuted}
                  keyboardType="numeric" value={mfgYear} onChangeText={setMfgYear} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Installation Date">
                <TextInput style={inp()} placeholder="DD/MM/YYYY" placeholderTextColor={theme.textMuted}
                  value={installationDate} onChangeText={setInstallationDate} />
              </Field>
            </View>
          </View>

          {/* ── INVOICE / PURCHASE ────────────────── */}
          <SectionHeader title="Invoice No. / Purchase Details" />

          <Field label="Invoice No.">
            <TextInput style={inp()} placeholder="Invoice number" placeholderTextColor={theme.textMuted}
              value={invoiceNo} onChangeText={setInvoiceNo} />
          </Field>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Purchase Date">
                <TextInput style={inp()} placeholder="DD/MM/YYYY" placeholderTextColor={theme.textMuted}
                  value={purchaseDate} onChangeText={setPurchaseDate} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Purchase Cost (₹)">
                <TextInput style={inp()} placeholder="Amount" placeholderTextColor={theme.textMuted}
                  keyboardType="numeric" value={purchaseCost} onChangeText={setPurchaseCost} />
              </Field>
            </View>
          </View>

          {/* ── MAINTENANCE UNDER ─────────────────── */}
          <SectionHeader title="Maintenance Under" />

          <View style={sStyles.checkGrid}>
            {MAINTENANCE_OPTIONS.map(opt => (
              <Checkbox key={opt.key} checked={maintenance.includes(opt.key)} label={opt.label} onToggle={() => toggleMaintenance(opt.key)} />
            ))}
            <Checkbox checked={rber} label="RBER" onToggle={() => setRber(v => !v)} />
          </View>

          <Field label="Remarks">
            <TextInput style={inp({ minHeight: 80, textAlignVertical: 'top', paddingTop: 10 })}
              placeholder="Any additional notes…" placeholderTextColor={theme.textMuted}
              value={remarks} onChangeText={setRemarks} multiline numberOfLines={3} />
          </Field>

          {/* ── LOCATION ──────────────────────────── */}
          <SectionHeader title="Location" />

          <Field label="Building / Block">
            <TextInput style={inp()} placeholder="e.g. OPD Block, Block B…" placeholderTextColor={theme.textMuted}
              value={building} onChangeText={setBuilding} />
          </Field>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Floor">
                <TextInput style={inp()} placeholder="e.g. Ground, 1st…" placeholderTextColor={theme.textMuted}
                  value={floor} onChangeText={setFloor} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Room / Area">
                <TextInput style={inp()} placeholder="e.g. ICU, Ward 3…" placeholderTextColor={theme.textMuted}
                  value={room} onChangeText={setRoom} />
              </Field>
            </View>
          </View>

          {/* ── EQUIPMENT IMAGES ──────────────────── */}
          <SectionHeader title="Equipment Images (optional · 1–4)" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {hcImages.map((uri, i) => (
              <View key={i} style={{ position: 'relative' }}>
                <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: Radius.md }} />
                <TouchableOpacity
                  style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#fff', borderRadius: 10 }}
                  onPress={() => setHcImages(p => p.filter((_, j) => j !== i))}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
            {hcImages.length < 4 && (
              <>
                <TouchableOpacity
                  style={[sStyles.imgBtn, { borderColor: theme.border }]}
                  onPress={async () => {
                    const { status } = await ImagePicker.requestCameraPermissionsAsync();
                    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access in Settings.'); return; }
                    const r = await ImagePicker.launchCameraAsync({ quality: 0.75 });
                    if (!r.canceled && r.assets[0]) setHcImages(p => [...p, r.assets[0].uri]);
                  }}>
                  <MaterialCommunityIcons name="camera" size={24} color={theme.primary} />
                  <Text style={[sStyles.imgBtnLabel, { color: theme.textMuted }]}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sStyles.imgBtn, { borderColor: theme.border }]}
                  onPress={async () => {
                    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access in Settings.'); return; }
                    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.75 });
                    if (!r.canceled) setHcImages(p => [...p, ...r.assets.map((a: any) => a.uri)].slice(0, 4));
                  }}>
                  <MaterialCommunityIcons name="image-multiple-outline" size={24} color={theme.textMuted} />
                  <Text style={[sStyles.imgBtnLabel, { color: theme.textMuted }]}>Gallery</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* bottom padding for footer */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Footer Button */}
        <View style={[sStyles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity
            onPress={handleRegister}
            disabled={!assetName.trim() || submitting}
            style={[sStyles.btn, { backgroundColor: assetName.trim() ? theme.primary : '#cbd5e1', opacity: submitting ? 0.75 : 1 }]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <>
                <MaterialCommunityIcons name="check-circle-outline" size={20} color="#fff" />
                <Text style={sStyles.btnText}>Register Equipment</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const sStyles = StyleSheet.create({
  safe:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle:   { fontSize: 17, fontWeight: '700' },
  headerSub:     { fontSize: 11, fontFamily: 'monospace', marginTop: 1 },
  scroll:        { padding: Spacing.md, gap: 14, paddingBottom: 20 },
  banner:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fef3c7', borderColor: '#fcd34d', borderWidth: 1, borderRadius: Radius.lg, padding: 14, marginBottom: 4 },
  bannerText:    { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 },
  sectionHeader: { backgroundColor: '#1e3a8a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md, marginTop: 8 },
  sectionTitle:  { color: '#fff', fontWeight: '700', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  fieldGroup:    { gap: 5 },
  label:         { fontSize: 11, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  input:         { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  checkGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 4 },
  checkRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: '45%' },
  checkBox:      { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  checkLabel:    { fontSize: 14 },
  footer:        { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, borderTopWidth: 1 },
  btn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: Radius.lg },
  btnText:       { color: '#fff', fontWeight: '700', fontSize: 16 },
  imgBtn:        { width: 80, height: 80, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  imgBtnLabel:   { fontSize: 10, marginTop: 4 },
});
