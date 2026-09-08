import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import { Image } from 'expo-image';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { TeamEditorSheet, type EditableTeam } from '@/components/team-editor';
import { Button } from '@/components/ui/button';
import {
  Avatar,
  Card,
  EmptyState,
  KeyValue,
  Pill,
  ProgressBar,
  Section,
  withAlpha,
} from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { paymentStatusMeta, Space, type PaymentStatus } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useSession } from '@/lib/session';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';

export default function TeamDetail() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { status, profile, roles } = useSession();
  const [editing, setEditing] = useState(false);

  const data = useQuery(
    api.teams.get,
    profile && profile.role !== 'participant' ? { teamId: id as Id<'teams'> } : 'skip',
  );

  if (status === 'loading') {
    return (
      <Screen scroll={false}>
        <ScreenLoading />
      </Screen>
    );
  }
  if (!profile) return <Redirect href="/" />;
  if (profile.role === 'participant') return <Redirect href="/participant" />;

  const theme = RoleTheme[profile.role];
  const canScore = profile.role === 'evaluator' || profile.role === 'admin';

  if (data === undefined) {
    return (
      <Screen gradient={theme.gradient}>
        <BackRow onPress={() => router.back()} />
        <ScreenLoading label="Loading team" />
      </Screen>
    );
  }

  if (data === null) {
    return (
      <Screen gradient={theme.gradient}>
        <BackRow onPress={() => router.back()} />
        <EmptyState
          icon="alert-circle-outline"
          title="Team not found"
          message="It may have been removed by an organiser."
        />
      </Screen>
    );
  }

  const { team, members, attendanceBySession, scores } = data;
  const payment = paymentStatusMeta(Brand)[(team.paymentStatus ?? 'pending') as PaymentStatus];
  const mySheet = scores.find((s) => s.evaluatorId === profile._id);

  return (
    <Screen gradient={theme.gradient}>
      <BackRow onPress={() => router.back()} />

      <ScreenHeader
        eyebrow={team.code}
        title={team.name}
        subtitle={team.projectTitle ?? 'No project title recorded.'}
        right={
          team.status !== 'active' ? <Pill label={team.status} color={Brand.red} /> : undefined
        }
      />

      {roles.includes('admin') && (
        <Button
          label="Edit this team"
          icon="pencil-outline"
          variant="secondary"
          accent={theme.accent}
          full
          onPress={() => setEditing(true)}
        />
      )}

      {!!team.photoUrl && (
        <Image source={{ uri: team.photoUrl }} style={styles.hero} contentFit="cover" transition={200} />
      )}

      {roles.includes('admin') && (
        <TeamEditorSheet
          visible={editing}
          team={team as unknown as EditableTeam}
          accent={theme.accent}
          onClose={() => setEditing(false)}
          onDeleted={() => router.back()}
        />
      )}

      {canScore && (
        <Button
          label={mySheet?.submitted ? 'Update your score' : 'Score this team'}
          icon="clipboard-check-outline"
          accent={theme.accent}
          size="lg"
          full
          onPress={() => router.push({ pathname: '/score/[id]', params: { id: team._id } })}
        />
      )}


      <Section title="Project">
        <Card>
          <View style={styles.kvGrid}>
            <KeyValue label="Problem statement" value={team.problemStatementId} color={theme.accent} />
            <KeyValue label="Track" value={team.track} />
            <KeyValue label="Domain" value={team.domain} />
            <KeyValue label="College" value={team.college} />
          </View>
          {!!team.notes && <Text style={styles.notes}>{team.notes}</Text>}
        </Card>
      </Section>

      <Section title="Logistics">
        <Card>
          <View style={styles.kvGrid}>
            <KeyValue label="Lab" value={team.labName} color={Brand.green} />
            <KeyValue label="Block" value={team.labBlock} />
            <KeyValue label="Table" value={team.tableNo} />
            <KeyValue label="Coordinator" value={team.coordinatorName} />
          </View>

          <View style={styles.paymentRow}>
            <Pill label={payment.label} color={payment.color} icon={payment.icon as never} />
            {team.paymentAmount != null && (
              <Text style={styles.amount}>₹{team.paymentAmount.toLocaleString('en-IN')}</Text>
            )}
            {!!team.coordinatorPhone && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Call coordinator"
                onPress={() => Linking.openURL(`tel:${team.coordinatorPhone}`).catch(() => {})}
                style={[styles.call, { backgroundColor: withAlpha(Brand.green, 0.14) }]}>
                <MaterialCommunityIcons name="phone" size={15} color={Brand.green} />
              </Pressable>
            )}
          </View>
        </Card>
      </Section>

      <Section title="Members" hint={`${members.length} registered`}>
        <View style={styles.list}>
          {members.map((member) => (
            <Card key={member._id}>
              <View style={styles.memberRow}>
                {member.photoUrl ? (
                  <Image
                    source={{ uri: member.photoUrl }}
                    style={styles.memberPhoto}
                    contentFit="cover"
                    transition={150}
                  />
                ) : (
                  <Avatar name={member.name} size={42} color={theme.accent} />
                )}
                <View style={styles.flex}>
                  <View style={styles.memberNameRow}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.name}
                    </Text>
                    {member.isLeader && <Pill label="Leader" color={Brand.amber} compact />}
                  </View>
                  <Text style={styles.memberMeta} numberOfLines={1}>
                    {[member.rollNo, member.department, member.year].filter(Boolean).join(' · ') ||
                      'No academic details'}
                  </Text>
                  {!!member.email && (
                    <Text style={styles.memberContact} numberOfLines={1}>
                      {member.email}
                    </Text>
                  )}
                </View>
                {!!member.phone && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${member.name}`}
                    onPress={() => Linking.openURL(`tel:${member.phone}`).catch(() => {})}
                    style={styles.mini}>
                    <MaterialCommunityIcons name="phone" size={15} color={Brand.textDim} />
                  </Pressable>
                )}
              </View>
            </Card>
          ))}
        </View>
      </Section>

      <Section title="Attendance">
        <Card>
          {attendanceBySession.length === 0 ? (
            <Text style={styles.notes}>No sessions have been opened yet.</Text>
          ) : (
            <View style={styles.attendance}>
              {attendanceBySession.map((row) => (
                <View key={row.sessionId} style={styles.attendanceRow}>
                  <Text style={styles.sessionName} numberOfLines={1}>
                    {row.sessionName}
                  </Text>
                  <View style={styles.attendanceBar}>
                    <ProgressBar
                      value={row.present}
                      max={Math.max(1, row.total)}
                      color={row.present === row.total ? Brand.green : Brand.amber}
                      height={5}
                    />
                  </View>
                  <Text style={styles.attendanceCount}>
                    {row.present}/{row.total}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </Section>

      {profile.role !== 'coordinator' && (
        <Section
          title={profile.role === 'admin' ? 'Evaluation panel' : 'Your evaluation'}
          hint={
            team.avgPercent == null
              ? 'No submitted scores yet'
              : `Average ${team.avgPercent.toFixed(1)}% across ${team.evaluationCount}`
          }>
          {scores.length === 0 ? (
            <EmptyState
              icon="clipboard-outline"
              title="Not scored yet"
              message={canScore ? 'Open the score sheet above to start.' : undefined}
            />
          ) : (
            <View style={styles.list}>
              {scores.map((sheet) => (
                <Card key={sheet._id} accent={sheet.submitted ? Brand.green : Brand.amber}>
                  <View style={styles.sheetHead}>
                    <View style={styles.flex}>
                      <Text style={styles.sheetName}>{sheet.evaluatorName}</Text>
                      <Text style={styles.sheetMeta}>
                        {sheet.submitted ? 'Submitted' : 'Draft'} ·{' '}
                        {new Date(sheet.updatedAt).toLocaleString([], {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Text style={[styles.sheetScore, { color: theme.accent }]}>
                      {sheet.percent.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.sheetValues}>
                    {sheet.values.map((value) => (
                      <Pill
                        key={value.key}
                        label={`${value.key} ${value.value}`}
                        color={Brand.blue}
                        compact
                      />
                    ))}
                  </View>
                  {!!sheet.notes && <Text style={styles.notes}>{sheet.notes}</Text>}
                </Card>
              ))}
            </View>
          )}
        </Section>
      )}
    </Screen>
  );
}

function BackRow({ onPress }: { onPress: () => void }) {
  const Brand = useColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      hitSlop={12}
      style={styles.back}>
      <MaterialCommunityIcons name="chevron-left" size={22} color={Brand.textDim} />
    </Pressable>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surfaceStrong,
  },
  hero: { width: '100%', height: 160, borderRadius: 16, backgroundColor: Brand.surface },
  kvGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.lg },
  notes: { color: Brand.textMuted, fontSize: 13, lineHeight: 19, marginTop: Space.md },

  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.lg,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderSubtle,
  },
  amount: { color: Brand.textDim, fontSize: 13, fontWeight: '700' },
  call: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  list: { gap: Space.md },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  memberPhoto: { width: 42, height: 42, borderRadius: 21, backgroundColor: Brand.surface },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  memberName: { color: Brand.text, fontSize: 14.5, fontWeight: '700', flexShrink: 1 },
  memberMeta: { color: Brand.textMuted, fontSize: 11.5, marginTop: 2 },
  memberContact: { color: Brand.textFaint, fontSize: 11, marginTop: 1 },
  mini: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.inputBgFocused,
  },

  attendance: { gap: Space.md },
  attendanceRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  sessionName: { color: Brand.textDim, fontSize: 12.5, width: 116 },
  attendanceBar: { flex: 1 },
  attendanceCount: { color: Brand.textFaint, fontSize: 12, fontWeight: '700', width: 40, textAlign: 'right' },

  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  sheetName: { color: Brand.text, fontSize: 14.5, fontWeight: '700' },
  sheetMeta: { color: Brand.textFaint, fontSize: 11, marginTop: 2 },
  sheetScore: { fontSize: 18, fontWeight: '800' },
  sheetValues: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Space.md },
}));
