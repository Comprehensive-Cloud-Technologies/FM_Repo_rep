/**
 * Training Sessions — company training management screen.
 *
 * Features:
 * - List all training sessions (with status filter tabs)
 * - Create new session via modal form
 * - Navigate to session detail (attendance + documents)
 */

import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createTrainingSession, fetchTrainingSessions } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

// ─── Status helpers ──────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  scheduled:   '#2563EB',
  in_progress: '#D97706',
  completed:   '#059669',
  cancelled:   '#64748B',
  overdue:     '#DC2626',
};

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? '#64748B';
  const label = status.replace(/_/g, ' ');
  return (
    <View style={[sp.pill, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Text style={[sp.text, { color }]}>{label}</Text>
    </View>
  );
}
const sp = StyleSheet.create({
  pill: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  text: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ item, onPress }: { item: any; onPress: () => void }) {
  const { theme } = useTheme();
  const date = item.training_date ? new Date(item.training_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const time = item.start_time ? item.start_time.slice(0, 5) : null;
  return (
    <TouchableOpacity
      style={[sc.card, { backgroundColor: theme.surface, shadowColor: theme.cardShadow, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={sc.row}>
        <View style={[sc.iconBox, { backgroundColor: '#F5F3FF' }]}>
          <MaterialCommunityIcons name="school-outline" size={22} color="#7C3AED" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sc.title, { color: theme.textPrimary }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[sc.sub, { color: theme.textSecondary }]}>
            {date}{time ? ` · ${time}` : ''}
          </Text>
        </View>
        <StatusPill status={item.status ?? 'scheduled'} />
      </View>
      <View style={sc.footer}>
        <View style={sc.chip}>
          <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" />
          <Text style={[sc.chipText, { color: '#64748B' }]}>{item.trainer_name ?? 'No trainer'}</Text>
        </View>
        <View style={sc.chip}>
          <MaterialCommunityIcons name="account-group-outline" size={13} color="#64748B" />
          <Text style={[sc.chipText, { color: '#64748B' }]}>{item.total_present ?? 0}/{item.total_registered ?? 0} present</Text>
        </View>

      </View>
      <Text style={[sc.sessionNo, { color: '#7C3AED' }]}>{item.session_number}</Text>
    </TouchableOpacity>
  );
}
const sc = StyleSheet.create({
  card:      { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm, borderWidth: 1, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2 },
  row:       { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  iconBox:   { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  title:     { ...Typography.h4, flexShrink: 1 },
  sub:       { ...Typography.bodyS, marginTop: 2 },
  footer:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipText:  { fontSize: 12 },
  sessionNo: { fontSize: 11, fontWeight: '700' },
});

// ─── Filter Tabs ─────────────────────────────────────────────────────────────
const TABS = [
  { key: 'all',        label: 'All' },
  { key: 'scheduled',  label: 'Scheduled' },
  { key: 'completed',  label: 'Completed' },
  { key: 'overdue',    label: 'Overdue' },
];

// ─── Create Session Modal ─────────────────────────────────────────────────────
function CreateModal({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated: (s: any) => void;
}) {
  const { theme } = useTheme();
  const [title,        setTitle]        = useState('');
  const [trainerName,  setTrainerName]  = useState('');

  const [notes,        setNotes]        = useState('');
  const [trainingDate, setTrainingDate] = useState(new Date());
  const [startTime,    setStartTime]    = useState<Date | null>(null);
  const [endTime,      setEndTime]      = useState<Date | null>(null);
  const [pickerMode,   setPickerMode]   = useState<'date' | 'startTime' | 'endTime' | null>(null);
  const [saving,       setSaving]       = useState(false);

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const fmtTime = (d: Date | null) => d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

  const handleSave = async () => {
    if (!title.trim()) return Alert.alert('Required', 'Training title is required');
    setSaving(true);
    try {
      const created = await createTrainingSession({
        title:        title.trim(),
        trainerName:  trainerName.trim() || undefined,
        trainingDate: fmtDate(trainingDate),
        startTime:    startTime ? fmtTime(startTime) : undefined,
        endTime:      endTime   ? fmtTime(endTime)   : undefined,
        notes:        notes.trim() || undefined,
        status:       'scheduled',
      });
      onCreated(created);
      // Reset form
      setTitle(''); setTrainerName(''); setNotes('');
      setTrainingDate(new Date()); setStartTime(null); setEndTime(null);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to create session');
    } finally { setSaving(false); }
  };

  const onPickerChange = (_: any, selected?: Date) => {
    if (!selected) { setPickerMode(null); return; }
    if (pickerMode === 'date')      { setTrainingDate(selected); if (Platform.OS === 'android') setPickerMode(null); }
    if (pickerMode === 'startTime') { setStartTime(selected);   if (Platform.OS === 'android') setPickerMode(null); }
    if (pickerMode === 'endTime')   { setEndTime(selected);     if (Platform.OS === 'android') setPickerMode(null); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
        <View style={[cm.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: theme.danger, fontWeight: '600', fontSize: 15 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[cm.title, { color: theme.textPrimary }]}>New Training Session</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {saving ? <ActivityIndicator color={theme.primary} size="small" /> : (
              <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 15 }}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={cm.scroll} keyboardShouldPersistTaps="handled">
            <Field label="Title *" value={title} onChange={setTitle} placeholder="e.g. Fire Safety Training" />
            <Field label="Trainer Name" value={trainerName} onChange={setTrainerName} placeholder="e.g. Dr. Singh" />

            {/* Date picker */}
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>Training Date *</Text>
              <TouchableOpacity
                style={[cm.pickerBtn, { backgroundColor: theme.inputBg, borderColor: pickerMode === 'date' ? theme.primary : theme.inputBorder }]}
                onPress={() => setPickerMode(v => v === 'date' ? null : 'date')}
              >
                <MaterialCommunityIcons name="calendar" size={18} color="#7C3AED" />
                <Text style={{ fontSize: 15, color: theme.inputText, flex: 1 }}>
                  {trainingDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
              </TouchableOpacity>
              {pickerMode === 'date' && (
                <DateTimePicker
                  value={trainingDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={onPickerChange}
                  minimumDate={new Date(2020, 0, 1)}
                />
              )}
            </View>

            {/* Start time */}
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>Start Time</Text>
              <TouchableOpacity
                style={[cm.pickerBtn, { backgroundColor: theme.inputBg, borderColor: pickerMode === 'startTime' ? theme.primary : theme.inputBorder }]}
                onPress={() => setPickerMode(v => v === 'startTime' ? null : 'startTime')}
              >
                <MaterialCommunityIcons name="clock-outline" size={18} color="#7C3AED" />
                <Text style={{ fontSize: 15, color: startTime ? theme.inputText : theme.inputPlaceholder, flex: 1 }}>
                  {startTime ? fmtTime(startTime) : 'Select start time'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
              </TouchableOpacity>
              {pickerMode === 'startTime' && (
                <DateTimePicker
                  value={startTime ?? new Date(new Date().setHours(9, 0, 0, 0))}
                  mode="time"
                  is24Hour
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onPickerChange}
                />
              )}
            </View>

            {/* End time */}
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>End Time</Text>
              <TouchableOpacity
                style={[cm.pickerBtn, { backgroundColor: theme.inputBg, borderColor: pickerMode === 'endTime' ? theme.primary : theme.inputBorder }]}
                onPress={() => setPickerMode(v => v === 'endTime' ? null : 'endTime')}
              >
                <MaterialCommunityIcons name="clock-check-outline" size={18} color="#7C3AED" />
                <Text style={{ fontSize: 15, color: endTime ? theme.inputText : theme.inputPlaceholder, flex: 1 }}>
                  {endTime ? fmtTime(endTime) : 'Select end time'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
              </TouchableOpacity>
              {pickerMode === 'endTime' && (
                <DateTimePicker
                  value={endTime ?? new Date(new Date().setHours(17, 0, 0, 0))}
                  mode="time"
                  is24Hour
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onPickerChange}
                />
              )}
            </View>

            <Field label="Notes" value={notes} onChange={setNotes} placeholder="Additional details..." multiline />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
const cm = StyleSheet.create({
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  title:     { ...Typography.h4 },
  scroll:    { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 48 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, height: 46 },
});

// ─── Field helper ─────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, keyboard, multiline }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboard?: any; multiline?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>{label}</Text>
      <TextInput
        style={[fi.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText, height: multiline ? 80 : 44 }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.inputPlaceholder}
        keyboardType={keyboard ?? 'default'}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : undefined}
        autoCapitalize="sentences"
      />
    </View>
  );
}
const fi = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 15 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TrainingSessionsScreen() {
  const { theme } = useTheme();
  const [sessions,   setSessions]   = useState<any[]>([]);
  const [activeTab,  setActiveTab]  = useState('all');
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const now  = new Date();
      const from = new Date(now.getFullYear() - 1, 0, 1).toISOString().slice(0, 10);
      const to   = new Date(now.getFullYear() + 1, 11, 31).toISOString().slice(0, 10);
      const data = await fetchTrainingSessions({ from, to });
      setSessions(Array.isArray(data) ? data : []);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const displayed = useMemo(() => {
    let list = sessions;
    if (activeTab !== 'all') list = list.filter(s => s.status === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.title?.toLowerCase().includes(q) ||
        s.trainer_name?.toLowerCase().includes(q) ||
        s.session_number?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [sessions, activeTab, search]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Training Sessions" showBack />

      {/* Search */}
      <View style={[styles.searchRow, { borderBottomColor: theme.border }]}>
        <View style={[styles.searchBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.inputText }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search sessions…"
            placeholderTextColor={theme.inputPlaceholder}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialCommunityIcons name="close-circle" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { borderBottomColor: theme.border }]}
        contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: Spacing.sm }}
      >
        {TABS.map(t => {
          const cnt = sessions.filter(s => t.key === 'all' || s.status === t.key).length;
          const active = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && { backgroundColor: '#7C3AED', borderColor: '#7C3AED' }, !active && { borderColor: theme.border }]}
              onPress={() => setActiveTab(t.key)}
            >
              <Text style={[styles.tabText, { color: active ? '#fff' : theme.textSecondary }]}>{t.label}</Text>
              <View style={[styles.tabBadge, { backgroundColor: active ? 'rgba(255,255,255,0.3)' : theme.surfaceAlt }]}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: active ? '#fff' : theme.textMuted }}>{cnt}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={displayed.length === 0 ? { flex: 1 } : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {displayed.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: Spacing.xl }}>
              <MaterialCommunityIcons name="school-outline" size={48} color={theme.textMuted} />
              <Text style={{ ...Typography.h4, color: theme.textSecondary, textAlign: 'center' }}>No training sessions</Text>
              <Text style={{ ...Typography.bodyS, color: theme.textMuted, textAlign: 'center' }}>Tap + to schedule a new session</Text>
            </View>
          ) : displayed.map(s => (
            <SessionCard
              key={s.id}
              item={s}
              onPress={() => router.push({ pathname: '/training-session-detail', params: { sessionId: String(s.id) } })}
            />
          ))}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: '#7C3AED' }]}
        onPress={() => setShowCreate(true)}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      <CreateModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(s) => { setSessions(prev => [s, ...prev]); setShowCreate(false); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  searchRow:  { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  searchBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 12, height: 40 },
  searchInput:{ flex: 1, fontSize: 14 },
  tabBar:     { flexGrow: 0, borderBottomWidth: 1, paddingVertical: Spacing.sm },
  tab:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1 },
  tabText:    { fontSize: 13, fontWeight: '600' },
  tabBadge:   { borderRadius: 20, paddingHorizontal: 6, paddingVertical: 1 },
  list:       { padding: Spacing.lg, gap: Spacing.md },
  fab:        { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6 },
});
