import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { Button } from '@/components/ui/button';
import { TextField, Toggle } from '@/components/ui/inputs';
import { ConfirmDialog, Sheet, useToast } from '@/components/ui/overlays';
import { Card, EmptyState, Pill, Section, withAlpha } from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/lib/errors';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';


export default function AdminSetup() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const accent = useRoleTheme().admin.accent;
  const toast = useToast();

  const labs = useQuery(api.labs.list, {});
  const criteria = useQuery(api.criteria.list, { includeInactive: true });
  const sessions = useQuery(api.sessions.list, { includeInactive: true });

  const createLab = useMutation(api.labs.create);
  const removeLab = useMutation(api.labs.remove);
  const upsertCriterion = useMutation(api.criteria.upsert);
  const setCriterionActive = useMutation(api.criteria.setActive);
  const removeCriterion = useMutation(api.criteria.remove);
  const seedCriteria = useMutation(api.criteria.seedDefaults);
  const upsertSession = useMutation(api.sessions.upsert);
  const setSessionActive = useMutation(api.sessions.setActive);
  const removeSession = useMutation(api.sessions.remove);
  const seedSessions = useMutation(api.sessions.seedDefaults);
  const clearParticipants = useMutation(api.importer.clearParticipants);

  const [busy, setBusy] = useState(false);
  const [labForm, setLabForm] = useState<{ name: string; block: string; floor: string } | null>(
    null,
  );
  const [criterionForm, setCriterionForm] = useState<{
    criterionId: Id<'criteria'> | null;
    key: string;
    label: string;
    description: string;
    maxScore: string;
    weight: string;
  } | null>(null);
  const [sessionForm, setSessionForm] = useState<{
    sessionId: Id<'attendanceSessions'> | null;
    name: string;
    day: string;
  } | null>(null);
  const [wiping, setWiping] = useState(false);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      toast.show(message, 'success');
      return true;
    } catch (err) {
      toast.show(errorMessage(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen gradient={RoleTheme.admin.gradient} bottomInset={TAB_BAR_INSET} keyboardAware>
      <ScreenHeader
        eyebrow="Organiser"
        title="Setup"
        subtitle="Labs, the scoring rubric and the attendance timetable."
      />

      {/* Labs ------------------------------------------------------------- */}
      <Section
        title="Labs"
        hint="Rooms teams are seated in"
        action={
          <Button
            label="Add"
            size="sm"
            icon="plus"
            accent={accent}
            onPress={() => setLabForm({ name: '', block: '', floor: '' })}
          />
        }>
        {labs === undefined ? (
          <ScreenLoading label="Loading labs" />
        ) : labs.length === 0 ? (
          <EmptyState
            icon="door-open"
            title="No labs yet"
            message="Add each room so teams and coordinators can be assigned to it."
          />
        ) : (
          <View style={styles.list}>
            {labs.map((lab) => (
              <Card key={lab._id}>
                <View style={styles.row}>
                  <View style={[styles.icon, { backgroundColor: withAlpha(Brand.green, 0.13) }]}>
                    <MaterialCommunityIcons name="door-open" size={16} color={Brand.green} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{lab.name}</Text>
                    <Text style={styles.rowMeta}>
                      {[lab.block, lab.floor].filter(Boolean).join(' · ') || 'No block recorded'}
                    </Text>
                  </View>
                  <Pill label={`${lab.teamCount} teams`} color={Brand.blue} compact />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${lab.name}`}
                    hitSlop={8}
                    onPress={() =>
                      run(() => removeLab({ labId: lab._id }), `${lab.name} deleted`)
                    }>
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={17}
                      color={Brand.textFaint}
                    />
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        )}
      </Section>

      {/* Rubric ----------------------------------------------------------- */}
      <Section
        title="Scoring rubric"
        hint="What evaluators fill in per team"
        action={
          <Button
            label="Add"
            size="sm"
            icon="plus"
            accent={accent}
            onPress={() =>
              setCriterionForm({
                criterionId: null,
                key: '',
                label: '',
                description: '',
                maxScore: '10',
                weight: '1',
              })
            }
          />
        }>
        {criteria === undefined ? (
          <ScreenLoading label="Loading rubric" />
        ) : criteria.length === 0 ? (
          <EmptyState
            icon="tune-variant"
            title="No criteria yet"
            message="Load the five Hackfinity defaults or write your own."
            action={
              <Button
                label="Load defaults"
                size="sm"
                icon="auto-fix"
                accent={accent}
                loading={busy}
                onPress={() => run(() => seedCriteria(), 'Default rubric loaded')}
              />
            }
          />
        ) : (
          <View style={styles.list}>
            {criteria.map((criterion) => (
              <Card key={criterion._id} accent={criterion.active ? Brand.cyan : Brand.textFaint}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <View style={styles.rowTitleRow}>
                      <Text style={styles.rowTitle}>{criterion.label}</Text>
                      <Pill label={`/${criterion.maxScore}`} color={Brand.cyan} compact />
                      {criterion.weight !== 1 && (
                        <Pill label={`×${criterion.weight}`} color={Brand.lilac} compact />
                      )}
                    </View>
                    {!!criterion.description && (
                      <Text style={styles.rowMeta}>{criterion.description}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <Toggle
                    label="Active"
                    value={criterion.active}
                    accent={Brand.cyan}
                    onChange={(active) =>
                      run(
                        () => setCriterionActive({ criterionId: criterion._id, active }),
                        active ? 'Criterion enabled' : 'Criterion hidden',
                      )
                    }
                  />
                  <Button
                    label="Edit"
                    size="sm"
                    variant="ghost"
                    icon="pencil-outline"
                    onPress={() =>
                      setCriterionForm({
                        criterionId: criterion._id,
                        key: criterion.key,
                        label: criterion.label,
                        description: criterion.description ?? '',
                        maxScore: String(criterion.maxScore),
                        weight: String(criterion.weight),
                      })
                    }
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${criterion.label}`}
                    hitSlop={8}
                    onPress={() =>
                      run(
                        () => removeCriterion({ criterionId: criterion._id }),
                        'Criterion deleted',
                      )
                    }>
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={17}
                      color={Brand.textFaint}
                    />
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        )}
      </Section>

      {/* Sessions --------------------------------------------------------- */}
      <Section
        title="Attendance sessions"
        hint="Each window coordinators mark"
        action={
          <Button
            label="Add"
            size="sm"
            icon="plus"
            accent={accent}
            onPress={() => setSessionForm({ sessionId: null, name: '', day: '1' })}
          />
        }>
        {sessions === undefined ? (
          <ScreenLoading label="Loading sessions" />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon="calendar-clock"
            title="No sessions yet"
            message="Load the eight default windows across the 24 hours, or add your own."
            action={
              <Button
                label="Load defaults"
                size="sm"
                icon="auto-fix"
                accent={accent}
                loading={busy}
                onPress={() => run(() => seedSessions(), 'Default sessions loaded')}
              />
            }
          />
        ) : (
          <View style={styles.list}>
            {sessions.map((session) => (
              <Card key={session._id} accent={session.active ? Brand.green : Brand.textFaint}>
                <View style={styles.row}>
                  <View style={[styles.icon, { backgroundColor: withAlpha(Brand.green, 0.13) }]}>
                    <Text style={styles.dayText}>D{session.day}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{session.name}</Text>
                    <Text style={styles.rowMeta}>Day {session.day}</Text>
                  </View>
                  <Button
                    label="Edit"
                    size="sm"
                    variant="ghost"
                    icon="pencil-outline"
                    onPress={() =>
                      setSessionForm({
                        sessionId: session._id,
                        name: session.name,
                        day: String(session.day),
                      })
                    }
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${session.name}`}
                    hitSlop={8}
                    onPress={() =>
                      run(() => removeSession({ sessionId: session._id }), 'Session deleted')
                    }>
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={17}
                      color={Brand.textFaint}
                    />
                  </Pressable>
                </View>
                <View style={styles.actionRow}>
                  <Toggle
                    label="Open for marking"
                    value={session.active}
                    accent={Brand.green}
                    onChange={(active) =>
                      run(
                        () => setSessionActive({ sessionId: session._id, active }),
                        active ? 'Session open' : 'Session closed',
                      )
                    }
                  />
                </View>
              </Card>
            ))}
          </View>
        )}
      </Section>

      {/* Danger ----------------------------------------------------------- */}
      <Section title="Danger zone">
        <Card accent={Brand.red}>
          <Text style={styles.dangerTitle}>Clear all participant data</Text>
          <Text style={styles.dangerBody}>
            Deletes every team, member, attendance mark, score, chat and participant login. Labs,
            rubric, sessions and staff accounts stay.
          </Text>
          <Button
            label="Clear participant data"
            variant="danger"
            icon="delete-forever-outline"
            style={styles.dangerButton}
            onPress={() => setWiping(true)}
          />
        </Card>
      </Section>

      {/* Sheets ------------------------------------------------------------ */}
      <Sheet
        visible={labForm !== null}
        onClose={() => setLabForm(null)}
        title="New lab"
        accent={accent}
        footer={
          <>
            <Button label="Cancel" variant="ghost" onPress={() => setLabForm(null)} style={styles.flex} />
            <Button
              label="Add lab"
              accent={accent}
              loading={busy}
              disabled={!labForm?.name.trim()}
              onPress={async () => {
                if (!labForm) return;
                const ok = await run(
                  () =>
                    createLab({
                      name: labForm.name,
                      block: labForm.block || undefined,
                      floor: labForm.floor || undefined,
                    }),
                  'Lab added',
                );
                if (ok) setLabForm(null);
              }}
              style={styles.flex}
            />
          </>
        }>
        {!!labForm && (
          <>
            <TextField
              label="Lab name"
              value={labForm.name}
              onChangeText={(name) => setLabForm({ ...labForm, name })}
              placeholder="Lab 3"
              icon="door-open"
              accent={accent}
            />
            <TextField
              label="Block"
              value={labForm.block}
              onChangeText={(block) => setLabForm({ ...labForm, block })}
              placeholder="IT Block"
              icon="office-building-outline"
              accent={accent}
            />
            <TextField
              label="Floor"
              value={labForm.floor}
              onChangeText={(floor) => setLabForm({ ...labForm, floor })}
              placeholder="Second floor"
              icon="stairs"
              accent={accent}
            />
          </>
        )}
      </Sheet>

      <Sheet
        visible={criterionForm !== null}
        onClose={() => setCriterionForm(null)}
        title={criterionForm?.criterionId ? 'Edit criterion' : 'New criterion'}
        accent={Brand.cyan}
        footer={
          <>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setCriterionForm(null)}
              style={styles.flex}
            />
            <Button
              label="Save"
              accent={Brand.cyan}
              loading={busy}
              disabled={!criterionForm?.label.trim()}
              onPress={async () => {
                if (!criterionForm) return;
                const ok = await run(
                  () =>
                    upsertCriterion({
                      criterionId: criterionForm.criterionId ?? undefined,
                      key: criterionForm.key || criterionForm.label,
                      label: criterionForm.label,
                      description: criterionForm.description || undefined,
                      maxScore: Number(criterionForm.maxScore) || 10,
                      weight: Number(criterionForm.weight) || 1,
                    }),
                  'Rubric updated',
                );
                if (ok) setCriterionForm(null);
              }}
              style={styles.flex}
            />
          </>
        }>
        {!!criterionForm && (
          <>
            <TextField
              label="Label"
              value={criterionForm.label}
              onChangeText={(label) => setCriterionForm({ ...criterionForm, label })}
              placeholder="Innovation"
              icon="format-title"
              accent={Brand.cyan}
            />
            <TextField
              label="Description"
              value={criterionForm.description}
              onChangeText={(description) => setCriterionForm({ ...criterionForm, description })}
              placeholder="What the evaluator should look for"
              multiline
              accent={Brand.cyan}
            />
            <TextField
              label="Max score"
              value={criterionForm.maxScore}
              onChangeText={(maxScore) => setCriterionForm({ ...criterionForm, maxScore })}
              keyboardType="number-pad"
              icon="numeric"
              accent={Brand.cyan}
            />
            <TextField
              label="Weight"
              value={criterionForm.weight}
              onChangeText={(weight) => setCriterionForm({ ...criterionForm, weight })}
              keyboardType="decimal-pad"
              icon="scale-balance"
              accent={Brand.cyan}
              hint="1 means normal. 2 counts this criterion double."
            />
          </>
        )}
      </Sheet>

      <Sheet
        visible={sessionForm !== null}
        onClose={() => setSessionForm(null)}
        title={sessionForm?.sessionId ? 'Edit session' : 'New session'}
        accent={Brand.green}
        footer={
          <>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setSessionForm(null)}
              style={styles.flex}
            />
            <Button
              label="Save"
              accent={Brand.green}
              loading={busy}
              disabled={!sessionForm?.name.trim()}
              onPress={async () => {
                if (!sessionForm) return;
                const ok = await run(
                  () =>
                    upsertSession({
                      sessionId: sessionForm.sessionId ?? undefined,
                      name: sessionForm.name,
                      day: Number(sessionForm.day) || 1,
                    }),
                  'Session saved',
                );
                if (ok) setSessionForm(null);
              }}
              style={styles.flex}
            />
          </>
        }>
        {!!sessionForm && (
          <>
            <TextField
              label="Session name"
              value={sessionForm.name}
              onChangeText={(name) => setSessionForm({ ...sessionForm, name })}
              placeholder="Day 1 - Midnight"
              icon="calendar-clock"
              accent={Brand.green}
            />
            <TextField
              label="Day"
              value={sessionForm.day}
              onChangeText={(day) => setSessionForm({ ...sessionForm, day })}
              keyboardType="number-pad"
              icon="numeric"
              accent={Brand.green}
            />
          </>
        )}
      </Sheet>

      <ConfirmDialog
        visible={wiping}
        title="Delete all participant data?"
        message="Teams, members, attendance, scores, chats and participant logins are removed permanently."
        confirmLabel="Delete everything"
        destructive
        loading={busy}
        onCancel={() => setWiping(false)}
        onConfirm={async () => {
          const ok = await run(
            () => clearParticipants({ confirm: 'DELETE' }),
            'Participant data cleared',
          );
          if (ok) setWiping(false);
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  list: { gap: Space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, flexWrap: 'wrap' },
  rowTitle: { color: Brand.text, fontSize: 14.5, fontWeight: '700' },
  rowMeta: { color: Brand.textMuted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { color: Brand.green, fontSize: 12, fontWeight: '800' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderSubtle,
  },
  dangerTitle: { color: Brand.red, fontSize: 15, fontWeight: '700' },
  dangerBody: { color: Brand.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: Space.sm },
  dangerButton: { marginTop: Space.lg, alignSelf: 'flex-start' },
}));
