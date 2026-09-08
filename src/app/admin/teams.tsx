import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { TeamCard } from '@/components/team-card';
import { Button, IconButton, Segmented } from '@/components/ui/button';
import { OptionPicker, SearchInput, TextField } from '@/components/ui/inputs';
import { ConfirmDialog, Sheet, useToast } from '@/components/ui/overlays';
import { EmptyState, Pill } from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useDebounced } from '@/hooks/use-debounced';
import { errorMessage } from '@/lib/errors';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';


type Filter = 'all' | 'unassigned' | 'unpaid';
type Track = 'software' | 'hardware' | 'open';
type Status = 'active' | 'disqualified' | 'withdrawn';
type Payment = 'paid' | 'pending' | 'failed' | 'waived';

type Draft = {
  teamId: Id<'teams'> | null;
  code: string;
  name: string;
  projectTitle: string;
  problemStatementId: string;
  domain: string;
  college: string;
  tableNo: string;
  track: Track | null;
  status: Status;
  labId: Id<'labs'> | null;
  coordinatorId: Id<'profiles'> | null;
  paymentStatus: Payment;
  paymentLink: string;
  paymentAmount: string;
  paymentReference: string;
};

const EMPTY: Draft = {
  teamId: null,
  code: '',
  name: '',
  projectTitle: '',
  problemStatementId: '',
  domain: '',
  college: '',
  tableNo: '',
  track: null,
  status: 'active',
  labId: null,
  coordinatorId: null,
  paymentStatus: 'pending',
  paymentLink: '',
  paymentAmount: '',
  paymentReference: '',
};

