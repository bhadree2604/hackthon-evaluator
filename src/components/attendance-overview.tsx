import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { Segmented } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/inputs';
import { Card, EmptyState, ProgressBar, StatCard, StatGrid, withAlpha } from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { Space } from '@/constants/brand';
import { makeStyles, useColors } from '@/lib/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

/** Read-only attendance rollup shared by evaluators and organisers. */
export function AttendanceOverview({
  accent,
  eyebrow,
  gradient,
}: {
  accent: string;
  eyebrow: string;
  gradient: [string, string, string];
}) {
  const Brand = useColors();
  const styles = useStyles();
  const router = useRouter();
  const sessions = useQuery(api.sessions.list, {});
  const [sessionId, setSessionId] = useState<Id<'attendanceSessions'> | null>(null);
  const [search, setSearch] = useState('');

  // Derived, not an effect: default to the newest session until one is picked.
  const activeSessionId = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    if (sessionId && sessions.some((s) => s._id === sessionId)) return sessionId;
    return sessions[sessions.length - 1]._id;
  }, [sessionId, sessions]);

  const overview = useQuery(
    api.attendance.overview,
    activeSessionId ? { sessionId: activeSessionId } : 'skip',
  );
  const summary = useQuery(
    api.attendance.sessionSummary,
    activeSessionId ? { sessionId: activeSessionId } : 'skip',
  );

  const rows = useMemo(() => {
    const list = overview?.rows ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.code.toLowerCase().includes(needle) ||
        (r.labName ?? '').toLowerCase().includes(needle),
    );
  }, [overview, search]);

  if (sessions === undefined) {
    return (
      <Screen gradient={gradient} bottomInset={TAB_BAR_INSET}>
        <ScreenLoading label="Loading sessions" />
      </Screen>
    );
  }

  return (
    <Screen gradient={gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow={eyebrow}
        title="Attendance"
        subtitle="Marked by the lab coordinators during each session."
      />

      {sessions.length === 0 ? (
        <EmptyState
          icon="calendar-blank-outline"
          title="No sessions configured"
          message="Organisers add attendance sessions from Setup."
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
              label="Absent"
              value={summary ? summary.absent : '—'}
              icon="account-remove-outline"
              color={Brand.red}
            />
            <StatCard
              label="Not marked"
              value={summary ? summary.pending : '—'}
              icon="progress-clock"
              color={Brand.amber}
            />
            <StatCard
              label="Excused"
              value={summary ? summary.excused : '—'}
              icon="note-outline"
              color={Brand.blue}
            />
          </StatGrid>

          <SearchInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search team or lab"
            accent={accent}
          />

          {overview === undefined ? (
            <ScreenLoading label="Loading attendance" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="account-group-outline"
              title="No teams to show"
              message="Import the team list, then assign labs and coordinators."
            />
          ) : (
            <View style={styles.list}>
              {rows.map((row) => {
                const session = row.perSession[0];
                const present = session?.present ?? 0;
                const total = session?.total ?? row.memberCount;
                const marked = session?.marked ?? 0;
                const complete = marked >= total && total > 0;
                const tone = complete
                  ? present === total
                    ? Brand.green
                    : Brand.amber
                  : Brand.textFaint;

                return (
                  <Pressable
                    key={row.teamId}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/team/[id]', params: { id: row.teamId } })}
                    style={({ pressed }) => (pressed ? styles.pressed : null)}>
                    <Card accent={tone}>
                      <View style={styles.rowTop}>
                        <View style={styles.flex}>
                          <Text style={styles.code}>{row.code}</Text>
                          <Text style={styles.name} numberOfLines={1}>
                            {row.name}
                          </Text>
                          {!!row.labName && <Text style={styles.lab}>{row.labName}</Text>}
                        </View>
                        <View
                          style={[styles.countBox, { backgroundColor: withAlpha(tone, 0.13) }]}>
                          <Text style={[styles.count, { color: tone }]}>
                            {present}
                            <Text style={styles.countTotal}>/{total}</Text>
                          </Text>
                          <Text style={styles.countLabel}>present</Text>
                        </View>
                      </View>

                      <View style={styles.barWrap}>
                        <ProgressBar value={present} max={Math.max(1, total)} color={tone} height={5} />
                      </View>

                      {!complete && (
                        <View style={styles.warnRow}>
                          <MaterialCommunityIcons
                            name="alert-outline"
                            size={12}
                            color={Brand.amber}
                          />
                          <Text style={styles.warnText}>
                            {total - marked} member{total - marked === 1 ? '' : 's'} not marked yet
                          </Text>
                        </View>
                      )}
                    </Card>
                  </Pressable>
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
  pressed: { opacity: 0.75 },
  list: { gap: Space.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  code: { color: Brand.textFaint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  name: { color: Brand.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
  lab: { color: Brand.textMuted, fontSize: 11.5, marginTop: 2 },
  countBox: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, alignItems: 'center' },
  count: { fontSize: 17, fontWeight: '800' },
  countTotal: { fontSize: 12, fontWeight: '700', color: Brand.textFaint },
  countLabel: { color: Brand.textFaint, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6 },
  barWrap: { marginTop: Space.md },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: Space.sm },
  warnText: { color: Brand.amber, fontSize: 11.5, fontWeight: '600' },
}));
