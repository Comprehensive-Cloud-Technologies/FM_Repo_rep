import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createTrainingSession, fetchTrainingSessions } from '../utils/api';
import { useTheme } from '../utils/theme';
import Header from '../components/Header';

const STATUS_COLOR = { scheduled: '#2563EB', in_progress: '#D97706', completed: '#059669', cancelled: '#64748B', overdue: '#DC2626' };

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLOR[status as keyof typeof STATUS_COLOR] || '#64748B';
  return <View style={[sp.pill,{backgroundColor:color+'18',borderColor:color+'40'}]}><Text style={[sp.text,{color}]}>{status.replace(/_/g,' ')}</Text></View>;
}
const sp = StyleSheet.create({ pill:{borderRadius:20,borderWidth:1,paddingHorizontal:10,paddingVertical:3}, text:{fontSize:11,fontWeight:'700',textTransform:'capitalize'} });

function SessionCard({ item, onPress }: { item: any; onPress: () => void }) {
  const { theme } = useTheme();
  const date = item.training_date ? new Date(item.training_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '-';
  const time = item.start_time ? item.start_time.slice(0,5) : null;
  return (
    <TouchableOpacity style={[sc.card,{backgroundColor:theme.surface,borderColor:theme.border}]} onPress={onPress} activeOpacity={0.8}>
      <View style={sc.row}>
        <View style={[sc.iconBox,{backgroundColor:'#F5F3FF'}]}>
          <MaterialCommunityIcons name='school-outline' size={22} color='#7C3AED' />
        </View>
        <View style={{flex:1}}>
          <Text style={[sc.title,{color:theme.textPrimary}]} numberOfLines={2}>{item.title}</Text>
          <Text style={[sc.sub,{color:theme.textSecondary}]}>{date}{time ? ' - '+time : ''}</Text>
        </View>
        <StatusPill status={item.status || 'scheduled'} />
      </View>
      <View style={sc.footer}>
        <Text style={[sc.chipText,{color:'#64748B'}]}>{item.trainer_name || 'No trainer'}</Text>
        <Text style={[sc.chipText,{color:'#64748B'}]}>{(item.total_present||0)+'/'+(item.total_registered||0)+' present'}</Text>
      </View>
      {item.session_number ? <Text style={[sc.sessionNo,{color:'#7C3AED'}]}>{item.session_number}</Text> : null}
    </TouchableOpacity>
  );
}
const sc = StyleSheet.create({
  card:{borderRadius:16,padding:16,gap:8,borderWidth:1,elevation:2,marginBottom:12},
  row:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  iconBox:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center'},
  title:{fontSize:15,fontWeight:'700',flexShrink:1},
  sub:{fontSize:12,marginTop:2},
  footer:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:4},
  chipText:{fontSize:12},
  sessionNo:{fontSize:11,fontWeight:'700',marginTop:4},
});

const TABS = [{key:'all',label:'All'},{key:'scheduled',label:'Scheduled'},{key:'completed',label:'Completed'},{key:'overdue',label:'Overdue'}];

function Field({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={{gap:4,marginBottom:12}}>
      <Text style={{fontSize:12,fontWeight:'600',color:theme.textSecondary}}>{label}</Text>
      <TextInput
        style={{borderWidth:1,borderRadius:12,paddingHorizontal:16,paddingVertical:8,fontSize:15,backgroundColor:theme.inputBg,borderColor:theme.inputBorder,color:theme.inputText,height:multiline?80:44}}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.inputPlaceholder}
        multiline={multiline}
        textAlignVertical={multiline?'top':undefined}
        autoCapitalize='sentences'
      />
    </View>
  );
}

function CreateModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (s: any) => void }) {
  const { theme } = useTheme();
  const [title,setTitle] = useState('');
  const [trainerName,setTrainerName] = useState('');
  const [notes,setNotes] = useState('');
  const [trainingDate,setTrainingDate] = useState('');
  const [startTime,setStartTime] = useState('');
  const [endTime,setEndTime] = useState('');
  const [saving,setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return Alert.alert('Required','Training title is required');
    setSaving(true);
    try {
      const created = await createTrainingSession({ title:title.trim(), trainerName:trainerName.trim()||undefined, trainingDate:trainingDate||new Date().toISOString().slice(0,10), startTime:startTime||undefined, endTime:endTime||undefined, notes:notes.trim()||undefined, status:'scheduled' });
      onCreated(created);
      setTitle(''); setTrainerName(''); setNotes(''); setTrainingDate(''); setStartTime(''); setEndTime('');
    } catch(e: any) { Alert.alert('Error',(e?.message)||'Failed to create session'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType='slide' presentationStyle='pageSheet' onRequestClose={onClose}>
      <SafeAreaView style={{flex:1,backgroundColor:theme.background}} edges={['top','bottom']}>
        <View style={[cm.header,{borderBottomColor:theme.border}]}>
          <TouchableOpacity onPress={onClose}><Text style={{color:theme.danger,fontWeight:'600',fontSize:15}}>Cancel</Text></TouchableOpacity>
          <Text style={[cm.title,{color:theme.textPrimary}]}>New Training Session</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={theme.primary} size='small' /> : <Text style={{color:theme.primary,fontWeight:'700',fontSize:15}}>Save</Text>}
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
          <ScrollView contentContainerStyle={cm.scroll} keyboardShouldPersistTaps='handled'>
            <Field label='Title *' value={title} onChange={setTitle} placeholder='e.g. Fire Safety Training' />
            <Field label='Trainer Name' value={trainerName} onChange={setTrainerName} placeholder='e.g. Dr. Singh' />
            <Field label='Training Date (YYYY-MM-DD)' value={trainingDate} onChange={setTrainingDate} placeholder={new Date().toISOString().slice(0,10)} />
            <Field label='Start Time (HH:MM)' value={startTime} onChange={setStartTime} placeholder='09:00' />
            <Field label='End Time (HH:MM)' value={endTime} onChange={setEndTime} placeholder='17:00' />
            <Field label='Notes' value={notes} onChange={setNotes} placeholder='Additional details...' multiline />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
const cm = StyleSheet.create({ header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:16,paddingVertical:12,borderBottomWidth:1}, title:{fontSize:16,fontWeight:'800'}, scroll:{padding:16,paddingBottom:48} });

export default function TrainingSessionsScreen() {
  const { theme } = useTheme();
  const [sessions,setSessions] = useState<any[]>([]);
  const [activeTab,setActiveTab] = useState('all');
  const [search,setSearch] = useState('');
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [showCreate,setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const from = new Date(now.getFullYear()-1,0,1).toISOString().slice(0,10);
      const to = new Date(now.getFullYear()+1,11,31).toISOString().slice(0,10);
      const data = await fetchTrainingSessions({from,to});
      setSessions(Array.isArray(data)?data:[]);
    } catch(_e) {} finally { setLoading(false); setRefreshing(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  const displayed = useMemo(()=>{
    let list = sessions;
    if (activeTab!=='all') list=list.filter(s=>s.status===activeTab);
    if (search.trim()) { const q=search.toLowerCase(); list=list.filter(s=>(s.title&&s.title.toLowerCase().includes(q))||(s.trainer_name&&s.trainer_name.toLowerCase().includes(q))); }
    return list;
  },[sessions,activeTab,search]);

  return (
    <SafeAreaView style={[sts.safe,{backgroundColor:theme.background}]} edges={['top']}>
      <Header title='Training Sessions' showBack />

      <View style={[sts.searchRow,{borderBottomColor:theme.border}]}>
        <View style={[sts.searchBox,{backgroundColor:theme.surfaceAlt,borderColor:theme.border}]}>
          <MaterialCommunityIcons name='magnify' size={18} color={theme.textMuted} />
          <TextInput style={[sts.searchInput,{color:theme.inputText}]} value={search} onChangeText={setSearch} placeholder='Search sessions...' placeholderTextColor={theme.inputPlaceholder} />
          {search?<TouchableOpacity onPress={()=>setSearch('')}><MaterialCommunityIcons name='close-circle' size={16} color={theme.textMuted} /></TouchableOpacity>:null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[sts.tabBar,{borderBottomColor:theme.border}]} contentContainerStyle={{paddingHorizontal:12,gap:8}}>
        {TABS.map(t=>{
          const cnt=sessions.filter(s=>t.key==='all'||s.status===t.key).length;
          const active=activeTab===t.key;
          return (
            <TouchableOpacity key={t.key} style={[sts.tab,active&&{backgroundColor:'#7C3AED',borderColor:'#7C3AED'},!active&&{borderColor:theme.border}]} onPress={()=>setActiveTab(t.key)}>
              <Text style={[sts.tabText,{color:active?'#fff':theme.textSecondary}]}>{t.label}</Text>
              <View style={[sts.tabBadge,{backgroundColor:active?'rgba(255,255,255,0.3)':theme.surfaceAlt}]}><Text style={{fontSize:10,fontWeight:'700',color:active?'#fff':theme.textMuted}}>{cnt}</Text></View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? <ActivityIndicator color={theme.primary} style={{marginTop:32}} /> : (
        <ScrollView contentContainerStyle={displayed.length===0?{flex:1}:sts.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={theme.primary} />} showsVerticalScrollIndicator={false}>
          {displayed.length===0 ? (
            <View style={{flex:1,alignItems:'center',justifyContent:'center',gap:12,padding:24}}>
              <MaterialCommunityIcons name='school-outline' size={48} color={theme.textMuted} />
              <Text style={{fontSize:18,fontWeight:'700',color:theme.textSecondary,textAlign:'center'}}>No training sessions</Text>
              <Text style={{fontSize:13,color:theme.textMuted,textAlign:'center'}}>Tap + to schedule a new session</Text>
            </View>
          ) : displayed.map(s=>(
            <SessionCard key={s.id} item={s} onPress={()=>router.push({pathname:'/training-session-detail',params:{sessionId:String(s.id)}})} />
          ))}
        </ScrollView>
      )}

      <TouchableOpacity style={[sts.fab,{backgroundColor:'#7C3AED'}]} onPress={()=>setShowCreate(true)} activeOpacity={0.85}>
        <MaterialCommunityIcons name='plus' size={28} color='#fff' />
      </TouchableOpacity>

      <CreateModal visible={showCreate} onClose={()=>setShowCreate(false)} onCreated={(s: any)=>{setSessions((prev: any[])=>[s,...prev]);setShowCreate(false);}} />
    </SafeAreaView>
  );
}

const sts = StyleSheet.create({
  safe:{flex:1},
  searchRow:{paddingHorizontal:16,paddingVertical:8,borderBottomWidth:1},
  searchBox:{flexDirection:'row',alignItems:'center',gap:8,borderRadius:999,borderWidth:1,paddingHorizontal:12,height:40},
  searchInput:{flex:1,fontSize:14},
  tabBar:{flexGrow:0,borderBottomWidth:1,paddingVertical:8},
  tab:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:14,paddingVertical:7,borderRadius:999,borderWidth:1},
  tabText:{fontSize:13,fontWeight:'600'},
  tabBadge:{borderRadius:10,paddingHorizontal:6,paddingVertical:1},
  list:{padding:16,gap:12,paddingBottom:80},
  fab:{position:'absolute',bottom:24,right:24,width:56,height:56,borderRadius:28,alignItems:'center',justifyContent:'center',elevation:6},
});