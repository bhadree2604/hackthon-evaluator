import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { stayLabel } from '@/components/registration-details';
import { ScannerModal } from '@/components/scanner';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/overlays';
import { Card, EmptyState, KeyValue, Pill, Section, withAlpha } from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import {
  attendanceStatusMeta,
  paymentStatusMeta,
  Radius,
  Space,
  type AttendanceStatus,
} from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';

/**
 * Scan a badge, then act on the team behind it.
 *
 * One screen for three roles, because the scan is the same gesture every time
 * and only the follow-up differs: an evaluator picks a round and scores, a
 * coordinator marks attendance, an organiser gets both plus the full record.
 */
export default function ScanScreen() {
  const Brand = useColors();
  const styles = useStyles();
  const router = useRouter();
  const { activeRole, roles } = useSession();

  const role = activeRole ?? roles[0] ?? 'coordinator';
  const accent = useRoleTheme()[role].accent;

  const [scanning, setScanning] = useState(true);
  const [code, setCode] = useState<string | null>(null);

  const lookup = useQuery(api.teams.byCode, code ? { code } : 'skip');
  const looking = code !== null && lookup === undefined;
  const notFound = code !== null && lookup === null;

  const canScore = roles.includes('evaluator') || roles.includes('admin');
  const canMark = roles.includes('coordinator') || roles.includes('admin');

  /**
   * Derived, not an effect: the camera stays up while a code is being looked
   * up, and steps aside as soon as there is something to show.
   */
  const showScanner = scanning && !lookup && !notFound;

  function rescan() {
    setCode(null);
    setScanning(true);
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Scanner"
        title="Scan a badge"
        subtitle={
          lookup
            ? 'Scanned. Choose what to do with this team below.'
            : 'Read a team QR or barcode to pull up the team.'
        }
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.close}>
            <MaterialCommunityIcons name="close" size={20} color={Brand.textMuted} />
          </Pressable>
        }
      />

      {looking && <ScreenLoading label="Looking that team up" />}

      {notFound && (
        <EmptyState
          icon="alert-circle-outline"
          title={`No team with the code ${code}`}
          message="Check the code printed under the barcode on the badge, then try again."
          action={
            <Button label="Scan again" icon="qrcode-scan" accent={accent} onPress={rescan} />
          }
        />
      )}

      {!lookup && !looking && !notFound && (
        <EmptyState
          icon="qrcode-scan"
          title="Nothing scanned yet"
          message="Open the camera and point it at the QR or barcode on a team badge."
          action={
            <Button
              label="Open the camera"
              icon="qrcode-scan"
              accent={accent}
              onPress={() => setScanning(true)}
            />
          }
        />
      )}

      {!!lookup && (
        <>
          <TeamHeader team={lookup.team} accent={accent} />

          {canScore && <ScoreSection teamId={lookup.team._id} accent={accent} />}

          {canMark && (
            <AttendanceSection
              teamId={lookup.team._id}
              teamCode={lookup.team.code}
              accent={accent}
            />
          )}

          <Section title="Members" hint={`${lookup.members.length} on this team`}>
            {lookup.members.map((member) => (
              <Card key={member._id} style={styles.memberCard}>
                <View style={styles.flex}>
                  <View style={styles.memberTop}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    {member.isLeader && (
                      <Pill label="Lead" icon="star" color={Brand.amber} compact />
                    )}
                  </View>
                  <Text style={styles.memberMeta}>
                    {[member.department, member.year, member.rollNo]
                      .filter(Boolean)
                      .join(' · ') || 'No course details on the roster'}
                  </Text>
                  {!!member.phone && <Text style={styles.memberMeta}>{member.phone}</Text>}
                </View>
              </Card>
            ))}
          </Section>

          <View style={styles.actions}>
            <Button
              label="Scan another"
              icon="qrcode-scan"
              accent={accent}
              onPress={rescan}
              full
            />
            <Button
              label="Open the full team record"
              variant="secondary"
              icon="account-group-outline"
              accent={accent}
              onPress={() => router.push(`/team/${lookup.team._id}` as never)}
              full
            />
          </View>
        </>
      )}

      <ScannerModal
        visible={showScanner}
        busy={looking}
        accent={accent}
        onClose={() => {
          setScanning(false);
          if (!lookup) router.back();
        }}
        onCode={(scanned) => setCode(scanned)}
      />
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

