/**
 * register-asset.tsx – Healthcare Equipment Registration Form
 * Shown when a user scans an unlinked pre-generated QR code.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Alert, TextInput, KeyboardAvoidingView, Platform, Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme, Spacing, Radius } from '../utils/theme';
import {
  registerAssetOnQr,
  getToken,
  uploadQueryImage,
  fetchPreQrByUid,
  fetchDepartmentsByCompany,
  createDepartmentForCompany,
  fetchWorkingStatuses,
  fetchCompanyAssetStatuses,
  fetchLocationBuildingsByCompany,
  fetchLocationFloorsByBuilding,
  fetchLocationRoomsByFloor,
} from '../utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type DateRange = { enabled: boolean; startDate: string; endDate: string };
const emptyRange = (): DateRange => ({ enabled: false, startDate: '', endDate: '' });

type DocFile = { uri: string; name: string; mimeType?: string };

// ─── Calendar Date Picker ─────────────────────────────────────────────────────
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function DatePickerField({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { theme } = useTheme();
  const [show, setShow] = useState(false);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [selected, setSelected] = useState<Date | null>(null);

  const parseDate = (v: string): Date | null => {
    if (!v) return null;
    const parts = v.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map(Number);
    if (!d || !m || !y || y < 1900 || y > 2100) return null;
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  };

  const open = () => {
    const parsed = parseDate(value);
    const base = parsed ?? new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setSelected(parsed);
    setShow(true);
  };

  const confirm = () => {
    if (selected) {
      const d = String(selected.getDate()).padStart(2, '0');
      const m = String(selected.getMonth() + 1).padStart(2, '0');
      const y = selected.getFullYear();
      onChange(`${d}/${m}/${y}`);
    }
    setShow(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const today = new Date();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isSelected = (d: number) =>
    selected !== null &&
    selected.getDate() === d &&
    selected.getMonth() === viewMonth &&
    selected.getFullYear() === viewYear;

  const isToday = (d: number) =>
    today.getDate() === d &&
    today.getMonth() === viewMonth &&
    today.getFullYear() === viewYear;

  return (
    <>
      <TouchableOpacity
        style={[sStyles.input, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        onPress={open}
        activeOpacity={0.7}
      >
        <Text style={{ color: value ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
          {value || placeholder}
        </Text>
        <MaterialCommunityIcons name="calendar" size={18} color={theme.primary} />
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)} statusBarTranslucent>
        <View style={calStyles.overlay}>
          <TouchableOpacity style={calStyles.backdrop} activeOpacity={1} onPress={() => setShow(false)} />
          <View style={[calStyles.sheet, { backgroundColor: theme.surface }]}>
            {/* Header */}
            <View style={calStyles.titleRow}>
              <Text style={[calStyles.sheetTitle, { color: theme.textPrimary }]}>Select Date</Text>
              <TouchableOpacity onPress={() => setShow(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Month Navigation */}
            <View style={calStyles.monthNav}>
              <TouchableOpacity onPress={prevMonth} style={[calStyles.navBtn, { backgroundColor: theme.background }]} activeOpacity={0.7}>
                <MaterialCommunityIcons name="chevron-left" size={22} color={theme.textPrimary} />
              </TouchableOpacity>
              <Text style={[calStyles.monthLabel, { color: theme.textPrimary }]}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
              <TouchableOpacity onPress={nextMonth} style={[calStyles.navBtn, { backgroundColor: theme.background }]} activeOpacity={0.7}>
                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Day Labels */}
            <View style={calStyles.dayLabelRow}>
              {DAY_LABELS.map((d, i) => (
                <View key={i} style={calStyles.dayLabelCell}>
                  <Text style={[calStyles.dayLabelText, { color: i === 0 || i === 6 ? '#dc2626' : theme.textMuted }]}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={calStyles.grid}>
              {Array.from({ length: Math.ceil(cells.length / 7) }).map((_, row) => (
                <View key={row} style={calStyles.gridRow}>
                  {cells.slice(row * 7, row * 7 + 7).map((day, col) => (
                    <View key={col} style={calStyles.gridCell}>
                      {day ? (
                        <TouchableOpacity
                          onPress={() => setSelected(new Date(viewYear, viewMonth, day))}
                          activeOpacity={0.75}
                          style={[
                            calStyles.dayBtn,
                            isSelected(day) && { backgroundColor: theme.primary },
                            isToday(day) && !isSelected(day) && { borderWidth: 1.5, borderColor: theme.primary },
                          ]}
                        >
                          <Text style={[
                            calStyles.dayText,
                            isSelected(day) && { color: '#fff', fontWeight: '700' },
                            isToday(day) && !isSelected(day) && { color: theme.primary, fontWeight: '700' },
                            !isSelected(day) && !isToday(day) && { color: col === 0 || col === 6 ? '#dc2626' : theme.textPrimary },
                          ]}>
                            {day}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={calStyles.dayBtn} />
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </View>

            {/* Actions */}
            <View style={calStyles.actions}>
              <TouchableOpacity
                style={[calStyles.cancelBtn, { borderColor: theme.border }]}
                onPress={() => setShow(false)}
              >
                <Text style={{ color: theme.textMuted, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[calStyles.confirmBtn, { backgroundColor: selected ? theme.primary : '#cbd5e1' }]}
                onPress={confirm}
                disabled={!selected}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Document Attach Field ────────────────────────────────────────────────────
function DocumentAttachField({
  files, onAdd, onRemove, maxFiles = 3, label,
}: { files: DocFile[]; onAdd: (f: DocFile) => void; onRemove: (i: number) => void; maxFiles?: number; label: string }) {
  const { theme } = useTheme();

  const pickDoc = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        const a = result.assets[0];
        onAdd({ uri: a.uri, name: a.name ?? 'document', mimeType: a.mimeType ?? undefined });
      }
    } catch {
      Alert.alert('Error', 'Could not open document picker. Please try again.');
    }
  };

  const iconFor = (mime?: string): any => {
    if (mime === 'application/pdf') return 'file-pdf-box';
    if (mime?.startsWith('image/')) return 'file-image-outline';
    return 'file-document-outline';
  };

  const colorFor = (mime?: string) => {
    if (mime === 'application/pdf') return '#dc2626';
    if (mime?.startsWith('image/')) return '#0284c7';
    return theme.primary;
  };

  return (
    <View>
      <Text style={[sStyles.label, { color: theme.textMuted, marginBottom: 6 }]}>{label}</Text>

      {files.map((f, i) => (
        <View
          key={i}
          style={[docStyles.fileRow, { backgroundColor: theme.background, borderColor: theme.border }]}
        >
          <MaterialCommunityIcons name={iconFor(f.mimeType)} size={22} color={colorFor(f.mimeType)} />
          <Text
            style={[docStyles.fileName, { color: theme.textPrimary }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {f.name}
          </Text>
          <TouchableOpacity onPress={() => onRemove(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close-circle" size={20} color="#dc2626" />
          </TouchableOpacity>
        </View>
      ))}

      {files.length < maxFiles && (
        <TouchableOpacity
          onPress={pickDoc}
          activeOpacity={0.8}
          style={[docStyles.attachBtn, { borderColor: theme.primary, backgroundColor: `${theme.primary}0D` }]}
        >
          <MaterialCommunityIcons name="paperclip" size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 14 }}>Attach Document</Text>
            <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>PDF, JPG, JPEG, PNG</Text>
          </View>
          <MaterialCommunityIcons name="plus-circle-outline" size={20} color={theme.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Reusable UI ──────────────────────────────────────────────────────────────
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

function PickerModal({
  visible,
  title,
  items,
  onSelect,
  onClose,
  searchable = false,
  onAdd,
}: {
  visible: boolean;
  title: string;
  items: Array<{ id: number; label: string }>;
  onSelect: (id: number) => void;
  onClose: () => void;
  searchable?: boolean;
  onAdd?: (name: string) => Promise<void>;
}) {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  const filtered = searchable && query.trim()
    ? items.filter(it => it.label.toLowerCase().includes(query.toLowerCase()))
    : items;

  // Reset search when modal opens
  React.useEffect(() => { if (!visible) { setQuery(''); setShowAddForm(false); setAddName(''); } }, [visible]);

  const handleAdd = async () => {
    if (!addName.trim() || !onAdd) return;
    setAdding(true);
    try {
      await onAdd(addName.trim());
      setAddName('');
      setShowAddForm(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to add department');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 22 }}>
        <View style={{ backgroundColor: theme.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.border, maxHeight: '85%' }}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary }}>{title}</Text>
            <TouchableOpacity onPress={onClose}><MaterialCommunityIcons name="close" size={20} color={theme.textMuted} /></TouchableOpacity>
          </View>
          {searchable && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.background ?? '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10 }}>
                <MaterialCommunityIcons name="magnify" size={16} color={theme.textMuted} style={{ marginRight: 6 }} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search…"
                  placeholderTextColor={theme.textMuted}
                  style={{ flex: 1, fontSize: 13, color: theme.textPrimary, paddingVertical: 7 }}
                  autoFocus
                  clearButtonMode="while-editing"
                />
              </View>
            </View>
          )}
          {/* Add Department inline form */}
          {onAdd && showAddForm && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: '#f0fdf4' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a', marginBottom: 6 }}>NEW DEPARTMENT</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  value={addName}
                  onChangeText={setAddName}
                  placeholder="Department name…"
                  placeholderTextColor={theme.textMuted}
                  style={{ flex: 1, fontSize: 13, color: theme.textPrimary, borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff' }}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleAdd}
                />
                <TouchableOpacity onPress={handleAdd} disabled={!addName.trim() || adding}
                  style={{ backgroundColor: addName.trim() && !adding ? '#16a34a' : '#94a3b8', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
                  {adding
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Add</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowAddForm(false); setAddName(''); }}>
                  <MaterialCommunityIcons name="close" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          <ScrollView keyboardShouldPersistTaps="handled">
            {onAdd && !showAddForm && (
              <TouchableOpacity onPress={() => setShowAddForm(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#f0fdf4' }}>
                <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#16a34a" />
                <Text style={{ color: '#16a34a', fontWeight: '700', fontSize: 14 }}>Add Department</Text>
              </TouchableOpacity>
            )}
            {filtered.length === 0 ? (
              <Text style={{ padding: 14, color: theme.textMuted }}>No options found</Text>
            ) : filtered.map((it) => (
              <TouchableOpacity key={it.id} onPress={() => { onSelect(it.id); onClose(); }} style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                <Text style={{ color: theme.textPrimary, fontSize: 14 }}>{it.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function RegisterAssetScreen() {
  const { theme } = useTheme();
  const { qrUid, qrId, companyName } = useLocalSearchParams<{ qrUid: string; qrId: string; companyName?: string }>();

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
  const [invoiceDocs,   setInvoiceDocs]   = useState<DocFile[]>([]);

  // Maintenance
  const [warranty, setWarranty] = useState<DateRange>(emptyRange());
  const [amc,      setAmc]      = useState<DateRange>(emptyRange());
  const [cmc,      setCmc]      = useState<DateRange>(emptyRange());
  const [inHouse,  setInHouse]  = useState(false);
  const [catalyst, setCatalyst] = useState(false);
  const [highEnd,  setHighEnd]  = useState(false);
  const [category, setCategory] = useState<'Non_Critical' | 'Critical'>('Non_Critical');
  const [rber,     setRber]     = useState(false);
  const [remarks,  setRemarks]  = useState('');
  const [calibrationRequired, setCalibrationRequired] = useState(false);
  const [calibrationFrequency, setCalibrationFrequency] = useState('');
  const [lastCalibrationDate, setLastCalibrationDate] = useState('');
  const [nextCalibrationDueDate, setNextCalibrationDueDate] = useState('');
  const [calibrationVendorName, setCalibrationVendorName] = useState('');
  const [calibrationCertificateNumber, setCalibrationCertificateNumber] = useState('');
  const [calibrationStatus, setCalibrationStatus] = useState('Pending');
  const [alertBeforeDays, setAlertBeforeDays] = useState('30');

  // Location
  const [building, setBuilding] = useState('');
  const [floor,    setFloor]    = useState('');
  const [room,     setRoom]     = useState('');
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [locationBuildings, setLocationBuildings] = useState<Array<{ id: number; buildingName: string }>>([]);
  const [locationFloors, setLocationFloors] = useState<Array<{ id: number; floorName: string }>>([]);
  const [locationRooms, setLocationRooms] = useState<Array<{ id: number; roomName: string }>>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [showBuildingPicker, setShowBuildingPicker] = useState(false);
  const [showFloorPicker, setShowFloorPicker] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [showCalibrationFrequencyPicker, setShowCalibrationFrequencyPicker] = useState(false);
  const [showCalibrationStatusPicker, setShowCalibrationStatusPicker] = useState(false);
  const [showCalibrationVendorPicker, setShowCalibrationVendorPicker] = useState(false);

  // Department
  const [departments, setDepartments] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [selectedDeptName, setSelectedDeptName] = useState('');
  const [showDeptPicker, setShowDeptPicker] = useState(false);
  const [loadingDepts, setLoadingDepts] = useState(false);

  // Working Status
  const [workingStatus, setWorkingStatus] = useState('Working');
  const [showWorkingStatusPicker, setShowWorkingStatusPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [workingStatuses, setWorkingStatuses] = useState<string[]>(['Working', 'Not_Working', 'WIP', 'Unverified', 'Verified']);

  const [submitting, setSubmitting] = useState(false);
  const [hcImages,   setHcImages]   = useState<string[]>([]);

  const EXCLUDED_STATUSES = new Set(['Condemned', 'Critical']);
  useEffect(() => {
    fetchWorkingStatuses().then(setWorkingStatuses).catch(() => {});
  }, []);

  // When companyId is known, reload statuses from the company's Status Master
  useEffect(() => {
    if (!companyId) return;
    fetchCompanyAssetStatuses().then((s) => setWorkingStatuses(s.filter((x) => !EXCLUDED_STATUSES.has(x)))).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    if (!qrUid) return;
    fetchPreQrByUid(String(qrUid))
      .then((data) => {
        if (data?.companyId) setCompanyId(Number(data.companyId));
      })
      .catch(() => {});
  }, [qrUid]);

  useEffect(() => {
    if (!companyId) { setDepartments([]); return; }
    setLoadingDepts(true);
    fetchDepartmentsByCompany(companyId)
      .then(setDepartments)
      .catch(() => {})
      .finally(() => setLoadingDepts(false));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setLocationBuildings([]);
      return;
    }
    fetchLocationBuildingsByCompany(companyId)
      .then((rows) => setLocationBuildings(Array.isArray(rows) ? rows : []))
      .catch(() => setLocationBuildings([]));
  }, [companyId]);

  useEffect(() => {
    if (!selectedBuildingId) {
      setLocationFloors([]);
      setLocationRooms([]);
      setSelectedFloorId(null);
      setFloor('');
      setRoom('');
      return;
    }
    fetchLocationFloorsByBuilding(selectedBuildingId)
      .then((rows) => setLocationFloors(Array.isArray(rows) ? rows : []))
      .catch(() => setLocationFloors([]));
  }, [selectedBuildingId]);

  useEffect(() => {
    if (!selectedFloorId) {
      setLocationRooms([]);
      setRoom('');
      return;
    }
    fetchLocationRoomsByFloor(selectedFloorId)
      .then((rows) => setLocationRooms(Array.isArray(rows) ? rows : []))
      .catch(() => setLocationRooms([]));
  }, [selectedFloorId]);

  const inp = (extra?: object) => ([sStyles.input, {
    backgroundColor: theme.surface,
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

      const uploadAll = async (uris: string[]) => {
        if (!uris.length) return [];
        const results = await Promise.allSettled(uris.map(uri => uploadQueryImage(token, uri)));
        return results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
          .map(r => r.value);
      };

      const [imageUrls, invoiceUrls] = await Promise.all([
        uploadAll(hcImages),
        uploadAll(invoiceDocs.map(f => f.uri)),
      ]);

      const result = await registerAssetOnQr(token, Number(qrId), {
        assetName: assetName.trim(),
        assetType: 'healthcare',
        departmentId: selectedDeptId ?? undefined,
        workingStatus: workingStatus || undefined,
        criticality: category,
        location: building.trim() || undefined,
        floor: floor.trim() || undefined,
        room: room.trim() || undefined,
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
        highEnd: highEnd || undefined,
        maintenanceTypes: { warranty: warranty.enabled, amc: amc.enabled, cmc: cmc.enabled, inHouse, catalyst, highEnd },
        calibrationRequired,
        calibrationFrequency: calibrationFrequency || undefined,
        lastCalibrationDate: lastCalibrationDate || undefined,
        nextCalibrationDueDate: nextCalibrationDueDate || undefined,
        calibrationVendorName: calibrationVendorName || undefined,
        calibrationCertificateNumber: calibrationCertificateNumber || undefined,
        calibrationStatus: calibrationStatus || undefined,
        alertBeforeDays: alertBeforeDays ? Number(alertBeforeDays) : undefined,
        rber: rber || undefined,
        remarks: remarks.trim() || undefined,
        hcImages: imageUrls.length ? imageUrls : undefined,
        invoiceImages: invoiceUrls.length ? invoiceUrls : undefined,
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
              <Text style={[sStyles.label, { color: theme.textMuted, marginBottom: 4 }]}>Start Date</Text>
              <DatePickerField value={range.startDate} onChange={v => setRange({ ...range, startDate: v })} placeholder="DD/MM/YYYY" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[sStyles.label, { color: theme.textMuted, marginBottom: 4 }]}>End Date</Text>
              <DatePickerField value={range.endDate} onChange={v => setRange({ ...range, endDate: v })} placeholder="DD/MM/YYYY" />
            </View>
          </View>
        </View>
      )}
    </View>
  );

  const PhotoStrip = ({
    photos, onRemove, onCamera, onGallery, max, label,
  }: { photos: string[]; onRemove: (i: number) => void; onCamera: () => void; onGallery: () => void; max: number; label: string }) => (
    <View>
      <Text style={[sStyles.label, { color: theme.textMuted, marginBottom: 6 }]}>{label}</Text>
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
            <TouchableOpacity style={[sStyles.imgBtn, { borderColor: theme.border }]} onPress={onCamera}>
              <MaterialCommunityIcons name="camera" size={22} color={theme.primary} />
              <Text style={[sStyles.imgBtnLabel, { color: theme.textMuted }]}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sStyles.imgBtn, { borderColor: theme.border }]} onPress={onGallery}>
              <MaterialCommunityIcons name="image-multiple-outline" size={22} color={theme.textMuted} />
              <Text style={[sStyles.imgBtnLabel, { color: theme.textMuted }]}>Gallery</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[sStyles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[sStyles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[sStyles.headerTitle, { color: theme.textPrimary }]}>Register Equipment</Text>
            {companyName ? (
              <Text style={[sStyles.headerSub, { color: theme.primary, fontWeight: '700', fontFamily: undefined }]}>{companyName}</Text>
            ) : null}
            <Text style={[sStyles.headerSub, { color: theme.textMuted }]}>Asset ID will be generated automatically after registration</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={sStyles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* QR Banner */}
          <View style={sStyles.banner}>
            <MaterialCommunityIcons name="qrcode-scan" size={24} color="#d97706" />
            <Text style={sStyles.bannerText}>Fill in the details to register this healthcare equipment and link it to the scanned QR code.</Text>
          </View>

          {/* ── EQUIPMENT DETAILS ─────────────────── */}
          <SectionHeader title="Equipment Details" />

          <Field label="Department">
            <TouchableOpacity
              style={[sStyles.input, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: loadingDepts ? 0.6 : 1 }]}
              onPress={() => setShowDeptPicker(true)}
              disabled={loadingDepts}
            >
              <Text style={{ color: selectedDeptName ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                {loadingDepts ? 'Loading departments…' : selectedDeptName || '— Select Department —'}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </Field>

          <Field label="Working Status">
            <TouchableOpacity
              style={[sStyles.input, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => setShowWorkingStatusPicker(true)}
            >
              <Text style={{ color: theme.textPrimary, fontSize: 14 }}>{workingStatus}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </Field>

          <Field label="Equipment Name" required>
            <TextInput style={inp()} placeholder="e.g. ECG Machine, Ventilator…" placeholderTextColor={theme.textMuted}
              value={assetName} onChangeText={setAssetName} />
          </Field>
          {/* ── CATEGORY ── */}
          <Field label="Category">
            <TouchableOpacity
              style={[sStyles.input, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => setShowCategoryPicker(true)}
            >
              <Text style={{ color: theme.textPrimary, fontSize: 14 }}>{category === 'Critical' ? 'Critical' : 'Non-Critical'}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </Field>
          <Field label="Make / Manufacturer">
            <TextInput style={inp()} placeholder="e.g. GE, Philips, Siemens…" placeholderTextColor={theme.textMuted}
              value={make} onChangeText={setMake} />
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
                <DatePickerField value={installationDate} onChange={setInstallationDate} placeholder="DD/MM/YYYY" />
              </Field>
            </View>
          </View>

          {/* ── INVOICE / PURCHASE ────────────────── */}
          <SectionHeader title="Invoice No. / Purchase Details" />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Invoice No.">
                <TextInput style={inp()} placeholder="Invoice number" placeholderTextColor={theme.textMuted}
                  value={invoiceNo} onChangeText={setInvoiceNo} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Purchase Cost (₹)">
                <TextInput style={inp()} placeholder="Amount" placeholderTextColor={theme.textMuted}
                  keyboardType="numeric" value={purchaseCost} onChangeText={setPurchaseCost} />
              </Field>
            </View>
          </View>
          <Field label="Purchase Date">
            <DatePickerField value={purchaseDate} onChange={setPurchaseDate} placeholder="DD/MM/YYYY" />
          </Field>
          <DocumentAttachField
            files={invoiceDocs}
            onAdd={f => setInvoiceDocs(p => [...p, f].slice(0, 3))}
            onRemove={i => setInvoiceDocs(p => p.filter((_, j) => j !== i))}
            maxFiles={3}
            label="Invoice Receipt / Document (up to 3)"
          />

          {/* ── MAINTENANCE UNDER ─────────────────── */}
          <SectionHeader title="Maintenance Under" />

          <MaintenanceRow label="Warranty" range={warranty} setRange={setWarranty} />
          <MaintenanceRow label="AMC (Annual Maintenance Contract)" range={amc} setRange={setAmc} />
          <MaintenanceRow label="CMC (Comprehensive Maintenance Contract)" range={cmc} setRange={setCmc} />
          <Checkbox checked={inHouse} label="In House" onToggle={() => setInHouse(v => !v)} />
          <View style={{ marginTop: 8 }}>
            <Checkbox checked={catalyst} label="Catalyst" onToggle={() => setCatalyst(v => !v)} />
          </View>
          <View style={{ marginTop: 8 }}>
            <Checkbox checked={highEnd} label="High End Equipment" onToggle={() => setHighEnd(v => !v)} />
          </View>

          <View style={{ marginTop: 8 }}>
            <Checkbox checked={rber} label="RBER (Recommended Beyond Economic Repair)" onToggle={() => setRber(v => !v)} />
          </View>

          <View style={{ marginTop: 14 }}>
            <Field label="Remarks">
              <TextInput style={inp({ minHeight: 80, textAlignVertical: 'top', paddingTop: 10 })}
                placeholder="Any additional notes…" placeholderTextColor={theme.textMuted}
                value={remarks} onChangeText={setRemarks} multiline numberOfLines={3} />
            </Field>
          </View>

          <SectionHeader title="Calibration Information" />
          <Checkbox checked={calibrationRequired} label="Calibration Required" onToggle={() => setCalibrationRequired(v => !v)} />
          {calibrationRequired ? (
            <>
              <Field label="Calibration Frequency">
                <TouchableOpacity
                  style={[sStyles.input, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setShowCalibrationFrequencyPicker(true)}>
                  <Text style={{ color: calibrationFrequency ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                    {calibrationFrequency || '— Select Frequency —'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </Field>
              <Field label="Calibration Status">
                <TouchableOpacity
                  style={[sStyles.input, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setShowCalibrationStatusPicker(true)}>
                  <Text style={{ color: calibrationStatus ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                    {calibrationStatus || '— Select Status —'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </Field>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Last Calibration Date">
                    <DatePickerField value={lastCalibrationDate} onChange={setLastCalibrationDate} placeholder="DD/MM/YYYY" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Next Calibration Due Date">
                    <DatePickerField value={nextCalibrationDueDate} onChange={setNextCalibrationDueDate} placeholder="DD/MM/YYYY" />
                  </Field>
                </View>
              </View>
              <Field label="Calibration Vendor">
                <TouchableOpacity
                  style={[sStyles.input, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setShowCalibrationVendorPicker(true)}>
                  <Text style={{ color: calibrationVendorName ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                    {calibrationVendorName || '— Select Vendor —'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </Field>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Certificate Number">
                    <TextInput style={inp()} placeholder="Certificate number" placeholderTextColor={theme.textMuted}
                      value={calibrationCertificateNumber} onChangeText={setCalibrationCertificateNumber} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Alert Before Due (Days)">
                    <TextInput style={inp()} placeholder="30" keyboardType="numeric" placeholderTextColor={theme.textMuted}
                      value={alertBeforeDays} onChangeText={setAlertBeforeDays} />
                  </Field>
                </View>
              </View>
            </>
          ) : null}

          {/* ── LOCATION ──────────────────────────── */}
          <SectionHeader title="Location" />

          <Field label="Building / Block">
            <TouchableOpacity
              style={[sStyles.input, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => setShowBuildingPicker(true)}>
              <Text style={{ color: building ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                {building || '— Select Building —'}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </Field>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Floor">
                <TouchableOpacity
                  style={[sStyles.input, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: selectedBuildingId ? 1 : 0.5 }]}
                  disabled={!selectedBuildingId}
                  onPress={() => setShowFloorPicker(true)}>
                  <Text style={{ color: floor ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                    {floor || '— Select Floor —'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Room / Area">
                <TouchableOpacity
                  style={[sStyles.input, { backgroundColor: theme.surface, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: selectedFloorId ? 1 : 0.5 }]}
                  disabled={!selectedFloorId}
                  onPress={() => setShowRoomPicker(true)}>
                  <Text style={{ color: room ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                    {room || '— Select Room —'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </Field>
            </View>
          </View>

          {/* ── EQUIPMENT IMAGES ──────────────────── */}
          <SectionHeader title="Equipment Images (optional · up to 4)" />
          <PhotoStrip
            photos={hcImages}
            onRemove={i => setHcImages(p => p.filter((_, j) => j !== i))}
            onCamera={async () => {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access in Settings.'); return; }
              const r = await ImagePicker.launchCameraAsync({ quality: 0.75 });
              if (!r.canceled && r.assets[0]) setHcImages(p => [...p, r.assets[0].uri].slice(0, 4));
            }}
            onGallery={async () => {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access in Settings.'); return; }
              const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.75 });
              if (!r.canceled) setHcImages(p => [...p, ...r.assets.map((a: any) => a.uri)].slice(0, 4));
            }}
            max={4}
            label="Equipment Photos (up to 4)"
          />
        </ScrollView>

        {/* Footer Button — part of layout flow, not absolute */}
        <View style={[sStyles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
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

      <PickerModal
        visible={showDeptPicker}
        title="Select Department"
        items={departments.map((d) => ({ id: d.id, label: d.name }))}
        searchable
        onSelect={(id) => {
          const dept = departments.find((d) => d.id === id);
          setSelectedDeptId(id);
          setSelectedDeptName(dept?.name || '');
        }}
        onClose={() => setShowDeptPicker(false)}
        onAdd={companyId ? async (name) => {
          const created = await createDepartmentForCompany(companyId, name);
          setDepartments(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
          setSelectedDeptId(created.id);
          setSelectedDeptName(created.name);
          setShowDeptPicker(false);
        } : undefined}
      />
      <PickerModal
        visible={showCategoryPicker}
        title="Category"
        items={[{ id: 1, label: 'Non-Critical' }, { id: 2, label: 'Critical' }]}
        onSelect={(id) => { setCategory(id === 2 ? 'Critical' : 'Non_Critical'); setShowCategoryPicker(false); }}
        onClose={() => setShowCategoryPicker(false)}
      />
      <PickerModal
        visible={showWorkingStatusPicker}
        title="Working Status"
        items={workingStatuses.map((s, i) => ({ id: i + 1, label: s }))}
        onSelect={(id) => {
          setWorkingStatus(workingStatuses[id - 1] || 'Working');
        }}
        onClose={() => setShowWorkingStatusPicker(false)}
      />
      <PickerModal
        visible={showBuildingPicker}
        title="Select Building"
        items={locationBuildings.map((b) => ({ id: b.id, label: b.buildingName }))}
        onSelect={(id) => {
          const selected = locationBuildings.find((b) => b.id === id);
          setSelectedBuildingId(id);
          setSelectedFloorId(null);
          setBuilding(selected?.buildingName || '');
          setFloor('');
          setRoom('');
        }}
        onClose={() => setShowBuildingPicker(false)}
      />
      <PickerModal
        visible={showFloorPicker}
        title="Select Floor"
        items={locationFloors.map((f) => ({ id: f.id, label: f.floorName }))}
        onSelect={(id) => {
          const selected = locationFloors.find((f) => f.id === id);
          setSelectedFloorId(id);
          setFloor(selected?.floorName || '');
          setRoom('');
        }}
        onClose={() => setShowFloorPicker(false)}
      />
      <PickerModal
        visible={showRoomPicker}
        title="Select Room"
        items={locationRooms.map((r) => ({ id: r.id, label: r.roomName }))}
        onSelect={(id) => {
          const selected = locationRooms.find((r) => r.id === id);
          setRoom(selected?.roomName || '');
        }}
        onClose={() => setShowRoomPicker(false)}
      />
      <PickerModal
        visible={showCalibrationFrequencyPicker}
        title="Calibration Frequency"
        items={[
          { id: 1, label: 'Monthly' },
          { id: 2, label: 'Quarterly' },
          { id: 3, label: 'Half Yearly' },
          { id: 4, label: 'Yearly' },
        ]}
        onSelect={(id) => {
          const map: Record<number, string> = { 1: 'Monthly', 2: 'Quarterly', 3: 'Half Yearly', 4: 'Yearly' };
          setCalibrationFrequency(map[id] || '');
        }}
        onClose={() => setShowCalibrationFrequencyPicker(false)}
      />
      <PickerModal
        visible={showCalibrationStatusPicker}
        title="Calibration Status"
        items={[
          { id: 1, label: 'Active' },
          { id: 2, label: 'Expired' },
          { id: 3, label: 'Pending' },
        ]}
        onSelect={(id) => {
          const map: Record<number, string> = { 1: 'Active', 2: 'Expired', 3: 'Pending' };
          setCalibrationStatus(map[id] || 'Pending');
        }}
        onClose={() => setShowCalibrationStatusPicker(false)}
      />
      <PickerModal
        visible={showCalibrationVendorPicker}
        title="Calibration Vendor"
        items={[
          { id: 1, label: 'Philips Biomedical' },
          { id: 2, label: 'GE Healthcare' },
          { id: 3, label: 'Siemens Healthcare' },
        ]}
        onSelect={(id) => {
          const map: Record<number, string> = { 1: 'Philips Biomedical', 2: 'GE Healthcare', 3: 'Siemens Healthcare' };
          setCalibrationVendorName(map[id] || '');
        }}
        onClose={() => setShowCalibrationVendorPicker(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sStyles = StyleSheet.create({
  safe:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle:   { fontSize: 17, fontWeight: '700' },
  headerSub:     { fontSize: 11, fontFamily: 'monospace', marginTop: 1 },
  scroll:        { padding: Spacing.md, gap: 14, paddingBottom: Spacing.xl },
  banner:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fef3c7', borderColor: '#fcd34d', borderWidth: 1, borderRadius: Radius.lg, padding: 14, marginBottom: 4 },
  bannerText:    { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 },
  sectionHeader: { backgroundColor: '#1e3a8a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md, marginTop: 8 },
  sectionTitle:  { color: '#fff', fontWeight: '700', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  fieldGroup:    { gap: 5 },
  label:         { fontSize: 11, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  input:         { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  checkRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkBox:      { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  checkLabel:    { fontSize: 14 },
  footer:        { padding: Spacing.md, borderTopWidth: 1 },
  btn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: Radius.lg },
  btnText:       { color: '#fff', fontWeight: '700', fontSize: 16 },
  imgBtn:        { width: 75, height: 75, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  imgBtnLabel:   { fontSize: 10, marginTop: 4 },
});

const calStyles = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:        { borderRadius: 20, paddingBottom: 16, elevation: 24, maxWidth: 340, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24 },
  titleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  sheetTitle:   { fontSize: 16, fontWeight: '700' },
  monthNav:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 8 },
  navBtn:       { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  monthLabel:   { fontSize: 14, fontWeight: '700' },
  dayLabelRow:  { flexDirection: 'row', paddingHorizontal: 8, marginBottom: 2 },
  dayLabelCell: { flex: 1, alignItems: 'center', paddingVertical: 5 },
  dayLabelText: { fontSize: 11, fontWeight: '600' },
  grid:         { paddingHorizontal: 8 },
  gridRow:      { flexDirection: 'row', marginBottom: 2 },
  gridCell:     { flex: 1, alignItems: 'center' },
  dayBtn:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayText:      { fontSize: 13 },
  actions:      { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 12 },
  cancelBtn:    { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  confirmBtn:   { flex: 2, padding: 12, borderRadius: 10, alignItems: 'center' },
});

const docStyles = StyleSheet.create({
  fileRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.md, padding: 11, marginBottom: 8, borderWidth: 1 },
  fileName:  { flex: 1, fontSize: 13, fontWeight: '500' },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.md, padding: 14 },
});
