import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { TeamCard } from '@/components/team-card';
import { TeamEditorSheet, type EditableTeam } from '@/components/team-editor';
import { Button, IconButton, Segmented } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/inputs';
import { EmptyState, Pill } from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { useDebounced } from '@/hooks/use-debounced';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';

type Filter = 'all' | 'unassigned' | 'unpaid';

export default function AdminTeams() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const accent = RoleTheme.admin.accent;
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  /** `undefined` means closed; `null` opens the editor on a new team. */
  const [editing, setEditing] = useState<EditableTeam | null | undefined>(undefined);

  const debounced = useDebounced(search, 300);
  const teams = useQuery(api.teams.list, { search: debounced || undefined });

  const counts = useMemo(
    () => ({
      all: teams?.length ?? 0,
      unassigned: teams?.filter((t) => !t.labId || !t.coordinatorId).length ?? 0,
      unpaid: teams?.filter((t) => t.paymentStatus !== 'paid').length ?? 0,
    }),
    [teams],
  );

  const rows = useMemo(() => {
    if (!teams) return [];
    if (filter === 'unassigned') return teams.filter((t) => !t.labId || !t.coordinatorId);
    if (filter === 'unpaid') return teams.filter((t) => t.paymentStatus !== 'paid');
    return teams;
  }, [filter, teams]);

  return (
    <Screen gradient={RoleTheme.admin.gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow="Organiser"
        title="Teams"
        subtitle="Assign labs and coordinators, set the track, track payment."
        right={
          <Button
            label="Add"
            size="sm"
            icon="plus"
            accent={accent}
            onPress={() => setEditing(null)}
          />
        }
      />

      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search team, code or problem ID"
        accent={accent}
      />

      <Segmented<Filter>
        accent={accent}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: counts.all },
          {
            value: 'unassigned',
            label: 'Unassigned',
            count: counts.unassigned,
            icon: 'help-circle-outline',
          },
          { value: 'unpaid', label: 'Unpaid', count: counts.unpaid, icon: 'cash-remove' },
        ]}
      />

      {teams === undefined ? (
        <ScreenLoading label="Loading teams" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="account-group-outline"
          title={search ? 'No match' : 'No teams yet'}
          message="Import the registration sheet from Overview, or add a team by hand."
          action={
            <Button
              label="Import teams"
              size="sm"
              variant="secondary"
              icon="tray-arrow-up"
              accent={accent}
              onPress={() => router.push('/admin/import')}
            />
          }
        />
      ) : (
        <View style={styles.list}>
          {rows.map((team) => (
            <TeamCard
              key={team._id}
              team={team}
              accent={accent}
              showScore
              showCoordinator
              onPress={() => router.push({ pathname: '/team/[id]', params: { id: team._id } })}
              trailing={
                <View style={styles.trailing}>
                  {team.paymentStatus !== 'paid' && (
                    <Pill label="Unpaid" color={Brand.amber} compact />
                  )}
                  <IconButton
                    icon="pencil-outline"
                    size={16}
                    accessibilityLabel={`Edit ${team.name}`}
                    onPress={() => setEditing(team)}
                  />
                </View>
              }
            />
          ))}
        </View>
      )}

      <TeamEditorSheet
        visible={editing !== undefined}
        team={editing ?? null}
        accent={accent}
        onClose={() => setEditing(undefined)}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  list: { gap: Space.md },
  trailing: { alignItems: 'flex-end', gap: Space.sm },
}));
