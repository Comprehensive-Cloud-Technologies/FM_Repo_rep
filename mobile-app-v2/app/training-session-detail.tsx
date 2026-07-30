import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { addManualTrainingAttendance, bulkMarkTrainingAttendance, deleteTrainingAttendanceRecord, fetchTrainingAttendance, fetchTrainingDocuments, fetchTrainingEmployeesList, fetchTrainingSession, markTrainingAttendance, updateTrainingSession, uploadTrainingDocument } from '../utils/api';
import { useTheme } from '../utils/theme';
import Header from '../components/Header';

const ATT_COLOR = { present: '#059669', absent: '#DC2626', excused: '#D97706' };
const STATUS_COLOR = { scheduled: '#2563EB', in_progress: '#D97706', completed: '#059669', cancelled: '#64748B' };

function SectionDivider({ title }) {
  return (
    <View style={sd.wrap}>
      <View style={sd.line} />
      <Text style={sd.text}>{title}</Text>
      <View style={sd.line} />
    </View>
  );
}
const sd = StyleSheet.create({ wrap:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:8,gap:8}, line:{flex:1,height:1,backgroundColor:'#e2e8f0'}, text:{fontSize:12,fontWeight:'700',color:'#94a3b8',textTransform:'uppercase'} });

function Row({ icon, label, value }) {
  const { theme } = useTheme();
  return (
    <View style={rw.row}>
      <MaterialCommunityIcons name={icon} size={16} color="#7C3AED" style={{ width: 20 }} />
      <Text style={[rw.label, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[rw.value, { color: theme.textPrimary }]} numberOfLines={2}>{value || '-'}</Text>
    </View>
  );
}
const rw = StyleSheet.create({ row:{flexDirection:'row',alignItems:'flex-start',gap:8,paddingVertical:6}, label:{fontSize:13,width:90,color:'#64748b'}, value:{flex:1,fontSize:13,fontWeight:'600'} });

function InfoTab({ session, onStatusChange }) {
  const { theme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(session.notes || '');
  const [status, setStatus] = useState(session.status || 'scheduled');
  const color = STATUS_COLOR[status] || '#64748B';

  const handleStatusChange = async (newStatus) => {
    setSaving(true);
    try {
      await updateTrainingSession(session.id, { status: newStatus });
      setStatus(newStatus);
      onStatusChange(newStatus);
    } catch(e) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await updateTrainingSession(session.id, { notes });
      Alert.alert('Saved', 'Notes updated');
    } catch(e) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const fmt = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '-';

  return (
    <View style={{ padding: 16, gap: 16 }}>
      <View style={[it.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Row icon="tag-outline" label="Session #" value={session.session_number} />
        <Row icon="calendar-outline" label="Date" value={fmt(session.training_date)} />
        <Row icon="clock-outline" label="Time" value={[session.start_time && session.start_time.slice(0,5), session.end_time && session.end_time.slice(0,5)].filter(Boolean).join(' - ') || '-'} />
        <Row icon="account-tie-outline" label="Trainer" value={session.trainer_name || '-'} />
        <Row icon="account-group-outline" label="Registered" value={String(session.total_registered || 0)} />
        <Row icon="check-circle-outline" label="Present" value={String(session.total_present || 0)} />
        <Row icon="close-circle-outline" label="Absent" value={String(session.total_absent || 0)} />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Status</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['scheduled','in_progress','completed','cancelled'].map(s => (
            <TouchableOpacity key={s} onPress={() => handleStatusChange(s)} disabled={saving}
              style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 2, borderColor: s === status ? (STATUS_COLOR[s] || '#64748b') : '#e2e8f0', backgroundColor: s === status ? ((STATUS_COLOR[s] || '#64748b') + '18') : 'transparent' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: s === status ? (STATUS_COLOR[s] || '#64748b') : '#94a3b8', textTransform: 'capitalize' }}>{s.replace(/_/g,' ')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Notes</Text>
        <TextInput
          style={{ borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }}
          value={notes}
          onChangeText={setNotes}
          placeholder="Add session notes..."
          placeholderTextColor={theme.inputPlaceholder}
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity onPress={handleSaveNotes} disabled={saving}
          style={{ backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Save Notes</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
const it = StyleSheet.create({ card:{ borderRadius:12, borderWidth:1, padding:16, gap:4 } });

function AttRow({ item, onToggle, onRemove }) {
  const { theme } = useTheme();
  const [marking, setMarking] = useState(false);
  const status = item.attendance_status || 'absent';
  const color = ATT_COLOR[status] || '#64748b';
  const toggle = async (next) => {
    setMarking(true);
    try { await onToggle(next); } finally { setMarking(false); }
  };
  return (
    <View style={[ar.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[ar.avatar, { backgroundColor: '#7C3AED20' }]}>
        <Text style={{ color: '#7C3AED', fontWeight: '700', fontSize: 15 }}>{(item.employee_name || '?')[0].toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[ar.name, { color: theme.textPrimary }]} numberOfLines={1}>{item.employee_name || '-'}</Text>
        <Text style={{ fontSize: 11, color: theme.textSecondary }}>{item.employee_code || ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {['present','absent','excused'].map(s => (
          <TouchableOpacity key={s} onPress={() => toggle(s)} disabled={marking}
            style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: status === s ? (ATT_COLOR[s] || '#64748b') : '#f1f5f9' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: status === s ? '#fff' : '#94a3b8', textTransform: 'capitalize' }}>{s[0].toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
        <MaterialCommunityIcons name="close" size={16} color="#94a3b8" />
      </TouchableOpacity>
    </View>
  );
}
const ar = StyleSheet.create({ row:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:12,borderWidth:1,marginBottom:8}, avatar:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'}, name:{fontSize:14,fontWeight:'600'} });

function AddEmployeeModal({ visible, onClose, onAdded, sessionId, alreadyAdded }) {
  const { theme } = useTheme();
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(null);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await fetchTrainingEmployeesList({ search, page: 1, pageSize: 50 });
        setEmployees((data && data.rows) || []);
      } catch(e) {} finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [search, visible]);

  const add = async (emp) => {
    setMarking(emp.id);
    try {
      await markTrainingAttendance(sessionId, { employeeId: emp.id, attendanceStatus: 'present' });
      onAdded({ ...emp, attendance_status: 'present', employee_id: emp.id, employee_name: emp.full_name, employee_code: emp.employee_code });
    } catch(e) { Alert.alert('Error', e.message || 'Failed'); }
    finally { setMarking(null); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top','bottom']}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:theme.border }}>
          <Text style={{ fontSize:17, fontWeight:'800', color:theme.textPrimary }}>Add Employee</Text>
          <TouchableOpacity onPress={onClose}><MaterialCommunityIcons name="close" size={22} color={theme.textSecondary} /></TouchableOpacity>
        </View>
        <View style={{ padding:12, borderBottomWidth:1, borderBottomColor:theme.border }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, borderRadius:999, borderWidth:1, borderColor:theme.border, backgroundColor:theme.surfaceAlt, paddingHorizontal:12, height:40 }}>
            <MaterialCommunityIcons name="magnify" size={16} color={theme.textMuted} />
            <TextInput style={{ flex:1, fontSize:14, color:theme.inputText }} value={search} onChangeText={setSearch} placeholder="Search by name or code..." placeholderTextColor={theme.inputPlaceholder} autoFocus />
          </View>
        </View>
        {loading ? <ActivityIndicator color={theme.primary} style={{ marginTop:32 }} /> : (
          <FlatList
            data={employees}
            keyExtractor={e => String(e.id)}
            contentContainerStyle={{ padding:12, gap:8 }}
            ListEmptyComponent={<Text style={{ textAlign:'center', color:theme.textMuted, marginTop:32 }}>No employees found</Text>}
            renderItem={({ item }) => {
              const added = alreadyAdded && alreadyAdded.has(item.id);
              return (
                <View style={{ flexDirection:'row', alignItems:'center', gap:10, padding:12, borderRadius:12, borderWidth:1, borderColor:theme.border, backgroundColor:theme.surface }}>
                  <View style={{ width:36, height:36, borderRadius:18, backgroundColor:'#7C3AED20', alignItems:'center', justifyContent:'center' }}>
                    <Text style={{ color:'#7C3AED', fontWeight:'700' }}>{((item.full_name||'?')[0]).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontWeight:'600', fontSize:14, color:theme.textPrimary }} numberOfLines={1}>{item.full_name}</Text>
                    <Text style={{ fontSize:12, color:theme.textSecondary }}>{item.employee_code} - {item.department_name || item.designation || '-'}</Text>
                  </View>
                  {added ? (
                    <Text style={{ fontSize:12, color:'#059669', fontWeight:'600' }}>Added</Text>
                  ) : (
                    <TouchableOpacity onPress={() => add(item)} disabled={marking === item.id}
                      style={{ backgroundColor: marking===item.id ? '#94A3B8' : '#7C3AED', borderRadius:8, paddingHorizontal:14, paddingVertical:7 }}>
                      {marking===item.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>+ Add</Text>}
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

function AttendanceTab({ sessionId }) {
  const { theme } = useTheme();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchTrainingAttendance(sessionId);
      setRecords(Array.isArray(data) ? data : []);
    } catch(e) {} finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (rec, newStatus) => {
    try {
      await markTrainingAttendance(sessionId, { employeeId: rec.employee_id, attendanceStatus: newStatus });
      setRecords(prev => prev.map(r => r.id === rec.id ? { ...r, attendance_status: newStatus } : r));
    } catch(e) { Alert.alert('Error', e.message || 'Failed'); }
  };

  const remove = async (rec) => {
    Alert.alert('Remove', 'Remove this attendance record?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await deleteTrainingAttendanceRecord(sessionId, rec.employee_id, rec.id);
          setRecords(prev => prev.filter(r => r.id !== rec.id));
        } catch(e) { Alert.alert('Error', e.message || 'Failed'); }
      }},
    ]);
  };

  const alreadyAdded = new Set(records.map(r => r.employee_id));

  if (loading) return <ActivityIndicator color={theme.primary} style={{ margin:24 }} />;

  return (
    <View style={{ padding:16 }}>
      <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <Text style={{ fontSize:14, fontWeight:'700', color:theme.textSecondary }}>{records.length} employees</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)}
          style={{ flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#7C3AED', paddingHorizontal:14, paddingVertical:8, borderRadius:8 }}>
          <MaterialCommunityIcons name="plus" size={16} color="#fff" />
          <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>Add Employee</Text>
        </TouchableOpacity>
      </View>
      {records.length === 0 ? (
        <Text style={{ textAlign:'center', color:theme.textMuted, marginTop:24 }}>No attendance records yet.</Text>
      ) : records.map(rec => (
        <AttRow key={rec.id} item={rec} onToggle={(s) => toggle(rec, s)} onRemove={() => remove(rec)} />
      ))}
      <AddEmployeeModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        sessionId={sessionId}
        alreadyAdded={alreadyAdded}
        onAdded={(r) => { setRecords(prev => [...prev, { ...r, id: Date.now() }]); }}
      />
    </View>
  );
}

function DocumentsTab({ sessionId }) {
  const { theme } = useTheme();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchTrainingDocuments(sessionId);
      setDocs(Array.isArray(data) ? data : []);
    } catch(e) {} finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const pickAndUpload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission required', 'Allow access to photos.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets || !res.assets[0]) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const uploaded = await uploadTrainingDocument(sessionId, asset.uri, asset.fileName || 'photo.jpg', 'image');
      setDocs(prev => [...prev, uploaded]);
    } catch(e) { Alert.alert('Error', e.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  if (loading) return <ActivityIndicator color={theme.primary} style={{ margin:24 }} />;

  return (
    <View style={{ padding:16 }}>
      <TouchableOpacity onPress={pickAndUpload} disabled={uploading}
        style={{ flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#7C3AED', paddingHorizontal:16, paddingVertical:10, borderRadius:8, marginBottom:16, alignSelf:'flex-start' }}>
        {uploading ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="upload" size={18} color="#fff" />}
        <Text style={{ color:'#fff', fontWeight:'700' }}>{uploading ? 'Uploading...' : 'Upload Document'}</Text>
      </TouchableOpacity>
      {docs.length === 0 ? (
        <Text style={{ textAlign:'center', color:theme.textMuted }}>No documents uploaded yet.</Text>
      ) : (
        <View style={{ gap:10 }}>
          {docs.map((doc, i) => (
            <View key={doc.id || i} style={{ borderRadius:12, borderWidth:1, borderColor:theme.border, backgroundColor:theme.surface, overflow:'hidden' }}>
              {doc.file_url && (doc.file_url.endsWith('.jpg') || doc.file_url.endsWith('.jpeg') || doc.file_url.endsWith('.png')) ? (
                <Image source={{ uri: doc.file_url }} style={{ width:'100%', height:200, resizeMode:'cover' }} />
              ) : (
                <View style={{ padding:16, flexDirection:'row', alignItems:'center', gap:10 }}>
                  <MaterialCommunityIcons name="file-document-outline" size={28} color="#7C3AED" />
                  <Text style={{ color:theme.textPrimary, fontWeight:'600', flex:1 }} numberOfLines={1}>{doc.file_name || doc.original_name || 'Document'}</Text>
                </View>
              )}
              {doc.document_type && (
                <Text style={{ padding:8, fontSize:12, color:theme.textSecondary, textTransform:'capitalize' }}>{doc.document_type}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function TrainingSessionDetailScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams();
  const id = Number(params.sessionId);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchTrainingSession(id);
      setSession(data);
    } catch(e) {} finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex:1, backgroundColor:theme.background }} edges={['top']}>
        <Header title="Training Session" showBack />
        <ActivityIndicator color={theme.primary} style={{ marginTop:48 }} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={{ flex:1, backgroundColor:theme.background }} edges={['top']}>
        <Header title="Training Session" showBack />
        <Text style={{ textAlign:'center', marginTop:48, color:theme.textSecondary }}>Session not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:theme.background }} edges={['top']}>
      <Header title={session.title} showBack />

      <View style={{ backgroundColor:'#7C3AED', paddingHorizontal:16, paddingVertical:12, flexDirection:'row', alignItems:'center' }}>
        <View style={{ flex:1 }}>
          <Text style={{ color:'rgba(255,255,255,0.75)', fontSize:11, fontWeight:'700' }}>{session.session_number}</Text>
          <Text style={{ color:'#fff', fontSize:14, fontWeight:'600', marginTop:2 }}>
            {session.training_date ? new Date(session.training_date).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'long'}) : '-'}
          </Text>
        </View>
        <View style={{ alignItems:'flex-end', gap:4 }}>
          <Text style={{ color:'rgba(255,255,255,0.9)', fontSize:12, fontWeight:'600' }}>{session.total_registered || 0} Enrolled</Text>
          <Text style={{ color:'rgba(255,255,255,0.9)', fontSize:12, fontWeight:'600' }}>{session.total_present || 0} Present</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <InfoTab session={session} onStatusChange={s => setSession(p => p ? { ...p, status: s } : p)} />
          <SectionDivider title="Attendance" />
          <AttendanceTab sessionId={id} />
          <SectionDivider title="Documents" />
          <DocumentsTab sessionId={id} />
          {session.status !== 'completed' && (
            <View style={{ padding:16 }}>
              <TouchableOpacity
                style={{ backgroundColor:'#16a34a', borderRadius:10, paddingVertical:14, alignItems:'center' }}
                onPress={() => {
                  Alert.alert('Mark as Completed', 'Mark this training session as completed?', [
                    { text:'Cancel', style:'cancel' },
                    { text:'Confirm', style:'default', onPress: async () => {
                      try {
                        await updateTrainingSession(String(id), { status:'completed' });
                        setSession(p => p ? { ...p, status:'completed' } : p);
                      } catch(e) { Alert.alert('Error', e.message || 'Failed'); }
                    }},
                  ]);
                }}
              >
                <Text style={{ color:'#fff', fontWeight:'700', fontSize:15 }}>Mark as Completed</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={{ height:48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