function TeamHeader({
  team,
  accent,
}: {
  team: NonNullable<(typeof api.teams.byCode)['_returnType']>['team'];
  accent: string;
}) {
  const Brand = useColors();
  const styles = useStyles();
  const payment = paymentStatusMeta(Brand)[team.paymentStatus];

  return (
    <Card style={styles.teamCard}>
      <View style={styles.teamTop}>
        <View style={[styles.teamMark, { backgroundColor: withAlpha(accent, 0.14) }]}>
          <MaterialCommunityIcons name="qrcode" size={20} color={accent} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.teamCode, { color: accent }]}>{team.code}</Text>
          <Text style={styles.teamName}>{team.name}</Text>
        </View>
      </View>

      <View style={styles.pillRow}>
        <Pill label={payment.label} icon={payment.icon as never} color={payment.color} compact />
        {!!team.track && <Pill label={team.track} icon="tag-outline" compact />}
        {team.status !== 'active' && (
          <Pill label={team.status} icon="alert-outline" color={Brand.red} compact />
        )}
      </View>

      <View style={styles.kvGrid}>
        <KeyValue label="College" value={team.college} />
        <KeyValue label="Lab" value={team.labName} />
        <KeyValue label="Table" value={team.tableNo} />
        <KeyValue label="Members" value={team.memberCount} />
        <KeyValue label="Need a stay" value={stayLabel(team.accommodationCount)} />
      </View>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/** Round picker, then straight into the sheet for this team. */
