import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { Button, Segmented } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/inputs';
import { useToast } from '@/components/ui/overlays';
import {
  Card,
  EmptyState,
  Pill,
  ProgressBar,
  StatCard,
  StatGrid,
  withAlpha,
} from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { attendanceStatusMeta, Space, type AttendanceStatus } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/lib/errors';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';

const STATUSES: AttendanceStatus[] = ['present', 'late', 'excused', 'absent'];

export default function CoordinatorAttendance() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const accent = useRoleTheme().coordinator.accent;
  const toast = useToast();
  const router = useRouter();
  const sessions = useQuery(api.sessions.list, {});
  const [sessionId, setSessionId] = useState<Id<'attendanceSessions'> | null>(null);
  const [search, setSearch] = useState('');
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [busyTeam, setBusyTeam] = useState<string | null>(null);

  // Derived, not an effect: default to the newest session until one is picked.
  const activeSessionId = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    if (sessionId && sessions.some((s) => s._id === sessionId)) return sessionId;
    return sessions[sessions.length - 1]._id;
  }, [sessionId, sessions]);

  const board = useQuery(
    api.attendance.board,
    activeSessionId ? { sessionId: activeSessionId } : 'skip',
  );
  const summary = useQuery(
    api.attendance.sessionSummary,
    activeSessionId ? { sessionId: activeSessionId } : 'skip',
  );
  const mark = useMutation(api.attendance.mark);
  const markTeam = useMutation(api.attendance.markTeam);

  const rows = useMemo(() => {
    const list = board ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.code.toLowerCase().includes(needle) ||
        r.members.some((m) => m.name.toLowerCase().includes(needle)),
    );
  }, [board, search]);

  async function setStatus(memberId: string, status: AttendanceStatus) {
    if (!activeSessionId) return;
    setBusyMember(memberId);
    try {
      await mark({
        sessionId: activeSessionId,
        memberId: memberId as Id<'members'>,
        status,
      });
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusyMember(null);
    }
  }

  async function markWholeTeam(teamId: string, status: AttendanceStatus) {
    if (!activeSessionId) return;
    setBusyTeam(teamId);
    try {
      const result = await markTeam({
        sessionId: activeSessionId,
        teamId: teamId as Id<'teams'>,
        status,
      });
      toast.show(`${result.marked} marked ${status}`, 'success');
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusyTeam(null);
    }
  }

  if (sessions === undefined) {
    return (
      <Screen gradient={RoleTheme.coordinator.gradient} bottomInset={TAB_BAR_INSET}>
        <ScreenLoading label="Loading sessions" />
      </Screen>
    );
  }

  return (
    <Screen gradient={RoleTheme.coordinator.gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow="Coordinator"
        title="Mark attendance"
        subtitle="Scan a badge to jump straight to a team, or find it in the list below."
      />

      <Button
        label="Scan a team badge"
        icon="qrcode-scan"
        accent={accent}
        onPress={() => router.push('/scan' as never)}
        full
      />

      {sessions.length === 0 ? (
        <EmptyState
          icon="calendar-blank-outline"
          title="No sessions open"
          message="Organisers create attendance sessions from Setup."
        />
      ) : (
        <>
          <Segmented
            accent={accent}
            scrollable
            value={(activeSessionId ?? sessions[0]._id) as string}
            onChange={(value) => setSessionId(value as Id<'attendanceSessions'>)}
            options={sessions.map((s) => ({ value: s._id as string, label: s.name }))}
          />

          <StatGrid>
            <StatCard
              label="Present"
              value={summary ? summary.present : '—'}
              sub={summary ? `${summary.rate}% of ${summary.total}` : undefined}
              icon="account-check-outline"
              color={Brand.green}
            />
            <StatCard
              label="Still to mark"
              value={summary ? summary.pending : '—'}
              icon="progress-clock"
              color={Brand.amber}
            />
          </StatGrid>

          <SearchInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search team or member"
            accent={accent}
          />

          {board === undefined ? (
            <ScreenLoading label="Loading board" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="account-group-outline"
              title={search ? 'No match' : 'No teams assigned to you'}
              message="Ask an organiser to assign teams or a lab to your account."
            />
          ) : (
            <View style={styles.list}>
              {rows.map((row) => {
                const open = openTeam === row.teamId;
                const complete = row.marked >= row.total && row.total > 0;
                const tone = complete
                  ? row.present === row.total
                    ? Brand.green
                    : Brand.amber
                  : Brand.textFaint;

                return (
                  <Card key={row.teamId} accent={tone}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setOpenTeam(open ? null : row.teamId)}>
                      <View style={styles.teamHead}>
                        <View style={styles.flex}>
                          <Text style={styles.code}>{row.code}</Text>
                          <Text style={styles.teamName} numberOfLines={1}>
                            {row.name}
                          </Text>
                          <Text style={styles.teamMeta}>
                            {[row.labName, row.tableNo ? `Table ${row.tableNo}` : null]
                              .filter(Boolean)
                              .join(' · ') || 'No lab assigned'}
                          </Text>
                        </View>
                        <View style={[styles.countBox, { backgroundColor: withAlpha(tone, 0.13) }]}>
                          <Text style={[styles.count, { color: tone }]}>
                            {row.present}
                            <Text style={styles.countTotal}>/{row.total}</Text>
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name={open ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color={Brand.textFaint}
                        />
                      </View>
                      <View style={styles.bar}>
                        <ProgressBar value={row.present} max={Math.max(1, row.total)} color={tone} height={5} />
                      </View>
                    </Pressable>

                    {open && (
                      <View style={styles.body}>
                        {!row.canMark && (
                          <Pill label="Read only" color={Brand.amber} icon="lock-outline" compact />
                        )}

                        {row.members.length === 0 ? (
                          <Text style={styles.noMembers}>No members recorded for this team.</Text>
                        ) : (
                          row.members.map((member) => (
                            <View key={member._id} style={styles.memberBlock}>
                              <View style={styles.memberHead}>
                                <Text style={styles.memberName} numberOfLines={1}>
                                  {member.name}
                                </Text>
                                {member.isLeader && (
                                  <Pill label="Leader" color={Brand.amber} compact />
                                )}
                              </View>

                              <View style={styles.statusRow}>
                                {STATUSES.map((status) => {
                                  const meta = attendanceStatusMeta(Brand)[status];
                                  const active = member.status === status;
                                  const disabled =
                                    !row.canMark || busyMember === member._id;
                                  return (
                                    <Pressable
                                      key={status}
                                      accessibilityRole="button"
                                      accessibilityLabel={`${member.name} ${meta.label}`}
                                      disabled={disabled}
                                      onPress={() => setStatus(member._id, status)}
                                      style={({ pressed }) => [
                                        styles.statusChip,
                                        {
                                          backgroundColor: active
                                            ? withAlpha(meta.color, 0.18)
                                            : Brand.surfaceStrong,
                                          borderColor: active
                                            ? withAlpha(meta.color, 0.45)
                                            : Brand.borderSubtle,
                                          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
                                        },
                                      ]}>
                                      <MaterialCommunityIcons
                                        name={meta.icon as never}
                                        size={12}
                                        color={active ? meta.color : Brand.textFaint}
                                      />
                                      <Text
                                        style={[
                                          styles.statusText,
                                          { color: active ? meta.color : Brand.textFaint },
                                        ]}>
                                        {meta.label}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          ))
                        )}

                        {row.canMark && row.members.length > 0 && (
                          <View style={styles.bulkRow}>
                            <Button
                              label="All present"
                              size="sm"
                              icon="check-all"
                              accent={Brand.green}
                              loading={busyTeam === row.teamId}
                              onPress={() => markWholeTeam(row.teamId, 'present')}
                              style={styles.flex}
                            />
                            <Button
                              label="All absent"
                              size="sm"
                              variant="secondary"
                              icon="close-circle-outline"
                              accent={Brand.red}
                              loading={busyTeam === row.teamId}
                              onPress={() => markWholeTeam(row.teamId, 'absent')}
                              style={styles.flex}
                            />
                          </View>
                        )}
                      </View>
                    )}
                  </Card>
                );
              })}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  list: { gap: Space.md },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  code: { color: Brand.textFaint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  teamName: { color: Brand.text, fontSize: 15.5, fontWeight: '700', marginTop: 2 },
  teamMeta: { color: Brand.textMuted, fontSize: 11.5, marginTop: 2 },
  countBox: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 12 },
  count: { fontSize: 16, fontWeight: '800' },
  countTotal: { fontSize: 11.5, color: Brand.textFaint },
  bar: { marginTop: Space.md },

  body: {
    marginTop: Space.lg,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderSubtle,
    gap: Space.lg,
  },
  noMembers: { color: Brand.textFaint, fontSize: 12.5 },
  memberBlock: { gap: Space.sm },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  memberName: { color: Brand.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  statusRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  statusText: { fontSize: 11.5, fontWeight: '700' },
  bulkRow: { flexDirection: 'row', gap: Space.sm },
}));
