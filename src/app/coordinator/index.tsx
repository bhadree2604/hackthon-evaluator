import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { TeamCard } from '@/components/team-card';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/inputs';
import { Card, EmptyState, Pill, Section, StatCard, StatGrid } from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { useDebounced } from '@/hooks/use-debounced';
import { useSession } from '@/lib/session';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';


export default function CoordinatorTeams() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const accent = useRoleTheme().coordinator.accent;
  const router = useRouter();
  const { profile } = useSession();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);

  const overview = useQuery(api.stats.coordinatorOverview, {});
  const teams = useQuery(api.teams.list, { search: debounced || undefined });

  const labLine = useMemo(() => {
    if (!overview) return '';
    // Every coordinator covers every team; the labs are where they are posted.
    if (overview.labs.length === 0) return 'Every team at the event';
    return `Posted to ${overview.labs.map((l) => l.name).join(' · ')}`;
  }, [overview]);

  return (
    <Screen gradient={RoleTheme.coordinator.gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow="Coordinator"
        title={`Hi ${profile?.name?.split(' ')[0] ?? 'there'}`}
        subtitle={labLine}
      />

      {/* The fastest way to a team: the code on the badge is the lookup key. */}
      <Button
        label="Scan a team badge"
        icon="qrcode-scan"
        accent={accent}
        onPress={() => router.push('/scan' as never)}
        full
      />

      <StatGrid>
        <StatCard
          label="Teams"
          value={overview?.teams ?? '—'}
          icon="account-group-outline"
          color={accent}
        />
        <StatCard
          label="Participants"
          value={overview?.members ?? '—'}
          icon="account-multiple-outline"
          color={Brand.blue}
        />
        <StatCard
          label="Present now"
          value={overview ? `${overview.attendanceRate}%` : '—'}
          sub={overview?.latestSession?.name}
          icon="account-check-outline"
          color={Brand.green}
        />
        <StatCard
          label="Not marked"
          value={overview?.pendingNow ?? '—'}
          sub={overview?.latestSession ? 'this session' : undefined}
          icon="progress-clock"
          color={Brand.amber}
          onPress={() => router.push('/coordinator/attendance')}
        />
      </StatGrid>

      {!!overview && overview.labs.length > 0 && (
        <Section title="Your labs" hint="Where you are posted. You can still act on any team.">
          <Card>
            <View style={styles.labs}>
              {overview.labs.map((lab) => (
                <Pill
                  key={lab._id}
                  label={lab.block ? `${lab.name} · ${lab.block}` : lab.name}
                  color={accent}
                  icon="door-open"
                />
              ))}
            </View>
          </Card>
        </Section>
      )}

      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search any team"
        accent={accent}
      />

      {teams === undefined ? (
        <ScreenLoading label="Loading teams" />
      ) : teams.length === 0 ? (
        <EmptyState
          icon="account-group-outline"
          title={search ? 'No team matches that' : 'No teams yet'}
          message={
            search
              ? 'Try the team code instead.'
              : 'Teams appear here as soon as an organiser imports them.'
          }
        />
      ) : (
        <Section title="Teams" hint={`${teams.length} at the event`}>
          <View style={styles.list}>
            {teams.map((team) => (
              <TeamCard
                key={team._id}
                team={team}
                accent={accent}
                onPress={() => router.push({ pathname: '/team/[id]', params: { id: team._id } })}
              />
            ))}
          </View>
        </Section>
      )}

      <Text style={styles.footnote}>
        Every team is here, whichever lab it is in, so you can scan a badge and mark whoever
        is standing in front of you. Marks and the leaderboard stay with the evaluation panel.
      </Text>
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  labs: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  list: { gap: Space.md },
  footnote: {
    color: Brand.textFaint,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: Space.sm,
  },
}));