export default function AdminTeams() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const accent = useRoleTheme().admin.accent;
  const router = useRouter();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Id<'teams'> | null>(null);

  const debounced = useDebounced(search, 300);
  const teams = useQuery(api.teams.list, { search: debounced || undefined });
  const labs = useQuery(api.labs.list, {});
  const coordinators = useQuery(api.profiles.listCoordinators, {});

  const upsert = useMutation(api.teams.upsert);
  const setPayment = useMutation(api.teams.setPayment);
  const remove = useMutation(api.teams.remove);

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

  function openEditor(team?: (typeof rows)[number]) {
    if (!team) {
      setDraft({ ...EMPTY });
      return;
    }
    setDraft({
      teamId: team._id,
      code: team.code,
      name: team.name,
      projectTitle: team.projectTitle ?? '',
      problemStatementId: team.problemStatementId ?? '',
      domain: team.domain ?? '',
      college: team.college ?? '',
      tableNo: team.tableNo ?? '',
      track: (team.track ?? null) as Track | null,
      status: team.status as Status,
      labId: team.labId ?? null,
      coordinatorId: team.coordinatorId ?? null,
      paymentStatus: (team.paymentStatus ?? 'pending') as Payment,
      paymentLink: team.paymentLink ?? '',
      paymentAmount: team.paymentAmount != null ? String(team.paymentAmount) : '',
      paymentReference: '',
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const teamId = await upsert({
        teamId: draft.teamId ?? undefined,
        code: draft.code,
        name: draft.name,
        projectTitle: draft.projectTitle || undefined,
        problemStatementId: draft.problemStatementId || undefined,
        domain: draft.domain || undefined,
        track: draft.track ?? undefined,
        college: draft.college || undefined,
        tableNo: draft.tableNo || undefined,
        labId: draft.labId ?? undefined,
        coordinatorId: draft.coordinatorId ?? undefined,
        status: draft.status,
      });

      const amount = draft.paymentAmount.trim() ? Number(draft.paymentAmount) : undefined;
      await setPayment({
        teamId,
        paymentStatus: draft.paymentStatus,
        paymentLink: draft.paymentLink || undefined,
        paymentAmount: Number.isFinite(amount) ? amount : undefined,
        paymentReference: draft.paymentReference || undefined,
      });

      toast.show(draft.teamId ? 'Team updated' : 'Team created', 'success');
      setDraft(null);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await remove({ teamId: deleting });
      toast.show('Team deleted', 'success');
      setDeleting(null);
      setDraft(null);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen gradient={RoleTheme.admin.gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow="Organiser"
        title="Teams"
        subtitle="Assign labs and coordinators, track payment, fix details."
        right={
          <Button
            label="Add"
            size="sm"
            icon="plus"
            accent={accent}
            onPress={() => openEditor()}
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
                    onPress={() => openEditor(team)}
                  />
                </View>
              }
            />
          ))}
        </View>
      )}

      <Sheet
        visible={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.teamId ? 'Edit team' : 'New team'}
        subtitle={draft?.teamId ? draft.code : 'Codes must be unique, for example HF3-014.'}
        accent={accent}
        footer={
          <>
            {!!draft?.teamId && (
              <Button
                label="Delete"
                variant="danger"
                icon="trash-can-outline"
                onPress={() => setDeleting(draft.teamId)}
              />
            )}
            <Button
              label="Save"
              accent={accent}
              loading={busy}
              onPress={save}
              style={styles.flex}
            />
          </>
        }>
        {!!draft && (
          <>
            <TextField
              label="Team code"
              value={draft.code}
              onChangeText={(code) => setDraft({ ...draft, code })}
              placeholder="HF3-014"
              icon="identifier"
              autoCapitalize="characters"
              accent={accent}
            />
            <TextField
              label="Team name"
              value={draft.name}
              onChangeText={(name) => setDraft({ ...draft, name })}
              placeholder="Team name"
              icon="account-group-outline"
              accent={accent}
            />
            <TextField
              label="Project title"
              value={draft.projectTitle}
              onChangeText={(projectTitle) => setDraft({ ...draft, projectTitle })}
              placeholder="What they are building"
              icon="lightbulb-outline"
              accent={accent}
            />
            <TextField
              label="Problem statement"
              value={draft.problemStatementId}
              onChangeText={(problemStatementId) => setDraft({ ...draft, problemStatementId })}
              placeholder="HF3-SW-25"
              icon="pound"
              autoCapitalize="characters"
              accent={accent}
            />

            <OptionPicker<Track | null>
              label="Track"
              accent={accent}
              value={draft.track}
              onChange={(track) => setDraft({ ...draft, track })}
              options={[
                { value: null, label: 'Not set' },
                { value: 'software', label: 'Software', icon: 'laptop' },
                { value: 'hardware', label: 'Hardware', icon: 'chip' },
                { value: 'open', label: 'Open innovation', icon: 'star-outline' },
              ]}
            />

            <TextField
              label="Domain"
              value={draft.domain}
              onChangeText={(domain) => setDraft({ ...draft, domain })}
              placeholder="Generative AI, Robotics, ..."
              icon="shape-outline"
              accent={accent}
            />
            <TextField
              label="College"
              value={draft.college}
              onChangeText={(college) => setDraft({ ...draft, college })}
              icon="school-outline"
              accent={accent}
            />

            <OptionPicker<Id<'labs'> | null>
              label="Lab"
              accent={accent}
              value={draft.labId}
              onChange={(labId) => setDraft({ ...draft, labId })}
              options={[
                { value: null, label: 'Unassigned' },
                ...(labs ?? []).map((lab) => ({
                  value: lab._id,
                  label: lab.name,
                  icon: 'door-open' as const,
                })),
              ]}
              hint={labs?.length === 0 ? 'Add labs in Setup first.' : undefined}
            />

            <TextField
              label="Table number"
              value={draft.tableNo}
              onChangeText={(tableNo) => setDraft({ ...draft, tableNo })}
              icon="table-furniture"
              accent={accent}
            />

            <OptionPicker<Id<'profiles'> | null>
              label="Coordinator"
              accent={accent}
              value={draft.coordinatorId}
              onChange={(coordinatorId) => setDraft({ ...draft, coordinatorId })}
              options={[
                { value: null, label: 'Unassigned' },
                ...(coordinators ?? []).map((c) => ({
                  value: c._id,
                  label: c.name,
                  icon: 'account-tie-outline' as const,
                })),
              ]}
              hint={
                coordinators?.length === 0
                  ? 'Invite coordinators from the People tab first.'
                  : undefined
              }
            />

            <OptionPicker<Payment>
              label="Payment"
              accent={accent}
              value={draft.paymentStatus}
              onChange={(paymentStatus) => setDraft({ ...draft, paymentStatus })}
              options={[
                { value: 'paid', label: 'Paid', icon: 'check-decagram' },
                { value: 'pending', label: 'Pending', icon: 'clock-outline' },
                { value: 'failed', label: 'Failed', icon: 'alert-decagram-outline' },
                { value: 'waived', label: 'Waived', icon: 'ticket-percent-outline' },
              ]}
            />

            <TextField
              label="Payment link"
              value={draft.paymentLink}
              onChangeText={(paymentLink) => setDraft({ ...draft, paymentLink })}
              placeholder="https://..."
              icon="link-variant"
              autoCapitalize="none"
              accent={accent}
            />
            <TextField
              label="Amount"
              value={draft.paymentAmount}
              onChangeText={(paymentAmount) => setDraft({ ...draft, paymentAmount })}
              placeholder="500"
              icon="currency-inr"
              keyboardType="number-pad"
              accent={accent}
            />
            <TextField
              label="Payment reference"
              value={draft.paymentReference}
              onChangeText={(paymentReference) => setDraft({ ...draft, paymentReference })}
              icon="receipt"
              autoCapitalize="characters"
              accent={accent}
            />

            <OptionPicker<Status>
              label="Status"
              accent={accent}
              value={draft.status}
              onChange={(status) => setDraft({ ...draft, status })}
              options={[
                { value: 'active', label: 'Active', icon: 'check-circle-outline' },
                { value: 'withdrawn', label: 'Withdrawn', icon: 'exit-run' },
                { value: 'disqualified', label: 'Disqualified', icon: 'cancel' },
              ]}
            />
          </>
        )}
      </Sheet>

      <ConfirmDialog
        visible={deleting !== null}
        title="Delete this team?"
        message="Members, attendance and every score for the team are removed too. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  list: { gap: Space.md },
  trailing: { alignItems: 'flex-end', gap: Space.sm },
}));
