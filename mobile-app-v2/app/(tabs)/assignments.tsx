import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { fetchTeamStats, fetchTeamAssignments, fetchMyChecklists } from '../../utils/api';
import { useTheme, Typography, Spacing, Radius, Shadows } from '../../utils/theme';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

function MemberCard({ member }: { member: any }) {
  const { theme } = useTheme();
  const completion = member.totalAssigned > 0
    ? Math.round((member.completedToday / member.totalAssigned) * 100)
    : 0;

  return (
    <View style={[styles.memberCard, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
      <View style={[styles.avatar, { backgroundColor: theme.primaryBg }]}>
        <Text style={[styles.avatarText, { color: theme.primary }]}>
          {(member.fullName ?? 'U').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.memberBody}>
        <Text style={[styles.memberName, { color: theme.textPrimary }]} numberOfLines={1}>{member.fullName}</Text>
        <View style={[styles.progressBg, { backgroundColor: theme.border }]}>
          <View style={[styles.progressFill, { backgroundColor: completion === 100 ? theme.success : theme.primary, width: `${completion}%` as any }]} />
        </View>
        <Text style={[styles.memberStats, { color: theme.textSecondary }]}>
          {member.completedToday}/{member.totalAssigned} completed · {completion}%
        </Text>
      </View>
      <TouchableOpacity
        hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
        onPress={() => router.push({ pathname: '/assign-template', params: { userId: member.id, userName: member.fullName } })}
      >
        <MaterialCommunityIcons name="plus-circle-outline" size={24} color={theme.primary} />
      </TouchableOpacity>
    </View>
  );
}

export default function AssignmentsTab() {
  const { theme } = useTheme();
  const [stats,      setStats]      = useState<any>(null);
  const [team,       setTeam]       = useState<any[]>([]);
  const [myTasks,    setMyTasks]    = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, t, my] = await Promise.allSettled([fetchTeamStats(), fetchTeamAssignments(), fetchMyChecklists()]);
      if (s.status  === 'fulfilled') setStats(s.value);
      if (t.status  === 'fulfilled') setTeam(t.value as any[]);
      if (my.status === 'fulfilled') setMyTasks(my.value as any[]);
    } catch { /* silent */ } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>My Team</Text>
        <TouchableOpacity onPress={() => router.push('/work-orders')} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
          <MaterialCommunityIcons name="briefcase-outline" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats row */}
          {stats ? (
            <View style={styles.statsRow}>
              {[
                { label: 'Members', value: stats.totalMembers ?? 0, color: theme.primary },
                { label: 'Completed', value: stats.completedToday ?? 0, color: theme.success },
                { label: 'Pending', value: stats.pendingToday ?? 0, color: theme.warning },
              ].map((s) => (
                <View key={s.label} style={[styles.statCard, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                  <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Action buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary }]} onPress={() => router.push('/assign-template')}>
              <MaterialCommunityIcons name="clipboard-plus-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Assign Template</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.secondary ?? '#7C3AED' }]} onPress={() => router.push('/work-orders')}>
              <MaterialCommunityIcons name="briefcase-plus-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Work Orders</Text>
            </TouchableOpacity>
          </View>

          {/* My Tasks */}
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>MY ASSIGNED TASKS</Text>
          {myTasks.length === 0 ? (
            <View style={[styles.emptyTasks, { backgroundColor: theme.surface }]}>
              <Text style={[styles.emptyTasksText, { color: theme.textSecondary }]}>No tasks assigned to you yet.</Text>
            </View>
          ) : myTasks.map((item) => {
            const isLogsheet = item.templateType === 'logsheet';
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.taskCard, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight, borderLeftColor: isLogsheet ? '#7C3AED' : theme.primary, borderLeftWidth: 4 }]}
                onPress={() => router.push({ pathname: '/checklist-entry', params: { assignmentId: item.id, assetId: item.assetId, templateId: item.templateId, templateType: item.templateType ?? 'checklist', templateName: item.templateName, assetName: item.assetName } })}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={isLogsheet ? 'table-large' : 'clipboard-check-outline'}
                  size={22}
                  color={isLogsheet ? '#7C3AED' : theme.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.taskName, { color: theme.textPrimary }]} numberOfLines={1}>{item.templateName}</Text>
                  <Text style={[styles.taskAsset, { color: theme.textSecondary }]} numberOfLines={1}>{item.assetName}</Text>
                </View>
                <StatusBadge label={item.completedToday ? 'Done' : 'Pending'} variant={item.completedToday ? 'success' : 'warning'} />
              </TouchableOpacity>
            );
          })}

          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>TEAM MEMBERS</Text>

          {team.length === 0
            ? <EmptyState icon="account-group-outline" title="No team members" message="Team members assigned to you will appear here." />
            : team.map((m) => <MemberCard key={m.id} member={m} />)
          }
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, borderBottomWidth: 1 },
  headerTitle: { ...Typography.h2 },
  scroll:      { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  statsRow:    { flexDirection: 'row', gap: Spacing.md },
  statCard:    { flex: 1, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', borderWidth: 1 },
  statValue:   { ...Typography.h2 },
  statLabel:   { ...Typography.micro, marginTop: 2, fontWeight: '600' },
  actionsRow:  { flexDirection: 'row', gap: Spacing.md },
  actionBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md + 2, borderRadius: Radius.lg, ...Shadows.sm },
  actionBtnText:{ ...Typography.label, color: '#fff', fontWeight: '700' },
  sectionLabel:{ ...Typography.overline },
  memberCard:  { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md, borderWidth: 1 },
  avatar:      { width: 46, height: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { ...Typography.h3 },
  memberBody:  { flex: 1, gap: 4 },
  memberName:  { ...Typography.h4 },
  progressBg:  { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:{ height: 6, borderRadius: 3 },
  memberStats: { ...Typography.micro },
  taskCard:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1 },
  taskName:    { ...Typography.h4 },
  taskAsset:   { ...Typography.bodyS, marginTop: 2 },
  emptyTasks:  { borderRadius: Radius.lg, padding: Spacing.lg, alignItems: 'center' },
  emptyTasksText: { ...Typography.body },
});