function ScoreSection({ teamId, accent }: { teamId: Id<'teams'>; accent: string }) {
  const Brand = useColors();
  const styles = useStyles();
  const router = useRouter();

  const rounds = useQuery(api.rounds.list, {});
  const teamRounds = useQuery(api.scores.teamRounds, { teamId });
  const [picked, setPicked] = useState<Id<'rounds'> | null>(null);

  const open = useMemo(() => (rounds ?? []).filter((r) => r.status === 'open'), [rounds]);

  /** Derived, not an effect: a scan should be two taps, not three. */
  const roundId = useMemo(() => {
    if (open.length === 0) return null;
    if (picked && open.some((round) => round._id === picked)) return picked;
    return open[0]._id;
  }, [open, picked]);

  if (rounds === undefined) return null;

  if (rounds.length === 0 || open.length === 0) {
    return (
      <Section title="Evaluate">
        <Card>
          <Text style={styles.note}>
            No round is open for scoring. An organiser opens rounds from Setup.
          </Text>
        </Card>
      </Section>
    );
  }

  const stateFor = (id: Id<'rounds'>) =>
    teamRounds?.rounds.find((r) => r.roundId === id)?.myState ?? null;

  return (
    <Section title="Evaluate" hint="Pick the round, then fill in the sheet.">
      <View style={styles.chipWrap}>
        {open.map((round) => {
          const active = round._id === roundId;
          const state = stateFor(round._id);
          return (
            <Pressable
              key={round._id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setPicked(round._id)}
              style={({ pressed }) => [
                styles.chip,
                active && {
                  backgroundColor: withAlpha(accent, 0.15),
                  borderColor: withAlpha(accent, 0.45),
                },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.chipText, { color: active ? accent : Brand.textMuted }]}>
                {round.name}
              </Text>
              {state && (
                <MaterialCommunityIcons
                  name={state === 'submitted' ? 'check-circle' : 'circle-edit-outline'}
                  size={13}
                  color={state === 'submitted' ? Brand.green : Brand.amber}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      <Button
        label={
          roundId && stateFor(roundId) === 'submitted'
            ? 'Open my submitted sheet'
            : 'Score this team'
        }
        icon="clipboard-check-outline"
        accent={accent}
        disabled={!roundId}
        onPress={() => router.push(`/score/${teamId}?roundId=${roundId}` as never)}
        full
      />
    </Section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Attendance for the scanned team. Nothing is pre-set: every member is marked
 * individually, so a whole team is never marked present by accident.
 */
function AttendanceSection({
  teamId,
  teamCode,
  accent,
}: {
  teamId: Id<'teams'>;
  teamCode: string;
  accent: string;
}) {
  const Brand = useColors();
  const styles = useStyles();
  const toast = useToast();

  const sessions = useQuery(api.sessions.list, {});
  const [picked, setPicked] = useState<Id<'attendanceSessions'> | null>(null);

  /** Derived, not an effect: default to the first session on the list. */
  const sessionId = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    if (picked && sessions.some((session) => session._id === picked)) return picked;
    return sessions[0]._id;
  }, [picked, sessions]);

  const board = useQuery(api.attendance.board, sessionId ? { sessionId } : 'skip');
  const mark = useMutation(api.attendance.mark);
  const [saving, setSaving] = useState<string | null>(null);

  const row = board?.find((entry) => entry.teamId === teamId) ?? null;
  const meta = attendanceStatusMeta(Brand);
  const order: AttendanceStatus[] = ['present', 'late', 'excused', 'absent'];

  if (sessions === undefined) return null;

  if (sessions.length === 0) {
    return (
      <Section title="Attendance">
        <Card>
          <Text style={styles.note}>
            No attendance sessions exist yet. An organiser creates them in Setup.
          </Text>
        </Card>
      </Section>
    );
  }

  return (
    <Section
      title="Attendance"
      hint={row ? `${row.marked} of ${row.total} marked` : 'Choose a session'}>
      <View style={styles.chipWrap}>
        {sessions.map((session) => {
          const active = session._id === sessionId;
          return (
            <Pressable
              key={session._id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setPicked(session._id)}
              style={({ pressed }) => [
                styles.chip,
                active && {
                  backgroundColor: withAlpha(accent, 0.15),
                  borderColor: withAlpha(accent, 0.45),
                },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.chipText, { color: active ? accent : Brand.textMuted }]}>
                {session.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {board === undefined && !!sessionId && <ScreenLoading label="Loading the register" />}

      {!!board && !row && (
        <Card>
          <Text style={styles.note}>{teamCode} is not one of your teams for this session.</Text>
        </Card>
      )}

      {!!row &&
        row.members.map((member) => (
          <Card key={member._id} style={styles.markCard}>
            <View style={styles.memberTop}>
              <Text style={styles.memberName}>{member.name}</Text>
              {member.isLeader && <Pill label="Lead" icon="star" color={Brand.amber} compact />}
            </View>

            <View style={styles.markRow}>
              {order.map((status) => {
                const active = member.status === status;
                const tone = meta[status];
                const key = `${member._id}:${status}`;
                return (
                  <Pressable
                    key={status}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${member.name} ${tone.label}`}
                    disabled={!row.canMark || saving !== null}
                    onPress={async () => {
                      if (!sessionId) return;
                      setSaving(key);
                      try {
                        await mark({ sessionId, memberId: member._id, status });
                      } catch (error) {
                        toast.show(errorMessage(error), 'error');
                      } finally {
                        setSaving(null);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.markButton,
                      {
                        backgroundColor: active ? tone.dim : Brand.inputBg,
                        borderColor: active ? withAlpha(tone.color, 0.5) : Brand.borderSubtle,
                      },
                      pressed && styles.pressed,
                      saving === key && styles.pressed,
                    ]}>
                    <MaterialCommunityIcons
                      name={tone.icon as never}
                      size={14}
                      color={active ? tone.color : Brand.textFaint}
                    />
                    <Text
                      style={[
                        styles.markText,
                        { color: active ? tone.color : Brand.textFaint },
                      ]}>
                      {tone.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ))}
    </Section>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.65 },
  close: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surfaceStrong,
  },

  teamCard: { gap: Space.md },
  teamTop: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  teamMark: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamCode: { fontSize: 15, fontWeight: '800', letterSpacing: 1.2 },
  teamName: { color: Brand.text, fontSize: 18, fontWeight: '700', marginTop: 2 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  kvGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.borderSubtle,
    backgroundColor: Brand.inputBg,
  },
  chipText: { fontSize: 12.5, fontWeight: '700' },

  note: { color: Brand.textMuted, fontSize: 13, lineHeight: 19 },

  memberCard: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  memberName: { color: Brand.text, fontSize: 14.5, fontWeight: '700' },
  memberMeta: { color: Brand.textFaint, fontSize: 12, marginTop: 3 },

  markCard: { gap: Space.md },
  markRow: { flexDirection: 'row', gap: Space.sm },
  markButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  markText: { fontSize: 11, fontWeight: '700' },

  actions: { gap: Space.sm },
}));
