/**
 * add-asset.tsx – Manual Asset Registration (Engineer role)
 * Engineer can add assets to any company without QR scanning.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Alert, TextInput, KeyboardAvoidingView, Platform,
  Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, Spacing, Radius } from '../utils/theme';
import {
  fetchAllCompaniesForEngineer,
  fetchDepartmentsByCompany,
  addAssetManually,
  uploadQueryImage,
  getToken,
} from '../utils/api';

const MAINTENANCE_OPTIONS = [
  { key: 'warranty', label: 'Warranty' },
  { key: 'amc',      label: 'AMC' },
  { key: 'cmc',      label: 'CMC' },
  { key: 'inHouse',  label: 'In House' },
  { key: 'catalyst', label: 'Catalyst' },
];

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.label}>{label}{required ? <Text style={{ color: '#dc2626' }}> *</Text> : null}</Text>
      {children}
    </View>
  );
}

export default function AddAssetScreen() {
  const { theme } = useTheme();

  const [companies, setCompanies]           = useState<Array<{id: number; companyName: string}>>([]);
  const [departments, setDepartments]       = useState<Array<{id: number; name: string}>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [companySearch, setCompanySearch]   = useState('');
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const [showDeptPicker, setShowDeptPicker] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingDepts, setLoadingDepts]     = useState(false);

  // Equipment Details
  const [assetName,        setAssetName]        = useState('');
  const [make,             setMake]             = useState('');
  const [manufacturerCo,   setManufacturerCo]   = useState('');
  const [model,            setModel]            = useState('');
  const [serialNo,         setSerialNo]         = useState('');
  const [accessories,      setAccessories]      = useState('');
  const [dealer,           setDealer]           = useState('');
  const [mfgYear,          setMfgYear]          = useState('');
  const [installationDate, setInstallationDate] = useState('');

  // Invoice / Purchase
  const [invoiceNo,    setInvoiceNo]    = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');

  // Maintenance
  const [maintenance, setMaintenance] = useState<string[]>([]);
  const [rber,        setRber]        = useState(false);
  const [remarks,     setRemarks]     = useState('');

  // Location
  const [building, setBuilding] = useState('');
  const [floor,    setFloor]    = useState('');
  const [room,     setRoom]     = useState('');

  const [images,     setImages]     = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const inp = (extra?: object) => [s.input, {
    backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary, ...(extra || {}),
  }];

  useEffect(() => {
    fetchAllCompaniesForEngineer()
      .then(setCompanies)
      .catch(() => Alert.alert('Error', 'Could not load companies'))
      .finally(() => setLoadingCompanies(false));
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) { setDepartments([]); return; }
    setLoadingDepts(true);
    fetchDepartmentsByCompany(selectedCompanyId)
      .then(setDepartments)
      .catch(() => {})
      .finally(() => setLoadingDepts(false));
  }, [selectedCompanyId]);

  const toggleMaintenance = (key: string) => {
    setMaintenance(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);
  const selectedDept    = departments.find(d => d.id === selectedDeptId);
  const filteredCompanies = companies.filter(c =>
    c.companyName.toLowerCase().includes(companySearch.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!assetName.trim()) { Alert.alert('Required', 'Equipment Name is required.'); return; }
    if (!selectedCompanyId) { Alert.alert('Required', 'Please select a company.'); return; }
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated.');
      let imageUrls: string[] = [];
      if (images.length > 0) {
        const results = await Promise.allSettled(images.map(uri => uploadQueryImage(token, uri)));
        imageUrls = results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
          .map(r => r.value);
      }
      const result = await addAssetManually(token, {
        companyId: selectedCompanyId,
        departmentId: selectedDeptId ?? undefined,
        assetName: assetName.trim(),
        assetType: 'healthcare',
        building: building.trim() || undefined,
        floor: floor.trim() || undefined,
        room: room.trim() || undefined,
        metadata: {
          make: make.trim() || undefined,
          manufacturerCompany: manufacturerCo.trim() || undefined,
          model: model.trim() || undefined,
          serialNo: serialNo.trim() || undefined,
          accessories: accessories.trim() || undefined,
          dealer: dealer.trim() || undefined,
          mfgYear: mfgYear.trim() || undefined,
          installationDate: installationDate.trim() || undefined,
          invoiceNo: invoiceNo.trim() || undefined,
          purchaseDate: purchaseDate.trim() || undefined,
          purchaseCost: purchaseCost.trim() || undefined,
          maintenance: maintenance.length ? maintenance : undefined,
          rber: rber || undefined,
          remarks: remarks.trim() || undefined,
          hcImages: imageUrls.length ? imageUrls : undefined,
        },
      });
      Alert.alert(
        'Asset Registered',
        `"${result.assetName}" has been registered successfully.\nID: ${result.assetUniqueId}\n\nStatus: Pending Verification`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('Registration Failed', e.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const Checkbox = ({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) => (
    <TouchableOpacity style={s.checkRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={[s.checkBox, checked && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
        {checked && <MaterialCommunityIcons name="check" size={13} color="#fff" />}
      </View>
      <Text style={[s.checkLabel, { color: theme.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );

  const PickerModal = ({
    visible, title, items, onSelect, onClose, search, setSearch,
  }: {
    visible: boolean; title: string;
    items: Array<{id: number; label: string}>;
    onSelect: (id: number, label: string) => void;
    onClose: () => void;
    search?: string; setSearch?: (v: string) => void;
  }) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: theme.textPrimary }}>{title}</Text>
            <TouchableOpacity onPress={onClose}><MaterialCommunityIcons name="close" size={22} color={theme.textMuted} /></TouchableOpacity>
          </View>
          {setSearch && (
            <View style={{ padding: 12 }}>
              <TextInput
                style={[s.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.textPrimary }]}
                placeholder="Search..." placeholderTextColor={theme.textMuted}
                value={search} onChangeText={setSearch}
              />
            </View>
          )}
          <ScrollView>
            {items.map(item => (
              <TouchableOpacity key={item.id}
                style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}
                onPress={() => { onSelect(item.id, item.label); onClose(); }}>
                <Text style={{ color: theme.textPrimary, fontSize: 14 }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[s.headerTitle, { color: theme.textPrimary }]}>Register Equipment</Text>
            <Text style={[s.headerSub, { color: theme.textMuted }]}>Asset will be pending admin verification</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.banner}>
            <MaterialCommunityIcons name="shield-alert-outline" size={22} color="#1d4ed8" />
            <Text style={[s.bannerText, { color: '#1e3a8a' }]}>Assets registered here will be <Text style={{ fontWeight: '700' }}>Unverified</Text> until reviewed by an admin.</Text>
          </View>

          {/* ── COMPANY & DEPARTMENT ──────────── */}
          <SectionHeader title="Company & Department" />

          <Field label="Company" required>
            {loadingCompanies ? <ActivityIndicator color={theme.primary} /> : (
              <TouchableOpacity
                style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                onPress={() => setShowCompanyPicker(true)}>
                <Text style={{ color: selectedCompany ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                  {selectedCompany?.companyName ?? 'Select Company'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </Field>

          <Field label="Department">
            <TouchableOpacity
              style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: selectedCompanyId ? 1 : 0.5 }]}
              disabled={!selectedCompanyId}
              onPress={() => setShowDeptPicker(true)}>
              <Text style={{ color: selectedDept ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                {loadingDepts ? 'Loading...' : (selectedDept?.name ?? '— Select Department —')}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </Field>

          {/* ── EQUIPMENT DETAILS ──────────────── */}
          <SectionHeader title="Equipment Details" />

          <Field label="Equipment Name" required>
            <TextInput style={inp()} placeholder="e.g. Ultrasound Machine" placeholderTextColor={theme.textMuted}
              value={assetName} onChangeText={setAssetName} />
          </Field>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Make / Manufacturer">
                <TextInput style={inp()} placeholder="e.g. Philips" placeholderTextColor={theme.textMuted}
                  value={make} onChangeText={setMake} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Manufacturer (Company)">
                <TextInput style={inp()} placeholder="e.g. Philips Healthcare" placeholderTextColor={theme.textMuted}
                  value={manufacturerCo} onChangeText={setManufacturerCo} />
              </Field>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Model">
                <TextInput style={inp()} placeholder="e.g. EPIQ 7G" placeholderTextColor={theme.textMuted}
                  value={model} onChangeText={setModel} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Serial No.">
                <TextInput style={inp()} placeholder="Serial number" placeholderTextColor={theme.textMuted}
                  value={serialNo} onChangeText={setSerialNo} />
              </Field>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Accessories Included">
                <TextInput style={inp()} placeholder="e.g. Transducer, cables" placeholderTextColor={theme.textMuted}
                  value={accessories} onChangeText={setAccessories} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Dealer / Distributor">
                <TextInput style={inp()} placeholder="Supplier name" placeholderTextColor={theme.textMuted}
                  value={dealer} onChangeText={setDealer} />
              </Field>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Manufacturing Year">
                <TextInput style={inp()} placeholder="e.g. 2022" keyboardType="numeric"
                  placeholderTextColor={theme.textMuted} value={mfgYear} onChangeText={setMfgYear} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Installation Date">
                <TextInput style={inp()} placeholder="DD/MM/YYYY" placeholderTextColor={theme.textMuted}
                  value={installationDate} onChangeText={setInstallationDate} />
              </Field>
            </View>
          </View>

          {/* ── INVOICE / PURCHASE ─────────────── */}
          <SectionHeader title="Invoice No. / Purchase Details" />
          <Field label="Invoice No.">
            <TextInput style={inp()} placeholder="INV-XXXX" placeholderTextColor={theme.textMuted}
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
                <TextInput style={inp()} placeholder="e.g. 500000" keyboardType="numeric"
                  placeholderTextColor={theme.textMuted} value={purchaseCost} onChangeText={setPurchaseCost} />
              </Field>
            </View>
          </View>

          {/* ── MAINTENANCE UNDER ──────────────── */}
          <SectionHeader title="Maintenance Under" />
          <View style={s.checkGrid}>
            {MAINTENANCE_OPTIONS.map(opt => (
              <Checkbox key={opt.key} checked={maintenance.includes(opt.key)} label={opt.label} onToggle={() => toggleMaintenance(opt.key)} />
            ))}
            <Checkbox checked={rber} label="RBER" onToggle={() => setRber(v => !v)} />
          </View>
          <Field label="Remarks">
            <TextInput style={inp({ minHeight: 80, textAlignVertical: 'top', paddingTop: 10 })}
              placeholder="Additional notes..." placeholderTextColor={theme.textMuted}
              value={remarks} onChangeText={setRemarks} multiline numberOfLines={3} />
          </Field>

          {/* ── LOCATION & DEPARTMENT ─────────── */}
          <SectionHeader title="Location" />
          <Field label="Building">
            <TextInput style={inp()} placeholder="e.g. Block A" placeholderTextColor={theme.textMuted}
              value={building} onChangeText={setBuilding} />
          </Field>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Floor">
                <TextInput style={inp()} placeholder="e.g. 2nd Floor" placeholderTextColor={theme.textMuted}
                  value={floor} onChangeText={setFloor} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Room / Area">
                <TextInput style={inp()} placeholder="e.g. Radiology Room" placeholderTextColor={theme.textMuted}
                  value={room} onChangeText={setRoom} />
              </Field>
            </View>
          </View>

          {/* ── EQUIPMENT PHOTOS ──────────────── */}
          <SectionHeader title="Equipment Photos (up to 5)" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {images.map((uri, i) => (
              <View key={i} style={{ position: 'relative' }}>
                <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: Radius.md }} />
                <TouchableOpacity
                  style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#fff', borderRadius: 10 }}
                  onPress={() => setImages(p => p.filter((_, j) => j !== i))}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
            {images.length < 5 && (
              <>
                <TouchableOpacity style={[s.imgBtn, { borderColor: theme.border }]}
                  onPress={async () => {
                    const { status } = await ImagePicker.requestCameraPermissionsAsync();
                    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access.'); return; }
                    const r = await ImagePicker.launchCameraAsync({ quality: 0.75 });
                    if (!r.canceled && r.assets[0]) setImages(p => [...p, r.assets[0].uri].slice(0, 5));
                  }}>
                  <MaterialCommunityIcons name="camera" size={24} color={theme.primary} />
                  <Text style={[s.imgBtnLabel, { color: theme.textMuted }]}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.imgBtn, { borderColor: theme.border }]}
                  onPress={async () => {
                    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
                    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.75 });
                    if (!r.canceled) setImages(p => [...p, ...r.assets.map((a: any) => a.uri)].slice(0, 5));
                  }}>
                  <MaterialCommunityIcons name="image-multiple-outline" size={24} color={theme.textMuted} />
                  <Text style={[s.imgBtnLabel, { color: theme.textMuted }]}>Gallery</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={[s.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!assetName.trim() || !selectedCompanyId || submitting}
            style={[s.btn, { backgroundColor: (assetName.trim() && selectedCompanyId) ? theme.primary : '#cbd5e1', opacity: submitting ? 0.75 : 1 }]}>
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <>
                <MaterialCommunityIcons name="check-circle-outline" size={20} color="#fff" />
                <Text style={s.btnText}>Register Equipment</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <PickerModal
        visible={showCompanyPicker}
        title="Select Company"
        items={filteredCompanies.map(c => ({ id: c.id, label: c.companyName }))}
        search={companySearch}
        setSearch={setCompanySearch}
        onSelect={(id) => { setSelectedCompanyId(id); setSelectedDeptId(null); }}
        onClose={() => setShowCompanyPicker(false)}
      />
      <PickerModal
        visible={showDeptPicker}
        title="Select Department"
        items={departments.map(d => ({ id: d.id, label: d.name }))}
        onSelect={(id) => setSelectedDeptId(id)}
        onClose={() => setShowDeptPicker(false)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle:   { fontSize: 17, fontWeight: '700' },
  headerSub:     { fontSize: 11, marginTop: 1 },
  scroll:        { padding: Spacing.md, gap: 14, paddingBottom: 20 },
  banner:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#dbeafe', borderColor: '#93c5fd', borderWidth: 1, borderRadius: Radius.lg, padding: 14, marginBottom: 4 },
  bannerText:    { flex: 1, fontSize: 12, lineHeight: 17 },
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
