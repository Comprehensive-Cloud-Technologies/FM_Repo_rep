/**
 * add-asset.tsx – Manual Asset Registration (Engineer role)
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
import * as DocumentPicker from 'expo-document-picker';
import { useTheme, Spacing, Radius } from '../utils/theme';
import {
  fetchAllCompaniesForEngineer,
  fetchDepartmentsByCompany,
  addAssetManually,
  uploadQueryImage,
  getToken,
} from '../utils/api';

// ─── Date Picker ──────────────────────────────────────────────────────────────
function DatePickerField({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { theme } = useTheme();
  const [show, setShow] = useState(false);
  const [d, setD] = useState('');
  const [m, setM] = useState('');
  const [y, setY] = useState('');

  const open = () => {
    const parts = value.split('/');
    setD(parts[0] || '');
    setM(parts[1] || '');
    setY(parts[2] || '');
    setShow(true);
  };

  const confirm = () => {
    if (d && m && y) onChange(`${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`);
    setShow(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[ss.input, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        onPress={open}>
        <Text style={{ color: value ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>{value || placeholder}</Text>
        <MaterialCommunityIcons name="calendar" size={18} color={theme.textMuted} />
      </TouchableOpacity>
      <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: theme.textPrimary, marginBottom: 16 }}>Select Date</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              {([['Day', d, setD, 'DD', 2], ['Month', m, setM, 'MM', 2], ['Year', y, setY, 'YYYY', 4]] as const).map(([lbl, val, setter, ph, mx]) => (
                <View key={lbl} style={{ flex: lbl === 'Year' ? 2 : 1 }}>
                  <Text style={[ss.label, { color: theme.textMuted, marginBottom: 4 }]}>{lbl}</Text>
                  <TextInput
                    style={[ss.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.textPrimary }]}
                    value={val} onChangeText={v => setter(v.replace(/\D/g, '').slice(0, mx))}
                    keyboardType="numeric" placeholder={ph} placeholderTextColor={theme.textMuted} maxLength={mx} />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={{ flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: 'center' }} onPress={() => setShow(false)}>
                <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 2, padding: 13, borderRadius: 12, backgroundColor: theme.primary, alignItems: 'center' }} onPress={confirm}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Reusable UI ──────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <View style={ss.sectionHeader}>
      <Text style={ss.sectionTitle}>{title}</Text>
    </View>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={ss.fieldGroup}>
      <Text style={ss.label}>{label}{required ? <Text style={{ color: '#dc2626' }}> *</Text> : null}</Text>
      {children}
    </View>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type DateRange = { enabled: boolean; startDate: string; endDate: string };
const emptyRange = (): DateRange => ({ enabled: false, startDate: '', endDate: '' });

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AddAssetScreen() {
  const { theme } = useTheme();

  const [companies, setCompanies]           = useState<Array<{ id: number; companyName: string }>>([]);
  const [departments, setDepartments]       = useState<Array<{ id: number; name: string }>>([]);
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
  const [model,            setModel]            = useState('');
  const [serialNo,         setSerialNo]         = useState('');
  const [accessories,      setAccessories]      = useState('');
  const [dealer,           setDealer]           = useState('');
  const [mfgYear,          setMfgYear]          = useState('');
  const [installationDate, setInstallationDate] = useState('');

  // Invoice / Purchase
  const [invoiceNo,     setInvoiceNo]     = useState('');
  const [purchaseDate,  setPurchaseDate]  = useState('');
  const [purchaseCost,  setPurchaseCost]  = useState('');
  const [invoiceImages, setInvoiceImages] = useState<string[]>([]);

  // Maintenance
  const [warranty, setWarranty] = useState<DateRange>(emptyRange());
  const [amc,      setAmc]      = useState<DateRange>(emptyRange());
  const [cmc,      setCmc]      = useState<DateRange>(emptyRange());
  const [inHouse,  setInHouse]  = useState(false);
  const [catalyst, setCatalyst] = useState(false);
  const [rber,     setRber]     = useState(false);
  const [remarks,  setRemarks]  = useState('');

  // Location
  const [building, setBuilding] = useState('');
  const [floor,    setFloor]    = useState('');
  const [room,     setRoom]     = useState('');

  const [images,     setImages]     = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const inp = (extra?: object) => [ss.input, {
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

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);
  const selectedDept    = departments.find(d => d.id === selectedDeptId);
  const filteredCompanies = companies.filter(c =>
    c.companyName.toLowerCase().includes(companySearch.toLowerCase())
  );

  const pickInvoiceImage = async (fromCamera: boolean) => {
    if (invoiceImages.length >= 3) return;
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access.'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!r.canceled && r.assets[0]) setInvoiceImages(p => [...p, r.assets[0].uri].slice(0, 3));
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.8 });
      if (!r.canceled) setInvoiceImages(p => [...p, ...r.assets.map((a: any) => a.uri)].slice(0, 3));
    }
  };

  const handleSubmit = async () => {
    if (!assetName.trim()) { Alert.alert('Required', 'Equipment Name is required.'); return; }
    if (!selectedCompanyId) { Alert.alert('Required', 'Please select a company.'); return; }
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated.');

      const uploadAll = async (uris: string[]) => {
        if (!uris.length) return [];
        const results = await Promise.allSettled(uris.map(uri => uploadQueryImage(token, uri)));
        return results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
          .map(r => r.value);
      };

      const [imageUrls, invoiceUrls] = await Promise.all([
        uploadAll(images),
        uploadAll(invoiceImages),
      ]);

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
          model: model.trim() || undefined,
          serialNo: serialNo.trim() || undefined,
          accessories: accessories.trim() || undefined,
          dealer: dealer.trim() || undefined,
          mfgYear: mfgYear.trim() || undefined,
          installationDate: installationDate || undefined,
          invoiceNo: invoiceNo.trim() || undefined,
          purchaseDate: purchaseDate || undefined,
          purchaseCost: purchaseCost.trim() || undefined,
          warranty: warranty.enabled ? warranty : undefined,
          amc: amc.enabled ? amc : undefined,
          cmc: cmc.enabled ? cmc : undefined,
          inHouse: inHouse || undefined,
          catalyst: catalyst || undefined,
          rber: rber || undefined,
          remarks: remarks.trim() || undefined,
          hcImages: imageUrls.length ? imageUrls : undefined,
          invoiceImages: invoiceUrls.length ? invoiceUrls : undefined,
        },
      });
      Alert.alert(
        'Asset Registered',
        `"${result.assetName}" registered.\nID: ${result.assetUniqueId}\n\nStatus: Pending Verification`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('Registration Failed', e.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const Checkbox = ({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) => (
    <TouchableOpacity style={ss.checkRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={[ss.checkBox, checked && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
        {checked && <MaterialCommunityIcons name="check" size={13} color="#fff" />}
      </View>
      <Text style={[ss.checkLabel, { color: theme.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );

  const MaintenanceRow = ({
    label, range, setRange,
  }: { label: string; range: DateRange; setRange: (v: DateRange) => void }) => (
    <View style={{ marginBottom: 10 }}>
      <Checkbox
        checked={range.enabled}
        label={label}
        onToggle={() => setRange({ ...range, enabled: !range.enabled })}
      />
      {range.enabled && (
        <View style={{ marginLeft: 28, marginTop: 8, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[ss.label, { color: theme.textMuted, marginBottom: 4 }]}>Start Date</Text>
              <DatePickerField value={range.startDate} onChange={v => setRange({ ...range, startDate: v })} placeholder="DD/MM/YYYY" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ss.label, { color: theme.textMuted, marginBottom: 4 }]}>End Date</Text>
              <DatePickerField value={range.endDate} onChange={v => setRange({ ...range, endDate: v })} placeholder="DD/MM/YYYY" />
            </View>
          </View>
        </View>
      )}
    </View>
  );

  const PickerModal = ({
    visible, title, items, onSelect, onClose, search, setSearch,
  }: {
    visible: boolean; title: string;
    items: Array<{ id: number; label: string }>;
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
                style={[ss.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.textPrimary }]}
                placeholder="Search..." placeholderTextColor={theme.textMuted}
                value={search} onChangeText={setSearch} />
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

  const PhotoStrip = ({
    photos, onRemove, onCamera, onGallery, max, label,
  }: { photos: string[]; onRemove: (i: number) => void; onCamera: () => void; onGallery: () => void; max: number; label: string }) => (
    <View>
      <Text style={[ss.label, { color: theme.textMuted, marginBottom: 6 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {photos.map((uri, i) => (
          <View key={i} style={{ position: 'relative' }}>
            <Image source={{ uri }} style={{ width: 75, height: 75, borderRadius: Radius.md }} />
            <TouchableOpacity
              style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#fff', borderRadius: 10 }}
              onPress={() => onRemove(i)}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#dc2626" />
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < max && (
          <>
            <TouchableOpacity style={[ss.imgBtn, { borderColor: theme.border }]} onPress={onCamera}>
              <MaterialCommunityIcons name="camera" size={22} color={theme.primary} />
              <Text style={[ss.imgBtnLabel, { color: theme.textMuted }]}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ss.imgBtn, { borderColor: theme.border }]} onPress={onGallery}>
              <MaterialCommunityIcons name="image-multiple-outline" size={22} color={theme.textMuted} />
              <Text style={[ss.imgBtnLabel, { color: theme.textMuted }]}>Gallery</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[ss.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ── Header ── */}
        <View style={[ss.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[ss.headerTitle, { color: theme.textPrimary }]}>Register Equipment</Text>
            <Text style={[ss.headerSub, { color: theme.textMuted }]}>Asset will be pending admin verification</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={ss.scroll} keyboardShouldPersistTaps="handled">
          <View style={ss.banner}>
            <MaterialCommunityIcons name="shield-alert-outline" size={22} color="#1d4ed8" />
            <Text style={[ss.bannerText, { color: '#1e3a8a' }]}>Assets registered here will be <Text style={{ fontWeight: '700' }}>Unverified</Text> until reviewed by an admin.</Text>
          </View>

          {/* ── COMPANY ──────────────────────────────────── */}
          <SectionHeader title="Company" />
          <Field label="Company" required>
            {loadingCompanies ? <ActivityIndicator color={theme.primary} /> : (
              <TouchableOpacity
                style={[ss.input, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                onPress={() => setShowCompanyPicker(true)}>
                <Text style={{ color: selectedCompany ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                  {selectedCompany?.companyName ?? 'Select Company'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </Field>

          {/* ── EQUIPMENT DETAILS ────────────────────────── */}
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
              <Field label="Model">
                <TextInput style={inp()} placeholder="e.g. EPIQ 7G" placeholderTextColor={theme.textMuted}
                  value={model} onChangeText={setModel} />
              </Field>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Serial No.">
                <TextInput style={inp()} placeholder="Serial number" placeholderTextColor={theme.textMuted}
                  value={serialNo} onChangeText={setSerialNo} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Accessories Included">
                <TextInput style={inp()} placeholder="e.g. Transducer" placeholderTextColor={theme.textMuted}
                  value={accessories} onChangeText={setAccessories} />
              </Field>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Dealer / Distributor">
                <TextInput style={inp()} placeholder="Supplier name" placeholderTextColor={theme.textMuted}
                  value={dealer} onChangeText={setDealer} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Manufacturing Year">
                <TextInput style={inp()} placeholder="e.g. 2022" keyboardType="numeric"
                  placeholderTextColor={theme.textMuted} value={mfgYear} onChangeText={setMfgYear} />
              </Field>
            </View>
          </View>
          <Field label="Installation Date">
            <DatePickerField value={installationDate} onChange={setInstallationDate} placeholder="DD/MM/YYYY" />
          </Field>

          {/* ── INVOICE / PURCHASE ────────────────────────── */}
          <SectionHeader title="Invoice / Purchase Details" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Invoice No.">
                <TextInput style={inp()} placeholder="INV-XXXX" placeholderTextColor={theme.textMuted}
                  value={invoiceNo} onChangeText={setInvoiceNo} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Purchase Cost (₹)">
                <TextInput style={inp()} placeholder="e.g. 500000" keyboardType="numeric"
                  placeholderTextColor={theme.textMuted} value={purchaseCost} onChangeText={setPurchaseCost} />
              </Field>
            </View>
          </View>
          <Field label="Purchase Date">
            <DatePickerField value={purchaseDate} onChange={setPurchaseDate} placeholder="DD/MM/YYYY" />
          </Field>
          <PhotoStrip
            photos={invoiceImages}
            onRemove={i => setInvoiceImages(p => p.filter((_, j) => j !== i))}
            onCamera={async () => {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access.'); return; }
              const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
              if (!r.canceled && r.assets[0]) setInvoiceImages(p => [...p, r.assets[0].uri].slice(0, 3));
            }}
            onGallery={async () => {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
              const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.85 });
              if (!r.canceled) setInvoiceImages(p => [...p, ...r.assets.map((a: any) => a.uri)].slice(0, 3));
            }}
            max={3}
            label="Invoice Receipt Photo (up to 3)"
          />

          {/* ── MAINTENANCE UNDER ─────────────────────────── */}
          <SectionHeader title="Maintenance Under" />
          <MaintenanceRow label="Warranty" range={warranty} setRange={setWarranty} />
          <MaintenanceRow label="AMC (Annual Maintenance Contract)" range={amc} setRange={setAmc} />
          <MaintenanceRow label="CMC (Comprehensive Maintenance Contract)" range={cmc} setRange={setCmc} />
          <Checkbox checked={inHouse} label="In House" onToggle={() => setInHouse(v => !v)} />
          <View style={{ marginTop: 8 }}>
            <Checkbox checked={catalyst} label="Catalyst" onToggle={() => setCatalyst(v => !v)} />
          </View>
          <View style={{ marginTop: 10 }}>
            <Checkbox checked={rber} label="RBER (Recommended Beyond Economic Repair)" onToggle={() => setRber(v => !v)} />
          </View>
          <View style={{ marginTop: 14 }}>
            <Field label="Remarks">
              <TextInput style={inp({ minHeight: 80, textAlignVertical: 'top', paddingTop: 10 })}
                placeholder="Additional notes..." placeholderTextColor={theme.textMuted}
                value={remarks} onChangeText={setRemarks} multiline numberOfLines={3} />
            </Field>
          </View>

          {/* ── LOCATION ─────────────────────────────────── */}
          <SectionHeader title="Location" />
          <Field label="Department">
            <TouchableOpacity
              style={[ss.input, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: selectedCompanyId ? 1 : 0.5 }]}
              disabled={!selectedCompanyId}
              onPress={() => setShowDeptPicker(true)}>
              <Text style={{ color: selectedDept ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                {loadingDepts ? 'Loading...' : (selectedDept?.name ?? '— Select Department —')}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </Field>
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
                <TextInput style={inp()} placeholder="e.g. Radiology" placeholderTextColor={theme.textMuted}
                  value={room} onChangeText={setRoom} />
              </Field>
            </View>
          </View>

          {/* ── EQUIPMENT PHOTOS ─────────────────────────── */}
          <SectionHeader title="Equipment Photos" />
          <PhotoStrip
            photos={images}
            onRemove={i => setImages(p => p.filter((_, j) => j !== i))}
            onCamera={async () => {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access.'); return; }
              const r = await ImagePicker.launchCameraAsync({ quality: 0.75 });
              if (!r.canceled && r.assets[0]) setImages(p => [...p, r.assets[0].uri].slice(0, 5));
            }}
            onGallery={async () => {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
              const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.75 });
              if (!r.canceled) setImages(p => [...p, ...r.assets.map((a: any) => a.uri)].slice(0, 5));
            }}
            max={5}
            label="Equipment Photos (up to 5)"
          />

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={[ss.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!assetName.trim() || !selectedCompanyId || submitting}
            style={[ss.btn, { backgroundColor: (assetName.trim() && selectedCompanyId) ? theme.primary : '#cbd5e1', opacity: submitting ? 0.75 : 1 }]}>
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <>
                <MaterialCommunityIcons name="check-circle-outline" size={20} color="#fff" />
                <Text style={ss.btnText}>Register Equipment</Text>
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

const ss = StyleSheet.create({
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
  checkRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkBox:      { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  checkLabel:    { fontSize: 14 },
  footer:        { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, borderTopWidth: 1 },
  btn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: Radius.lg },
  btnText:       { color: '#fff', fontWeight: '700', fontSize: 16 },
  imgBtn:        { width: 75, height: 75, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  imgBtnLabel:   { fontSize: 10, marginTop: 4 },
});
