import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { OptionPicker, TextField } from '@/components/ui/inputs';
import { ConfirmDialog, Sheet, useToast } from '@/components/ui/overlays';
import { Card, Pill } from '@/components/ui/primitives';
import { Radius, Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/lib/errors';
import { makeStyles, useColors } from '@/lib/theme';

/**
 * The one team editor, shared by the Teams list and the team record itself.
 *
 * Everything an organiser changes on the floor lives here: the lab, the table,
 * the track, the coordinator, payment, and the participant logins for the
 * team. The footer is pinned, so Save is always reachable however long the
 * form gets.
 */

export type Track = 'software' | 'hardware' | 'open';
export type Status = 'active' | 'disqualified' | 'withdrawn';
export type Payment = 'paid' | 'pending' | 'failed' | 'waived';

/** The shape both `teams.list` and `teams.get` hand back for a team. */
export type EditableTeam = {
  _id: Id<'teams'>;
  code: string;
  name: string;
  projectTitle?: string | null;
  problemStatementId?: string | null;
  domain?: string | null;
  problemDomain?: string | null;
  accommodationCount?: number | null;
  college?: string | null;
  tableNo?: string | null;
  track?: Track | null;
  status: Status;
  labId?: Id<'labs'> | null;
  coordinatorId?: Id<'profiles'> | null;
  paymentStatus?: Payment | null;
  paymentLink?: string | null;
  paymentAmount?: number | null;
  paymentReference?: string | null;
};

type Draft = {
  code: string;
  name: string;
  projectTitle: string;
  problemStatementId: string;
  domain: string;
  problemDomain: string;
  accommodationCount: string;
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
  code: '',
  name: '',
  projectTitle: '',
  problemStatementId: '',
  domain: '',
  problemDomain: '',
  accommodationCount: '',
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

function draftFrom(team: EditableTeam | null): Draft {
  if (!team) return { ...EMPTY };
  return {
    code: team.code,
    name: team.name,
    projectTitle: team.projectTitle ?? '',
    problemStatementId: team.problemStatementId ?? '',
    domain: team.domain ?? '',
    problemDomain: team.problemDomain ?? '',
    accommodationCount: team.accommodationCount != null ? String(team.accommodationCount) : '',
    college: team.college ?? '',
    tableNo: team.tableNo ?? '',
    track: team.track ?? null,
    status: team.status,
    labId: team.labId ?? null,
    coordinatorId: team.coordinatorId ?? null,
    paymentStatus: (team.paymentStatus ?? 'pending') as Payment,
    paymentLink: team.paymentLink ?? '',
    paymentAmount: team.paymentAmount != null ? String(team.paymentAmount) : '',
    paymentReference: team.paymentReference ?? '',
  };
}

export function TeamEditorSheet({
  visible,
  team,
  onClose,
  onDeleted,
  accent,
}: {
  visible: boolean;
  /** null opens the editor for a brand new team. */
  team: EditableTeam | null;
  onClose: () => void;
  onDeleted?: () => void;
  accent: string;
}) {
  /**
   * Keyed on the team, so opening a different team starts from that team's
   * values instead of whatever was left in the form last time.
   */
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      accent={accent}
      title={team ? 'Edit team' : 'New team'}
      subtitle={team ? `${team.code} · ${team.name}` : 'Codes must be unique, e.g. HF3-014.'}
      footer={null}>
      {visible && (
        <EditorBody
          key={team?._id ?? 'new'}
          team={team}
          accent={accent}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      )}
    </Sheet>
  );
}

function EditorBody({
  team,
  accent,
  onClose,
  onDeleted,
}: {
  team: EditableTeam | null;
  accent: string;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const Brand = useColors();
  const styles = useStyles();
  const toast = useToast();

  const initial = useMemo(() => draftFrom(team), [team]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const labs = useQuery(api.labs.list, {});
  const coordinators = useQuery(api.profiles.listCoordinators, {});

  const upsert = useMutation(api.teams.upsert);
  const setPayment = useMutation(api.teams.setPayment);
  const remove = useMutation(api.teams.remove);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const dirty = useMemo(
    () => (Object.keys(initial) as (keyof Draft)[]).some((key) => initial[key] !== draft[key]),
    [draft, initial],
  );

  const canSave = draft.code.trim().length > 0 && draft.name.trim().length > 0;

  async function save() {
    setBusy(true);
    try {
      const amount = draft.paymentAmount.trim() ? Number(draft.paymentAmount) : undefined;

      const stayText = draft.accommodationCount.trim();
      const stay = stayText ? Number(stayText) : null;
      if (stay !== null && (!Number.isInteger(stay) || stay < 0)) {
        toast.show('People needing a stay must be a whole number, 0 or more.', 'error');
        return;
      }

      const teamId = await upsert({
        teamId: team?._id,
        code: draft.code,
        name: draft.name,
        projectTitle: draft.projectTitle || undefined,
        problemStatementId: draft.problemStatementId || undefined,
        domain: draft.domain || undefined,
        // Sent even when empty: an empty string or null is how they are cleared.
        problemDomain: draft.problemDomain,
        accommodationCount: stay,
        track: draft.track ?? undefined,
        college: draft.college || undefined,
        tableNo: draft.tableNo || undefined,
        labId: draft.labId ?? undefined,
        coordinatorId: draft.coordinatorId ?? undefined,
        status: draft.status,
      });

      await setPayment({
        teamId,
        paymentStatus: draft.paymentStatus,
        paymentLink: draft.paymentLink || undefined,
        paymentAmount: Number.isFinite(amount) ? amount : undefined,
        paymentReference: draft.paymentReference || undefined,
      });

      const labName = draft.labId
        ? (labs?.find((lab) => lab._id === draft.labId)?.name ?? null)
        : null;

      // Says what actually landed, so a save is never a silent no-op.
      toast.show(
        team
          ? `${draft.code} saved${labName ? ` · ${labName}` : ''}${
              draft.tableNo ? ` · table ${draft.tableNo}` : ''
            }`
          : `${draft.code} created`,
        'success',
      );
      onClose();
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={styles.body}>
        {/* Pinned at the top of the scroll area: always in view on a phone. */}
        <Card style={styles.saveBar}>
          <View style={styles.flex}>
            <Text style={styles.saveTitle}>
              {team ? draft.code || team.code : 'New team'}
            </Text>
            <Text style={styles.saveHint}>
              {!canSave
                ? 'A code and a name are required.'
                : dirty
                  ? 'Unsaved changes'
                  : 'Everything is saved'}
            </Text>
          </View>
          {dirty && <View style={[styles.dot, { backgroundColor: Brand.amber }]} />}
          <Button
            label={dirty ? 'Save changes' : 'Saved'}
            icon={dirty ? 'content-save-outline' : 'check'}
            accent={accent}
            loading={busy}
            disabled={!canSave || !dirty}
            onPress={save}
          />
        </Card>

        <Field label="Identity">
          <TextField
            label="Team code"
            value={draft.code}
            onChangeText={(value) => set('code', value)}
            placeholder="HF3-014"
            icon="identifier"
            autoCapitalize="characters"
            accent={accent}
          />
          <TextField
            label="Team name"
            value={draft.name}
            onChangeText={(value) => set('name', value)}
            placeholder="Team name"
            icon="account-group-outline"
            accent={accent}
          />
          <TextField
            label="Project title"
            value={draft.projectTitle}
            onChangeText={(value) => set('projectTitle', value)}
            placeholder="What they are building"
            icon="lightbulb-outline"
            accent={accent}
          />
          <TextField
            label="Problem code"
            value={draft.problemStatementId}
            onChangeText={(value) => set('problemStatementId', value)}
            placeholder="HF3-SW-25"
            icon="pound"
            autoCapitalize="characters"
            accent={accent}
          />
          <TextField
            label="College"
            value={draft.college}
            onChangeText={(value) => set('college', value)}
            icon="school-outline"
            accent={accent}
          />
        </Field>

        <Field label="Track and domain">
          <OptionPicker<Track | null>
            label="Track"
            accent={accent}
            value={draft.track}
            onChange={(value) => set('track', value)}
            options={[
              { value: 'software', label: 'Software', icon: 'laptop' },
              { value: 'hardware', label: 'Hardware', icon: 'chip' },
              { value: 'open', label: 'Open innovation', icon: 'star-outline' },
              { value: null, label: 'Not set' },
            ]}
            hint="Imported from the Domain column of the registration sheet."
          />
          <TextField
            label="Domain"
            value={draft.domain}
            onChangeText={(value) => set('domain', value)}
            placeholder="Software, Hardware, Open Innovation"
            icon="shape-outline"
            accent={accent}
          />
          <TextField
            label="Problem domain"
            value={draft.problemDomain}
            onChangeText={(value) => set('problemDomain', value)}
            placeholder="Generative AI and LLM, Robotics, ..."
            icon="tag-outline"
            accent={accent}
          />
        </Field>

        <Field label="Registration">
          <TextField
            label="People needing a stay"
            value={draft.accommodationCount}
            onChangeText={(value) => set('accommodationCount', value)}
            placeholder="0"
            icon="bed-outline"
            keyboardType="number-pad"
            accent={accent}
          />
        </Field>

        <Field label="Where they sit">
          <OptionPicker<Id<'labs'> | null>
            label="Lab"
            accent={accent}
            value={draft.labId}
            onChange={(value) => set('labId', value)}
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
            onChangeText={(value) => set('tableNo', value)}
            placeholder="T12"
            icon="table-furniture"
            autoCapitalize="characters"
            accent={accent}
          />
          <OptionPicker<Id<'profiles'> | null>
            label="Coordinator"
            accent={accent}
            value={draft.coordinatorId}
            onChange={(value) => set('coordinatorId', value)}
            options={[
              { value: null, label: 'Unassigned' },
              ...(coordinators ?? []).map((coordinator) => ({
                value: coordinator._id,
                label: coordinator.name,
                icon: 'account-tie-outline' as const,
              })),
            ]}
            hint={
              coordinators?.length === 0
                ? 'Invite coordinators from the People tab first.'
                : undefined
            }
          />
        </Field>

        <Field label="Payment">
          <OptionPicker<Payment>
            label="Status"
            accent={accent}
            value={draft.paymentStatus}
            onChange={(value) => set('paymentStatus', value)}
            options={[
              { value: 'paid', label: 'Paid', icon: 'check-decagram' },
              { value: 'pending', label: 'Pending', icon: 'clock-outline' },
              { value: 'failed', label: 'Failed', icon: 'alert-decagram-outline' },
              { value: 'waived', label: 'Waived', icon: 'ticket-percent-outline' },
            ]}
          />
          <TextField
            label="Amount"
            value={draft.paymentAmount}
            onChangeText={(value) => set('paymentAmount', value)}
            placeholder="750"
            icon="currency-inr"
            keyboardType="number-pad"
            accent={accent}
          />
          <TextField
            label="Reference"
            value={draft.paymentReference}
            onChangeText={(value) => set('paymentReference', value)}
            icon="receipt"
            autoCapitalize="characters"
            accent={accent}
          />
          <TextField
            label="Payment link"
            value={draft.paymentLink}
            onChangeText={(value) => set('paymentLink', value)}
            placeholder="https://..."
            icon="link-variant"
            autoCapitalize="none"
            accent={accent}
          />
        </Field>

        <Field label="Status">
          <OptionPicker<Status>
            label="Team status"
            accent={accent}
            value={draft.status}
            onChange={(value) => set('status', value)}
            options={[
              { value: 'active', label: 'Active', icon: 'check-circle-outline' },
              { value: 'withdrawn', label: 'Withdrawn', icon: 'exit-run' },
              { value: 'disqualified', label: 'Disqualified', icon: 'cancel' },
            ]}
          />
        </Field>

        {!!team && <TeamLogins teamId={team._id} teamCode={team.code} accent={accent} />}

        <View style={styles.actions}>
          <Button
            label={dirty ? 'Save changes' : 'Saved'}
            icon={dirty ? 'content-save-outline' : 'check'}
            accent={accent}
            loading={busy}
            disabled={!canSave || !dirty}
            onPress={save}
            full
          />
          <Button label="Close" variant="ghost" onPress={onClose} full />
          {!!team && (
            <Button
              label="Delete this team"
              variant="danger"
              icon="trash-can-outline"
              onPress={() => setConfirmDelete(true)}
              full
            />
          )}
        </View>
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete ${team?.code ?? 'this team'}?`}
        message="Members, attendance and every score for the team go with it. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!team) return;
          setBusy(true);
          try {
            await remove({ teamId: team._id });
            toast.show(`${team.code} deleted`, 'success');
            setConfirmDelete(false);
            onDeleted?.();
            onClose();
          } catch (error) {
            toast.show(errorMessage(error), 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

/** A labelled group of inputs, so a long form still reads as sections. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The team's logins, in the place an organiser is already standing when a
 * participant says they cannot get in.
 */
function TeamLogins({
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

  const data = useQuery(api.participants.provisioningByTeam, {});
  const provision = useMutation(api.participants.provisionTeamDefaults);
  const resetPassword = useMutation(api.participants.resetToDefaultPassword);
  const [busy, setBusy] = useState<string | null>(null);

  const row = data?.teams.find((entry) => entry.teamId === teamId) ?? null;
  if (!data || !row) return null;

  const password = data.defaultPassword;

  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>LOGINS</Text>

      <Card style={styles.loginCard}>
        <View style={styles.loginTop}>
          <View style={styles.flex}>
            <Text style={styles.loginTitle}>
              {row.withAccount} of {row.members.length} can sign in
            </Text>
            <Text style={styles.loginHint}>
              Each member signs in with their own email and the password {password}.
            </Text>
          </View>
          <Pill label={password} color={accent} />
        </View>

        {row.members.map((member) => (
          <View key={member.memberId} style={styles.member}>
            <View style={styles.flex}>
              <Text style={styles.memberName}>{member.name}</Text>
              <Text style={styles.memberEmail} numberOfLines={1}>
                {member.email ?? 'No email on the roster'}
              </Text>
            </View>

            {member.hasAccount ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reset ${member.name} to the default password`}
                disabled={busy !== null}
                onPress={async () => {
                  if (!member.profileId) return;
                  setBusy(member.memberId);
                  try {
                    await resetPassword({ profileId: member.profileId });
                    toast.show(`${member.name} reset to ${password}`, 'success');
                  } catch (error) {
                    toast.show(errorMessage(error), 'error');
                  } finally {
                    setBusy(null);
                  }
                }}
                style={({ pressed }) => [styles.reset, pressed && styles.pressed]}>
                <MaterialCommunityIcons name="lock-reset" size={14} color={Brand.textMuted} />
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
            ) : (
              <Pill
                label={member.email ? 'No login' : 'No email'}
                color={member.email ? Brand.amber : Brand.red}
                compact
              />
            )}
          </View>
        ))}

        <Button
          label={
            row.missing > 0
              ? `Create ${row.missing} login${row.missing === 1 ? '' : 's'}`
              : 'Every login exists'
          }
          size="sm"
          variant="secondary"
          icon="account-plus-outline"
          accent={accent}
          loading={busy === teamId}
          disabled={row.missing === 0 || busy !== null}
          onPress={async () => {
            setBusy(teamId);
            try {
              const result = await provision({ teamId });
              toast.show(
                `${teamCode}: ${result.created} created, password ${result.password}`,
                result.failures.length > 0 ? 'error' : 'success',
              );
            } catch (error) {
              toast.show(errorMessage(error), 'error');
            } finally {
              setBusy(null);
            }
          }}
          full
        />
      </Card>
    </View>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.65 },

  body: { gap: Space.xl },

  saveBar: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  saveTitle: { color: Brand.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.4 },
  saveHint: { color: Brand.textFaint, fontSize: 11.5, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },

  group: { gap: Space.md },
  groupLabel: {
    color: Brand.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  loginCard: { gap: Space.md },
  loginTop: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  loginTitle: { color: Brand.text, fontSize: 14.5, fontWeight: '700' },
  loginHint: { color: Brand.textFaint, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  member: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  memberName: { color: Brand.textDim, fontSize: 13.5, fontWeight: '600' },
  memberEmail: { color: Brand.textFaint, fontSize: 11.5, marginTop: 1 },
  reset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.borderSubtle,
    backgroundColor: Brand.surfaceStrong,
  },
  resetText: { color: Brand.textMuted, fontSize: 11.5, fontWeight: '700' },

  actions: { gap: Space.sm, paddingTop: Space.sm },
}));
