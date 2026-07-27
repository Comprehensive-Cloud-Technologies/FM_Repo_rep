/**
 * Training Session Detail
 *
 * Tabbed view:
 *  - Info      — session details, status, edit fields
 *  - Attendance — mark present/absent/excused, search & add employees
 *  - Documents  — upload images / files
 */

import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  addManualTrainingAttendance,
  bulkMarkTrainingAttendance,
  deleteTrainingAttendanceRecord,
  fetchTrainingAttendance,
  fetchTrainingDocuments,
  fetchTrainingEmployeesList,
  fetchTrainingSession,
  markTrainingAttendance,
  updateTrainingSession,
  uploadTrainingDocument,
} from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

// ─── Status helpers ───────────────────────────────────────────────────────────
const ATT_STATUS = ['present', 'absent', 'excused'] as const;
type AttStatus = typeof ATT_STATUS[number];

const ATT_COLOR: Record<AttStatus, string> = {
  present: '#059669',
  absent:  '#DC2626',
  excused: '#D97706',
};

const SESSION_STATUS_COLOR: Record<string, string> = {
  scheduled:   '#2563EB',
  in_progress: '#D97706',
  completed:   '#059669',
  cancelled:   '#64748B',
};

// ─── Attendance Row ───────────────────────────────────────────────────────────
function AttRow({ item, onToggle, onRemove }: {
  item: any;
  onToggle: (newStatus: AttStatus) => void;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  const status: AttStatus = (item.attendance_status as AttStatus) ?? 'absent';
  const nextStatus = ATT_STATUS[(ATT_STATUS.indexOf(status) + 1) % ATT_STATUS.length];
  const color = ATT_COLOR[status];

  return (
    <View style={[ar.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[ar.avatar, { backgroundColor: color + '20' }]}>
        <Text style={{ color, fontWeight: '700', fontSize: 14 }}>
          {(item.employee_name ?? item.emp_name_live ?? '?')[0]}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[ar.name, { color: theme.textPrimary }]} numberOfLines={1}>
          {item.employee_name ?? item.emp_name_live ?? 'Unknown'}
        </Text>
        <Text style={[ar.sub, { color: theme.textSecondary }]}>
          {item.employee_code ?? item.emp_code_live ?? '—'} · {item.department_name ?? '—'}
        </Text>
      </View>
      <TouchableOpacity
        style={[ar.badge, { backgroundColor: color + '18', borderColor: color + '50' }]}
        onPress={() => onToggle(nextStatus)}
        activeOpacity={0.7}
      >
        <Text style={{ color, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>{status}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
const ar = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name:   { fontSize: 14, fontWeight: '600' },
  sub:    { fontSize: 12 },
  badge:  { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
});

// ─── Add Employee Modal ───────────────────────────────────────────────────────
function AddEmployeeModal({ visible, onClose, sessionId, alreadyAdded, onAdded }: {
  visible: boolean; onClose: () => void; sessionId: number;
  alreadyAdded: Set<number>; onAdded: (emp: any) => void;
}) {
  const { theme } = useTheme();
  const [search, setSearch]     = useState('');
  const [employees, setEmps]    = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [marking, setMarking]   = useState<number | null>(null);

  const searchEmps = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetchTrainingEmployeesList({ search: q, pageSize: 50 });
      setEmps(Array.isArray(res?.rows) ? res.rows : []);
    } catch { setEmps([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (visible) void searchEmps(''); }, [visible, searchEmps]);

  useEffect(() => {
    const t = setTimeout(() => void searchEmps(search), 300);
    return () => clearTimeout(t);
  }, [search, searchEmps]);

  const add = async (emp: any) => {
    setMarking(emp.id);
    try {
      await markTrainingAttendance(sessionId, { employeeId: emp.id, attendanceStatus: 'present' });
      onAdded({ ...emp, attendance_status: 'present', employee_id: emp.id, employee_name: emp.full_name, employee_code: emp.employee_code });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to add employee');
    } finally { setMarking(null); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
        <View style={[aem.header, { borderBottomColor: theme.border }]}>
          <Text style={[aem.title, { color: theme.textPrimary }]}>Add Employee</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={[aem.searchRow, { borderBottomColor: theme.border }]}>
          <View style={[aem.searchBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="magnify" size={16} color={theme.textMuted} />
            <TextInput
              style={[aem.searchInput, { color: theme.inputText }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or employee code…"
              placeholderTextColor={theme.inputPlaceholder}
              autoFocus
            />
          </View>
        </View>
        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xl }} />
        ) : (
          <FlatList
            data={employees}
            keyExtractor={e => String(e.id)}
            contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
            ListEmptyComponent={
              <Text style={{ textAlign: 'center', color: theme.textMuted, marginTop: 32 }}>No employees found</Text>
            }
            renderItem={({ item }) => {
              const added = alreadyAdded.has(item.id);
              return (
                <View style={[aem.empRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[aem.avatar, { backgroundColor: '#7C3AED20' }]}>
                    <Text style={{ color: '#7C3AED', fontWeight: '700' }}>{(item.full_name ?? '?')[0]}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[{ fontWeight: '600', fontSize: 14 }, { color: theme.textPrimary }]} numberOfLines={1}>{item.full_name}</Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary }}>{item.employee_code} · {item.department_name ?? item.designation ?? '—'}</Text>
                  </View>
                  {added ? (
                    <Text style={{ fontSize: 12, color: '#059669', fontWeight: '600' }}>Added</Text>
                  ) : (
                    <TouchableOpacity
                      style={[aem.addBtn, { backgroundColor: marking === item.id ? '#94A3B8' : '#7C3AED' }]}
                      onPress={() => !added && void add(item)}
                      disabled={marking === item.id}
                    >
                      {marking === item.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>+ Add</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}
const aem = StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1 },
  title:      { ...Typography.h3 },
  searchRow:  { padding: Spacing.md, borderBottomWidth: 1 },
  searchBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 12, height: 40 },
  searchInput:{ flex: 1, fontSize: 14 },
  empRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  avatar:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  addBtn:     { borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 7 },
  inputField: { borderWidth: 1, borderRadius: Radius.md, padding: 12, fontSize: 14, height: 46 },
});

// ─── Info Tab ─────────────────────────────────────────────────────────────────
function InfoTab({ session, onStatusChange }: { session: any; onStatusChange: (s: string) => void }) {
  const { theme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [notes,  setNotes]  = useState(session.notes ?? '');
  const [status, setStatus] = useState(session.status ?? 'scheduled');

  const handleStatusChange = async (newStatus: string) => {
    setSaving(true);
    try {
      await updateTrainingSession(session.id, { status: newStatus });
      setStatus(newStatus);
      onStatusChange(newStatus);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await updateTrainingSession(session.id, { notes });
      Alert.alert('Saved', 'Notes updated');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  const fmt = (v?: string) => v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const color = SESSION_STATUS_COLOR[status] ?? '#64748B';

  return (
    <View style={{ padding: Spacing.lg, gap: Spacing.lg }}>
      {/* Details */}
      <View style={[it.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Row icon="tag-outline"           label="Session #"    value={session.session_number} />
        <Row icon="calendar-outline"      label="Date"         value={fmt(session.training_date)} />
        <Row icon="clock-outline"         label="Time"         value={[session.start_time?.slice(0, 5), session.end_time?.slice(0, 5)].filter(Boolean).join(' – ') || '—'} />
        <Row icon="account-tie-outline"   label="Trainer"      value={session.trainer_name || '—'} />

        <Row icon="account-group-outline" label="Registered"   value={String(session.total_registered ?? 0)} />
        <Row icon="check-circle-outline"  label="Present"      value={String(session.total_present ?? 0)} />
        <Row icon="close-circle-outline"  label="Absent"       value={String(session.total_absent ?? 0)} />
      </View>

      {/* Notes */}
      <View style={{ gap: 8 }}>
        <Text style={[it.cardLabel, { color: theme.textSecondary }]}>NOTES</Text>
        <TextInput
          style={[it.notesInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Add notes…"
          placeholderTextColor={theme.inputPlaceholder}
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[it.saveBtn, { backgroundColor: '#7C3AED', opacity: saving ? 0.6 : 1 }]}
          onPress={handleSaveNotes}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ color: '#fff', fontWeight: '700' }}>Save Notes</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7 }}>
      <MaterialCommunityIcons name={icon as any} size={17} color="#7C3AED" style={{ marginTop: 1 }} />
      <Text style={{ width: 90, fontSize: 13, color: theme.textSecondary, fontWeight: '500' }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: theme.textPrimary, fontWeight: '500' }}>{value}</Text>
    </View>
  );
}
const it = StyleSheet.create({
  card:        { borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1 },
  cardLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  statusBadge: {},
  statusBtn:   { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 6 },
  notesInput:  { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14, height: 100 },
  saveBtn:     { borderRadius: Radius.md, padding: 12, alignItems: 'center' },
});

// ─── Attendance Tab ───────────────────────────────────────────────────────────
function AttendanceTab({ sessionId }: { sessionId: number }) {
  const { theme } = useTheme();
  const [records,       setRecords]       = useState<any[]>([]);
  const [employees,     setEmployees]     = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [marking,       setMarking]       = useState<number | string | null>(null);
  const [showManual,    setShowManual]    = useState(false);
  const [manualName,    setManualName]    = useState('');
  const [manualCode,    setManualCode]    = useState('');
  const [manualDesig,   setManualDesig]   = useState('');
  const [manualStatus,  setManualStatus]  = useState<AttStatus>('present');
  const [savingManual,  setSavingManual]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [att, emps] = await Promise.all([
        fetchTrainingAttendance(sessionId),
        fetchTrainingEmployeesList({ pageSize: 500 }),
      ]);
      setRecords(Array.isArray(att) ? att : []);
      const empList = Array.isArray(emps) ? emps : (emps?.rows ?? emps?.employees ?? []);
      setEmployees(empList);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  // Build attendance map keyed by employee_id
  const attMap = React.useMemo(() => {
    const m = new Map<number, any>();
    records.forEach(r => { if (r.employee_id) m.set(Number(r.employee_id), r); });
    return m;
  }, [records]);

  const manualEntries = React.useMemo(() => records.filter(r => r.is_manual || !r.employee_id), [records]);

  const filteredEmps = React.useMemo(() =>
    employees.filter(e => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (e.full_name ?? '').toLowerCase().includes(q) ||
             (e.employee_code ?? '').toLowerCase().includes(q);
    }),
    [employees, search]
  );

  const markEmployee = async (empId: number, newStatus: AttStatus) => {
    setMarking(empId);
    try {
      await markTrainingAttendance(sessionId, { employeeId: empId, attendanceStatus: newStatus });
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to mark attendance');
    } finally { setMarking(null); }
  };

  const removeEmployee = (empId: number, recordId?: number) => {
    Alert.alert('Remove', 'Remove this attendance record?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await deleteTrainingAttendanceRecord(sessionId, empId, recordId); await load(); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const submitManual = async () => {
    if (!manualName.trim()) { Alert.alert('Required', 'Name is required'); return; }
    setSavingManual(true);
    try {
      await addManualTrainingAttendance(sessionId, { name: manualName.trim(), code: manualCode, designation: manualDesig, attendanceStatus: manualStatus });
      setManualName(''); setManualCode(''); setManualDesig(''); setManualStatus('present');
      setShowManual(false);
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setSavingManual(false); }
  };

  const markAll = async (status: AttStatus) => {
    Alert.alert(`Mark All ${status}`, `Set all ${employees.length} employees as ${status}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        setMarking('bulk');
        try {
          const recs = employees.map(e => ({ employeeId: e.id, attendanceStatus: status }));
          await bulkMarkTrainingAttendance(sessionId, recs);
          await load();
        } catch (e: any) { Alert.alert('Error', e.message); } finally { setMarking(null); }
      }},
    ]);
  };

  const presentCount = records.filter(r => r.attendance_status === 'present').length;
  const absentCount  = records.filter(r => r.attendance_status === 'absent').length;
  const pct = records.length ? Math.round(100 * presentCount / records.length) : 0;

  return (
    <View style={{ flex: 1 }}>
      {/* Summary bar */}
      <View style={[att.summaryBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={att.summaryItem}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#059669' }}>{presentCount}</Text>
          <Text style={{ fontSize: 11, color: '#059669', fontWeight: '600' }}>Present</Text>
        </View>
        <View style={att.summaryItem}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#DC2626' }}>{absentCount}</Text>
          <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '600' }}>Absent</Text>
        </View>
        <View style={att.summaryItem}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.textPrimary }}>{pct}%</Text>
          <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '600' }}>Rate</Text>
        </View>
      </View>

      {/* Toolbar */}
      <View style={[att.toolbar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={[att.searchBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <MaterialCommunityIcons name="magnify" size={16} color={theme.textMuted} />
          <TextInput
            style={[att.searchInput, { color: theme.inputText }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search employee…"
            placeholderTextColor={theme.inputPlaceholder}
          />
        </View>
        <TouchableOpacity style={att.bulkBtn} onPress={() => markAll('present')} disabled={marking === 'bulk'}>
          <Text style={{ color: '#059669', fontSize: 12, fontWeight: '700' }}>✔ All Present</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[att.bulkBtn, { borderColor: '#DC262640' }]} onPress={() => markAll('absent')} disabled={marking === 'bulk'}>
          <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '700' }}>✘ All Absent</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[att.bulkBtn, { borderColor: '#7C3AED40' }]} onPress={() => setShowManual(true)}>
          <Text style={{ color: '#7C3AED', fontSize: 12, fontWeight: '700' }}>+ Manual</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <View style={{ padding: Spacing.md, gap: Spacing.sm, paddingBottom: 20 }}>
          {/* Company employees */}
          {filteredEmps.map(e => {
            const rec = attMap.get(Number(e.id));
            const status: AttStatus | undefined = rec?.attendance_status as AttStatus | undefined;
            const color = status ? ATT_COLOR[status] : '#94A3B8';
            const nextStatus: AttStatus = status ? ATT_STATUS[(ATT_STATUS.indexOf(status) + 1) % ATT_STATUS.length] : 'present';
            return (
              <View key={e.id} style={[ar.row, { backgroundColor: status ? color + '0D' : theme.surface, borderColor: status ? color + '40' : theme.border }]}>
                <View style={[ar.avatar, { backgroundColor: color + '20' }]}>
                  <Text style={{ color, fontWeight: '700', fontSize: 14 }}>
                    {(e.full_name ?? '?')[0]}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[ar.name, { color: theme.textPrimary }]} numberOfLines={1}>{e.full_name}</Text>
                  <Text style={[ar.sub, { color: theme.textSecondary }]}>{e.employee_code ?? '—'} · {e.department_name ?? e.designation ?? '—'}</Text>
                </View>
                <TouchableOpacity
                  style={[ar.badge, { backgroundColor: color + '18', borderColor: color + '50' }]}
                  onPress={() => void markEmployee(Number(e.id), nextStatus)}
                  disabled={marking === Number(e.id)}
                  activeOpacity={0.7}
                >
                  {marking === Number(e.id)
                    ? <ActivityIndicator size="small" color={color} />
                    : <Text style={{ color, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>
                        {status ?? 'Mark'}
                      </Text>}
                </TouchableOpacity>
                {rec && (
                  <TouchableOpacity onPress={() => removeEmployee(Number(e.id))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          {filteredEmps.length === 0 && !search && (
            <View style={{ alignItems: 'center', paddingVertical: Spacing.xxl }}>
              <MaterialCommunityIcons name="account-group-outline" size={44} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, marginTop: 10 }}>No employees in company.</Text>
            </View>
          )}

          {/* Manual entries — rendered inline with regular employees */}
          {manualEntries.map(r => {
            const mColor = ATT_COLOR[r.attendance_status as AttStatus] ?? '#94A3B8';
            return (
              <View key={`m-${r.id}`} style={[ar.row, { backgroundColor: mColor + '0D', borderColor: mColor + '40' }]}>
                <View style={[ar.avatar, { backgroundColor: mColor + '20' }]}>
                  <Text style={{ color: mColor, fontWeight: '700', fontSize: 14 }}>{(r.employee_name ?? '?')[0]}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[ar.name, { color: '#1E293B' }]} numberOfLines={1}>{r.employee_name}</Text>
                    <View style={{ backgroundColor: '#EDE9FE', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 9, color: '#7C3AED', fontWeight: '700' }}>ext</Text>
                    </View>
                  </View>
                  <Text style={[ar.sub, { color: '#64748B' }]}>{r.employee_code ?? '—'} · {r.designation ?? '—'}</Text>
                </View>
                <View style={[ar.badge, { backgroundColor: mColor + '18', borderColor: mColor + '50' }]}>
                  <Text style={{ color: mColor, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>{r.attendance_status}</Text>
                </View>
                <TouchableOpacity onPress={() => removeEmployee(null as any, r.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="close" size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Manual entry modal */}
      <Modal visible={showManual} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowManual(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
          <View style={[aem.header, { borderBottomColor: theme.border }]}>
            <Text style={[aem.title, { color: theme.textPrimary }]}>Add External Attendee</Text>
            <TouchableOpacity onPress={() => setShowManual(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 4 }}>Add someone not in the system (contractor, guest, etc.)</Text>
            <View style={{ gap: 12 }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 4 }}>Full Name *</Text>
                <TextInput style={[aem.inputField, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]} value={manualName} onChangeText={setManualName} placeholder="e.g. John Doe" placeholderTextColor={theme.inputPlaceholder} />
              </View>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 4 }}>Employee Code (optional)</Text>
                <TextInput style={[aem.inputField, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]} value={manualCode} onChangeText={setManualCode} placeholder="e.g. EMP-001" placeholderTextColor={theme.inputPlaceholder} />
              </View>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 4 }}>Designation (optional)</Text>
                <TextInput style={[aem.inputField, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }]} value={manualDesig} onChangeText={setManualDesig} placeholder="e.g. Technician" placeholderTextColor={theme.inputPlaceholder} />
              </View>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 }}>Attendance Status</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {ATT_STATUS.map(s => (
                    <TouchableOpacity key={s} onPress={() => setManualStatus(s)}
                      style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 2, alignItems: 'center',
                        borderColor: manualStatus === s ? ATT_COLOR[s] : theme.border,
                        backgroundColor: manualStatus === s ? ATT_COLOR[s] + '15' : theme.surface }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: manualStatus === s ? ATT_COLOR[s] : theme.textSecondary, textTransform: 'capitalize' }}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>
          <View style={{ padding: Spacing.lg, gap: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
            <TouchableOpacity
              style={{ backgroundColor: '#7C3AED', borderRadius: 12, padding: 14, alignItems: 'center', opacity: savingManual ? 0.6 : 1 }}
              onPress={submitManual} disabled={savingManual}>
              {savingManual ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Add Attendee</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border }} onPress={() => setShowManual(false)}>
              <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const att = StyleSheet.create({
  summaryBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, gap: Spacing.md },
  summaryItem: { alignItems: 'center', flex: 1 },
  toolbar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 8, borderBottomWidth: 1, gap: 6, flexWrap: 'wrap' },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 10, height: 34, flex: 1, minWidth: 120 },
  searchInput: { flex: 1, fontSize: 13 },
  bulkBtn:     { borderRadius: Radius.md, borderWidth: 1.5, borderColor: '#05996940', paddingHorizontal: 10, paddingVertical: 6 },
});

// ─── Documents Tab ────────────────────────────────────────────────────────────
const DOC_TYPE_COLOR: Record<string, string> = {
  image:           '#7C3AED',
  attendance_sheet:'#0891B2',
  presentation:    '#D97706',
  supporting:      '#64748B',
};

function DocumentsTab({ sessionId }: { sessionId: number }) {
  const { theme } = useTheme();
  const [docs,       setDocs]       = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchTrainingDocuments(sessionId);
      setDocs(Array.isArray(data) ? data : []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  const pickAndUpload = async (docType: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const fileName = asset.uri.split('/').pop() ?? `doc_${Date.now()}.jpg`;
    setUploading(true);
    try {
      const uploaded = await uploadTrainingDocument(sessionId, asset.uri, fileName, docType);
      setDocs(prev => [uploaded, ...prev]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Unknown error');
    } finally { setUploading(false); }
  };

  const takeAndUpload = async (docType: string) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const fileName = `photo_${Date.now()}.jpg`;
    setUploading(true);
    try {
      const uploaded = await uploadTrainingDocument(sessionId, asset.uri, fileName, docType);
      setDocs(prev => [uploaded, ...prev]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Unknown error');
    } finally { setUploading(false); }
  };

  const showUploadMenu = () => {
    Alert.alert('Upload Image', 'Choose source', [
      { text: '📸 Take Photo',          onPress: () => void takeAndUpload('image') },
      { text: '🖼 Choose from Gallery', onPress: () => void pickAndUpload('image') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View>
      {/* Upload bar */}
      <View style={[doct.uploadBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Text style={[{ fontSize: 14, fontWeight: '600', flex: 1 }, { color: theme.textPrimary }]}>
          {docs.length} document{docs.length !== 1 ? 's' : ''}
        </Text>
        <TouchableOpacity
          style={[doct.uploadBtn, { backgroundColor: '#7C3AED', opacity: uploading ? 0.6 : 1 }]}
          onPress={showUploadMenu}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator size="small" color="#fff" />
            : <>
                <MaterialCommunityIcons name="upload" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Upload</Text>
              </>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <View style={{ padding: Spacing.md, gap: Spacing.sm, paddingBottom: 20 }}>
          {docs.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: Spacing.xxl }}>
              <MaterialCommunityIcons name="file-image-outline" size={44} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, marginTop: 10 }}>No documents uploaded yet</Text>
            </View>
          ) : docs.map(d => {
            const isImage = d.mimetype?.startsWith('image') || /\.(jpg|jpeg|png|webp)$/i.test(d.file_name ?? '');
            const typeColor = DOC_TYPE_COLOR[d.document_type] ?? '#64748B';
            return (
              <View key={d.id} style={[doct.docRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {isImage ? (
                  <Image source={{ uri: d.file_url }} style={doct.thumb} resizeMode="cover" />
                ) : (
                  <View style={[doct.thumb, { backgroundColor: typeColor + '15', alignItems: 'center', justifyContent: 'center' }]}>
                    <MaterialCommunityIcons name="file-document-outline" size={24} color={typeColor} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[{ fontWeight: '600', fontSize: 13 }, { color: theme.textPrimary }]} numberOfLines={2}>{d.file_name}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <View style={[doct.typeBadge, { backgroundColor: typeColor + '15' }]}>
                      <Text style={{ color: typeColor, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>
                        {(d.document_type ?? '').replace(/_/g, ' ')}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>
                      {d.uploaded_by_name ?? 'Unknown'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
const doct = StyleSheet.create({
  uploadBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full },
  docRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  thumb:     { width: 60, height: 60, borderRadius: Radius.sm, overflow: 'hidden' },
  typeBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
});

// ─── Section divider ─────────────────────────────────────────────────────────
function SectionDivider({ title }: { title: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ paddingHorizontal: Spacing.lg, paddingVertical: 10, backgroundColor: theme.surfaceAlt ?? '#F8FAFC', borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#7C3AED', letterSpacing: 1, textTransform: 'uppercase' }}>{title}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TrainingSessionDetailScreen() {
  const { theme } = useTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const id = Number(sessionId);

  const [session,  setSession]  = useState<any>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetchTrainingSession(id)
      .then(setSession)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={[{ flex: 1 }, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Training Session" showBack />
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={[{ flex: 1 }, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Training Session" showBack />
        <Text style={{ textAlign: 'center', marginTop: Spacing.xxl, color: theme.textSecondary }}>Session not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[{ flex: 1 }, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title={session.title} showBack />

      {/* Hero strip */}
      <View style={[hero.strip, { backgroundColor: '#7C3AED' }]}>
        <View style={{ flex: 1 }}>
          <Text style={hero.sno}>{session.session_number}</Text>
          <Text style={hero.date}>
            {session.training_date ? new Date(session.training_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' }) : '—'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={hero.stat}>{session.total_registered ?? 0} Enrolled</Text>
          <Text style={hero.stat}>{session.total_present ?? 0} Present</Text>
        </View>
      </View>

      {/* Single scrollable page */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <InfoTab session={session} onStatusChange={s => setSession((p: any) => ({ ...p, status: s }))} />
          <SectionDivider title="Attendance" />
          <AttendanceTab sessionId={id} />
          <SectionDivider title="Documents" />
          <DocumentsTab sessionId={id} />
          {session.status !== 'completed' && (
              <View style={{ padding: Spacing.lg, paddingTop: Spacing.md }}>
                <TouchableOpacity
                  style={{ backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
                  onPress={async () => {
                    Alert.alert('Mark as Completed', 'Mark this training session as completed?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Confirm', style: 'default', onPress: async () => {
                        try {
                          await updateTrainingSession(String(id), { status: 'completed' });
                          setSession((p: any) => p ? { ...p, status: 'completed' } : p);
                        } catch (e: any) { Alert.alert('Error', e.message ?? 'Failed'); }
                      }},
                    ]);
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>✓ Mark as Completed</Text>
                </TouchableOpacity>
              </View>
            )}
          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const hero = StyleSheet.create({
  strip: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, flexDirection: 'row', alignItems: 'center' },
  sno:   { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700' },
  date:  { color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 2 },
  stat:  { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
});
