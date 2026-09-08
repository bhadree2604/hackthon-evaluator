import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { TeamCard } from '@/components/team-card';
import { SearchInput } from '@/components/ui/inputs';
import { Banner, Card, EmptyState, Pill, Section, StatCard, StatGrid } from '@/components/ui/primitives';
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
    if (overview.labs.length === 0) return 'No lab assigned yet';
    return overview.labs.map((l) => l.name).join(' · ');
  }, [overview]);

  return (
    <Screen gradient={RoleTheme.coordinator.gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow="Coordinator"
        title={`Hi ${profile?.name?.split(' ')[0] ?? 'there'}`}
        subtitle={labLine}
      />

      {overview?.labs.length === 0 && (
        <Banner
          tone="warn"
          title="No lab assigned"
          message="An organiser needs to add you to a lab before teams appear here."
        />
      )}

      <StatGrid>
        <StatCard
          label="My teams"
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
        <Section title="Your labs">
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
        placeholder="Search your teams"
        accent={accent}
      />

      {teams === undefined ? (
        <ScreenLoading label="Loading your teams" />
      ) : teams.length === 0 ? (
        <EmptyState
          icon="account-group-outline"
          title={search ? 'No match in your teams' : 'No teams assigned yet'}
          message={
            search
              ? 'Try the team code instead.'
              : 'Teams show up here once an organiser assigns them to you or your lab.'
          }
        />
      ) : (
        <Section title="Teams" hint={`${teams.length} assigned to you`}>
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
        Marks and the leaderboard stay with the evaluation panel. You see teams, labs and
        attendance only.
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
