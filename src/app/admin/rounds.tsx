import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { Button, IconButton } from '@/components/ui/button';
import { TextField } from '@/components/ui/inputs';
import { ConfirmDialog, Sheet, useToast } from '@/components/ui/overlays';
import {
  Banner,
  Card,
  EmptyState,
  Pill,
  ProgressBar,
  Section,
  StatCard,
  StatGrid,
  withAlpha,
} from '@/components/ui/primitives';
import { ScoreSlider } from '@/components/ui/score-slider';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { Radius, Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/lib/errors';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';

/**
 * Evaluation rounds.
 *
 * Every round is scored on the same rubric; a round owns its own sheets and
 * its weight in the cumulative. A round's status controls the evaluators only.
 * Teams are never shown a single round: the results go out once, at the end,
 * from the card at the top of this screen.
 */

const ROUND_COUNTS = [3, 4, 5, 6];

export default function AdminRounds() {
  const Brand = useColors();
  const accent = useRoleTheme().admin.accent;
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();

  const data = useQuery(api.rounds.overview, {});
  const seed = useMutation(api.rounds.seed);
  const upsert = useMutation(api.rounds.upsert);
  const setStatus = useMutation(api.rounds.setStatus);
  const remove = useMutation(api.rounds.remove);

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{
    roundId?: Id<'rounds'>;
    name: string;
    description: string;
    weight: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<{ roundId: Id<'rounds'>; name: string } | null>(null);
  const [viewingPanel, setViewingPanel] = useState<Id<'rounds'> | null>(null);

  if (data === undefined) {
    return (
      <Screen bottomInset={TAB_BAR_INSET}>
        <ScreenLoading label="Loading rounds" />
      </Screen>
    );
  }

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      toast.show(message, 'success');
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  const totalWeight = data.rounds.reduce((sum, round) => sum + round.weight, 0);
  const openCount = data.rounds.filter((r) => r.status === 'open').length;

  return (
    <Screen bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow="Evaluation"
        title="Rounds"
        subtitle="Each round is scored on the same rubric. The cumulative is what decides the winners."
        right={
          <IconButton
            icon="plus"
            accessibilityLabel="Add a round"
            color={accent}
            background={withAlpha(accent, 0.14)}
            onPress={() => setEditing({ name: '', description: '', weight: '1' })}
          />
        }
      />

      {data.criteriaCount === 0 && (
        <Banner
          tone="warn"
          title="The rubric is empty"
          message="Rounds cannot be scored until the criteria exist. Seed the default rubric in Setup first."
          action={
            <Button
              label="Go to Setup"
              size="sm"
              variant="secondary"
              accent={accent}
              onPress={() => router.push('/admin/setup' as never)}
            />
          }
        />
      )}

      <FinalResults accent={accent} />

      {data.rounds.length === 0 ? (
        <EmptyState
          icon="numeric"
          title="No rounds yet"
          message="Create the rounds you plan to run. You can rename them, reweight them and add more at any time."
          action={
            <View style={styles.seedRow}>
              {ROUND_COUNTS.map((count) => (
                <Button
                  key={count}
                  label={`${count} rounds`}
                  size="sm"
                  variant={count === 5 ? 'primary' : 'secondary'}
                  accent={accent}
                  loading={busy}
                  onPress={() =>
                    run(() => seed({ count }), `${count} rounds created as drafts`)
                  }
                />
              ))}
            </View>
          }
        />
      ) : (
        <>
          <StatGrid>
            <StatCard
              label="Rounds"
              value={data.rounds.length}
              sub={`${openCount} open for scoring`}
              icon="numeric"
              color={accent}
            />
            <StatCard
              label="Teams"
              value={data.teamCount}
              sub={`${data.evaluatorCount} evaluators`}
              icon="account-group-outline"
              color={Brand.cyan}
            />
            <StatCard
              label="Rubric"
              value={data.maxTotal}
              sub={`${data.criteriaCount} criteria per sheet`}
              icon="format-list-checks"
              color={Brand.lilac}
            />
            <StatCard
              label="Total weight"
              value={totalWeight}
              sub="Sum of every round's weight"
              icon="scale-balance"
              color={Brand.amber}
            />
          </StatGrid>

          <Section title="The rounds" hint="Tap a round to rename it or change its weight.">
            {data.rounds.map((round) => {
              const coverage =
                round.teamsTotal > 0 ? (round.teamsScored / round.teamsTotal) * 100 : 0;
              const tone =
                round.status === 'open'
                  ? Brand.green
                  : round.status === 'locked'
                    ? Brand.amber
                    : Brand.textFaint;

              return (
                <Card key={round._id} style={styles.round}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${round.name}`}
                    onPress={() =>
                      setEditing({
                        roundId: round._id,
                        name: round.name,
                        description: round.description ?? '',
                        weight: String(round.weight),
                      })
                    }
                    style={({ pressed }) => [styles.roundHead, pressed && styles.pressed]}>
                    <View style={styles.flex}>
                      <Text style={styles.roundName}>{round.name}</Text>
                      {!!round.description && (
                        <Text style={styles.roundHint}>{round.description}</Text>
                      )}
                    </View>
                    <MaterialCommunityIcons
                      name="pencil-outline"
                      size={16}
                      color={Brand.textFaint}
                    />
                  </Pressable>

                  <View style={styles.pillRow}>
                    <Pill
                      label={
                        round.status === 'open'
                          ? 'Open for scoring'
                          : round.status === 'locked'
                            ? 'Locked'
                            : 'Draft'
                      }
                      icon={
                        round.status === 'open'
                          ? 'lock-open-variant-outline'
                          : round.status === 'locked'
                            ? 'lock-outline'
                            : 'pencil-outline'
                      }
                      color={tone}
                      compact
                    />
                    <Pill label={`Weight ×${round.weight}`} color={Brand.lilac} compact />
                    <Pill label={`out of ${data.maxTotal}`} color={Brand.textFaint} compact />
                  </View>

                  <View style={styles.coverage}>
                    <View style={styles.coverageTop}>
                      <Text style={styles.coverageLabel}>
                        {round.teamsScored} of {round.teamsTotal} teams scored
                      </Text>
                      <Text style={styles.coverageValue}>
                        {round.averagePercent === null
                          ? 'No marks yet'
                          : `avg ${Math.round(round.averagePercent)}%`}
                      </Text>
                    </View>
                    <ProgressBar value={coverage} color={tone} />
                    <Text style={styles.coverageHint}>
                      {round.sheets} submitted sheet{round.sheets === 1 ? '' : 's'}
                      {round.drafts > 0 ? ` · ${round.drafts} still in draft` : ''}
                    </Text>
                  </View>

                  <Button
                    label="Who scored this round"
                    size="sm"
                    variant="secondary"
                    icon="account-search-outline"
                    accent={Brand.cyan}
                    onPress={() => setViewingPanel(round._id)}
                    full
                  />

                  <View style={styles.roundActions}>
                    {round.status !== 'open' && (
                      <Button
                        label="Open"
                        size="sm"
                        icon="lock-open-variant-outline"
                        accent={Brand.green}
                        loading={busy}
                        onPress={() =>
                          run(
                            () => setStatus({ roundId: round._id, status: 'open' }),
                            `${round.name} is open for scoring`,
                          )
                        }
                        style={styles.flex}
                      />
                    )}
                    {round.status === 'open' && (
                      <Button
                        label="Lock"
                        size="sm"
                        variant="secondary"
                        icon="lock-outline"
                        accent={Brand.amber}
                        loading={busy}
                        onPress={() =>
                          run(
                            () => setStatus({ roundId: round._id, status: 'locked' }),
                            `${round.name} is locked`,
                          )
                        }
                        style={styles.flex}
                      />
                    )}
                    <IconButton
                      icon="trash-can-outline"
                      accessibilityLabel={`Delete ${round.name}`}
                      color={Brand.red}
                      background={withAlpha(Brand.red, 0.12)}
                      onPress={() => setDeleting({ roundId: round._id, name: round.name })}
                    />
                  </View>
                </Card>
              );
            })}
          </Section>

          <Card style={styles.explainer}>
            <Text style={styles.explainerTitle}>How the cumulative is worked out</Text>
            <Text style={styles.explainerBody}>
              Each round gives a team a percentage: the average of the submitted evaluator
              sheets for that round. The cumulative is those percentages combined by round
              weight, so a round weighted ×2 counts twice as much as one weighted ×1. Draft
              sheets never count, and a draft round is left out entirely.
            </Text>
            <Button
              label="Open the leaderboard"
              variant="secondary"
              icon="trophy-outline"
              accent={accent}
              onPress={() => router.push('/admin/leaderboard' as never)}
            />
          </Card>
        </>
      )}

      <Sheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        accent={accent}
        title={editing?.roundId ? 'Edit round' : 'New round'}
        subtitle="Weight decides how much this round counts towards the cumulative."
        footer={
          <>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setEditing(null)}
              style={styles.flex}
            />
            <Button
              label="Save"
              accent={accent}
              loading={busy}
              disabled={!editing?.name.trim()}
              onPress={async () => {
                if (!editing) return;
                const weight = Number(editing.weight);
                await run(
                  () =>
                    upsert({
                      roundId: editing.roundId,
                      name: editing.name,
                      description: editing.description || undefined,
                      weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
                    }),
                  editing.roundId ? 'Round updated' : 'Round created as a draft',
                );
                setEditing(null);
              }}
              style={styles.flex}
            />
          </>
        }>
        <TextField
          label="Name"
          value={editing?.name ?? ''}
          onChangeText={(name) => setEditing((current) => (current ? { ...current, name } : current))}
          placeholder="Round 3 - Mid review"
          accent={accent}
        />
        <TextField
          label="What this round is for"
          value={editing?.description ?? ''}
          onChangeText={(description) =>
            setEditing((current) => (current ? { ...current, description } : current))
          }
          placeholder="Shown to evaluators above the rubric"
          multiline
          accent={accent}
        />
        <TextField
          label="Weight"
          value={editing?.weight ?? '1'}
          onChangeText={(weight) =>
            setEditing((current) => (current ? { ...current, weight } : current))
          }
          keyboardType="decimal-pad"
          hint="1 counts once. 2 counts double. Used only for the cumulative."
          accent={accent}
        />
      </Sheet>

      <RoundPanelSheet
        roundId={viewingPanel}
        accent={accent}
        onClose={() => setViewingPanel(null)}
      />

      <ConfirmDialog
        visible={deleting !== null}
        title={`Delete ${deleting?.name ?? 'this round'}?`}
        message="Every sheet written in this round is deleted with it. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await run(() => remove({ roundId: deleting.roundId }), `${deleting.name} deleted`);
          setDeleting(null);
        }}
      />
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The one switch that releases the marks.
 *
 * Teams see nothing until this is on, and when it goes on they see everything
 * at once: their cumulative, the rounds behind it and the whole leaderboard.
 * Publishing is blocked while a round is still open or a team has a round with
 * no marks, because either would rank someone against a zero they never earned.
 */
function FinalResults({ accent }: { accent: string }) {
  const Brand = useColors();
  const styles = useStyles();
  const toast = useToast();

  const state = useQuery(api.results.readiness, {});
  const setPublished = useMutation(api.results.setPublished);
  const [confirming, setConfirming] = useState<'publish' | 'hide' | null>(null);
  const [busy, setBusy] = useState(false);

  if (state === undefined) return null;

  const blockers: string[] = [];
  if (state.roundCount === 0) blockers.push('No rounds have been created yet.');
  if (state.openRounds.length > 0) {
    blockers.push(
      `${state.openRounds.join(', ')} ${
        state.openRounds.length === 1 ? 'is' : 'are'
      } still open, so marks could still change.`,
    );
  }
  if (state.incompleteCount > 0) {
    blockers.push(
      `${state.incompleteCount} team${
        state.incompleteCount === 1 ? '' : 's'
      } have a round with no marks: ${state.incomplete
        .slice(0, 4)
        .map((team) => team.code)
        .join(', ')}${state.incompleteCount > 4 ? ' and more' : ''}.`,
    );
  }

  async function apply(published: boolean) {
    setBusy(true);
    try {
      const result = await setPublished({ published });
      toast.show(
        result.published
          ? `Results are out. ${result.announced} participants notified.`
          : 'Results hidden from teams again.',
        'success',
      );
      setConfirming(null);
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Final results" hint="One release, at the end, for every team at once.">
      <Card style={styles.publishCard}>
        <View style={styles.publishTop}>
          <View
            style={[
              styles.publishMark,
              {
                backgroundColor: withAlpha(state.published ? Brand.green : Brand.textFaint, 0.14),
              },
            ]}>
            <MaterialCommunityIcons
              name={state.published ? 'trophy' : 'trophy-outline'}
              size={22}
              color={state.published ? Brand.green : Brand.textFaint}
            />
          </View>
          <View style={styles.flex}>
            <Text style={styles.publishTitle}>
              {state.published ? 'Published to every team' : 'Not published'}
            </Text>
            <Text style={styles.publishHint}>
              {state.published
                ? 'Teams can see their cumulative, every round behind it, and the leaderboard.'
                : 'Teams see nothing at all until you release the results.'}
            </Text>
          </View>
        </View>

        <View style={styles.checkList}>
          <Check
            ok={state.roundCount > 0 && state.openRounds.length === 0}
            label={
              state.roundCount === 0
                ? 'No rounds yet'
                : state.openRounds.length === 0
                  ? `${state.roundCount} rounds, all closed to scoring`
                  : `${state.openRounds.length} of ${state.roundCount} rounds still open`
            }
          />
          <Check
            ok={state.incompleteCount === 0 && state.teamCount > 0}
            label={`${state.teamsFullyScored} of ${state.teamCount} teams scored in every round`}
          />
          <Check
            ok={state.sheets > 0}
            label={`${state.sheets} submitted sheet${state.sheets === 1 ? '' : 's'} from ${
              state.evaluatorCount
            } evaluator${state.evaluatorCount === 1 ? '' : 's'}`}
          />
        </View>

        {state.preview.length > 0 && (
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>
              TOP OF THE BOARD · OUT OF {state.maxPoints}
            </Text>
            {state.preview.map((team) => (
              <View key={team.code} style={styles.previewRow}>
                <Text style={styles.previewRank}>{team.rank ?? '–'}</Text>
                <Text style={styles.previewName} numberOfLines={1}>
                  {team.name}
                </Text>
                <Text style={styles.previewCode}>{team.code}</Text>
                <Text style={[styles.previewPoints, { color: accent }]}>
                  {Math.round(team.points * 10) / 10}
                </Text>
              </View>
            ))}
          </View>
        )}

        {!state.published && blockers.length > 0 && (
          <Banner
            tone="warn"
            title="Not ready to publish"
            message={blockers.join(' ')}
          />
        )}

        <Button
          label={state.published ? 'Hide the results again' : 'Publish final results'}
          icon={state.published ? 'eye-off-outline' : 'trophy'}
          variant={state.published ? 'secondary' : 'primary'}
          accent={state.published ? Brand.amber : Brand.green}
          size="lg"
          full
          loading={busy}
          disabled={!state.published && !state.ready}
          onPress={() => setConfirming(state.published ? 'hide' : 'publish')}
        />
      </Card>

      <ConfirmDialog
        visible={confirming !== null}
        title={confirming === 'hide' ? 'Hide the results?' : 'Publish the final results?'}
        message={
          confirming === 'hide'
            ? 'Every team loses sight of its marks and the leaderboard until you publish again.'
            : `All ${state.teamCount} teams see their cumulative out of ${state.maxPoints}, the rounds behind it and the full standings. Everyone is notified straight away.`
        }
        confirmLabel={confirming === 'hide' ? 'Hide' : 'Publish'}
        destructive={confirming === 'hide'}
        loading={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => apply(confirming === 'publish')}
      />
    </Section>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  const Brand = useColors();
  const styles = useStyles();
  return (
    <View style={styles.checkRow}>
      <MaterialCommunityIcons
        name={ok ? 'check-circle' : 'alert-circle-outline'}
        size={15}
        color={ok ? Brand.green : Brand.amber}
      />
      <Text style={styles.checkText}>{label}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/** What the master organiser may change on a sheet. Everything is optional. */
type SheetPatch = {
  values?: { key: string; value: number }[];
  evaluatorName?: string;
  notes?: string;
  submitted?: boolean;
};

type PanelData = NonNullable<
  ReturnType<typeof useQuery<typeof api.scores.roundSheets>>
>;
type PanelRow = PanelData['rows'][number];

/**
 * One sheet, opened for correction by the master organiser.
 *
 * Mounted only while that row is being edited and keyed by the sheet id, so
 * every piece of state seeds itself from the row on mount. That keeps the
 * marks out of an effect: React Compiler is on for this project and rejects
 * the usual ref-and-effect seeding, and there is nothing here that needs to
 * follow the server once the form is open.
 */
function SheetEditor({
  row,
  criteria,
  maxTotal,
  accent,
  busy,
  onCancel,
  onSave,
}: {
  row: PanelRow;
  criteria: PanelData['criteria'];
  /**
   * The *current* rubric's maximum, not the one stored on the sheet. A sheet
   * written before the rubric changed is re-tallied against today's criteria
   * when it is saved, so showing its old maximum here would misreport what the
   * correction is about to produce.
   */
  maxTotal: number;
  accent: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: SheetPatch) => void;
}) {
  const Brand = useColors();
  const styles = useStyles();

  const [values, setValues] = useState<Record<string, number | null>>(() => {
    const byKey = new Map(row.values.map((entry) => [entry.key, entry.value]));
    const seeded: Record<string, number | null> = {};
    for (const criterion of criteria) seeded[criterion.key] = byKey.get(criterion.key) ?? null;
    return seeded;
  });
  const [signature, setSignature] = useState(row.evaluatorName);
  const [notes, setNotes] = useState(row.notes ?? '');
  const [submitted, setSubmitted] = useState(row.submitted);

  const running = useMemo(() => {
    let total = 0;
    let filled = 0;
    for (const criterion of criteria) {
      const value = values[criterion.key];
      if (typeof value === 'number') {
        total += value * criterion.weight;
        filled++;
      }
    }
    return { total, filled };
  }, [criteria, values]);

  const signed = signature.trim().length > 0;
  const complete = running.filled === criteria.length;
  /** Matches the server: a submitted sheet has to carry every criterion. */
  const blocked = !signed || (submitted && !complete);

  return (
    <Card style={styles.editor}>
      <View style={styles.editorHead}>
        <MaterialCommunityIcons name="pencil-outline" size={15} color={accent} />
        <Text style={styles.editorTitle}>Correcting {row.evaluatorName}&apos;s sheet</Text>
      </View>

      <TextField
        label="Signed by"
        value={signature}
        onChangeText={setSignature}
        placeholder="Who scored this team"
        accent={accent}
        autoCapitalize="words"
      />

      {criteria.map((criterion) => (
        <View key={criterion.key} style={styles.editorCriterion}>
          <View style={styles.editorCriterionHead}>
            <Text style={styles.editorCriterionLabel} numberOfLines={1}>
              {criterion.label}
            </Text>
            <Text style={[styles.editorCriterionValue, { color: accent }]}>
              {values[criterion.key] ?? '—'}
              <Text style={styles.panelMax}> / {criterion.maxScore}</Text>
            </Text>
          </View>
          <ScoreSlider
            value={values[criterion.key] ?? null}
            max={criterion.maxScore}
            accent={accent}
            onChange={(value) => setValues((prev) => ({ ...prev, [criterion.key]: value }))}
          />
        </View>
      ))}

      <TextField
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional"
        accent={accent}
        multiline
      />

      <Pressable
        onPress={() => setSubmitted((prev) => !prev)}
        style={styles.editorToggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: submitted }}>
        <MaterialCommunityIcons
          name={submitted ? 'check-circle' : 'circle-edit-outline'}
          size={17}
          color={submitted ? Brand.green : Brand.amber}
        />
        <View style={styles.flex}>
          <Text style={styles.editorToggleLabel}>
            {submitted ? 'Counts towards the round' : 'Draft, not counted'}
          </Text>
          <Text style={styles.panelMeta}>
            {submitted
              ? 'Tap to drop it back to a draft and out of the average.'
              : 'Tap to submit it so it counts.'}
          </Text>
        </View>
      </Pressable>

      <View style={styles.editorTotal}>
        <Text style={styles.editorTotalLabel}>
          {running.filled} of {criteria.length} scored
        </Text>
        <Text style={[styles.panelTotal, { color: accent }]}>
          {Math.round(running.total * 10) / 10}
          <Text style={styles.panelMax}> / {maxTotal}</Text>
        </Text>
      </View>

      {!signed && <Text style={styles.panelWarn}>A sheet has to stay signed by somebody.</Text>}
      {signed && submitted && !complete && (
        <Text style={styles.panelWarn}>
          Fill in every criterion, or drop this back to a draft before saving.
        </Text>
      )}

      <View style={styles.editorActions}>
        <Button
          label="Cancel"
          variant="ghost"
          size="sm"
          onPress={onCancel}
          style={styles.flex}
        />
        <Button
          label="Save"
          size="sm"
          icon="content-save-outline"
          accent={accent}
          loading={busy}
          disabled={blocked}
          style={styles.flex}
          onPress={() =>
            onSave({
              values: criteria
                .map((criterion) => ({ key: criterion.key, value: values[criterion.key] }))
                .filter((entry): entry is { key: string; value: number } => entry.value !== null),
              evaluatorName: signature,
              notes,
              submitted,
            })
          }
        />
      </View>
    </Card>
  );
}

/**
 * Who evaluated what, for one round.
 *
 * The leaderboard says what a team scored; this says who gave it. Sheets are
 * grouped by team and carry the name the evaluator signed alongside the login
 * it was written from, so a mark a team queries can be traced to a person
 * rather than to an account a whole panel was sharing.
 *
 * The master organiser — the account named by MASTER_ADMIN_EMAIL on the
 * deployment — also gets to correct or delete a sheet from here. No other
 * organiser is offered the controls, and the server checks again regardless.
 */
function RoundPanelSheet({
  roundId,
  accent,
  onClose,
}: {
  roundId: Id<'rounds'> | null;
  accent: string;
  onClose: () => void;
}) {
  const Brand = useColors();
  const styles = useStyles();
  const toast = useToast();
  const data = useQuery(api.scores.roundSheets, roundId ? { roundId } : 'skip');
  const updateSheet = useMutation(api.scores.updateSheet);
  const removeSheet = useMutation(api.scores.removeSheet);

  const [editing, setEditing] = useState<Id<'scores'> | null>(null);
  const [removing, setRemoving] = useState<Id<'scores'> | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveSheet(sheetId: Id<'scores'>, patch: SheetPatch) {
    setBusy(true);
    try {
      const result = await updateSheet({ sheetId, ...patch });
      toast.show(
        `${result.evaluatorName}: ${Math.round(result.total * 10) / 10} of ${result.maxTotal}`,
        'success',
      );
      setEditing(null);
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(sheetId: Id<'scores'>, name: string) {
    setBusy(true);
    try {
      await removeSheet({ sheetId });
      toast.show(`${name}'s sheet deleted`, 'success');
      setRemoving(null);
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo(() => {
    if (!data) return [];
    const byTeam = new Map<string, { code: string; name: string; rows: typeof data.rows }>();
    for (const row of data.rows) {
      const existing = byTeam.get(row.teamId);
      if (existing) existing.rows.push(row);
      else byTeam.set(row.teamId, { code: row.teamCode, name: row.teamName, rows: [row] });
    }
    return [...byTeam.values()];
  }, [data]);

  /** Never leave a half-typed correction open behind the panel. */
  function close() {
    setEditing(null);
    setRemoving(null);
    onClose();
  }

  return (
    <Sheet
      visible={roundId !== null}
      onClose={close}
      accent={accent}
      title={data ? `Who scored ${data.round.name}` : 'Who scored this round'}
      subtitle={
        data?.canManage
          ? 'The name each evaluator signed. You can correct or delete a sheet here.'
          : 'The name each evaluator signed, and the login the sheet came from.'
      }
      footer={<Button label="Close" variant="ghost" onPress={close} style={styles.flex} />}>
      {data === undefined ? (
        <ScreenLoading label="Loading the panel" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          title="Nobody has scored this round yet"
          message="Sheets appear here the moment an evaluator saves one, draft or submitted."
        />
      ) : (
        <>
          <View style={styles.pillRow}>
            <Pill
              label={`${data.submitted} submitted`}
              icon="check-circle-outline"
              color={Brand.green}
              compact
            />
            {data.drafts > 0 && (
              <Pill
                label={`${data.drafts} in draft`}
                icon="circle-edit-outline"
                color={Brand.amber}
                compact
              />
            )}
            <Pill
              label={`${data.evaluators} evaluator${data.evaluators === 1 ? '' : 's'}`}
              icon="account-multiple-outline"
              color={Brand.cyan}
              compact
            />
            <Pill
              label={`${data.teamsScored} team${data.teamsScored === 1 ? '' : 's'}`}
              icon="account-group-outline"
              color={Brand.lilac}
              compact
            />
          </View>

          {groups.map((group) => (
            <Card key={group.code} style={styles.panelTeam}>
              <View style={styles.panelTeamHead}>
                <Text style={[styles.panelTeamCode, { color: accent }]}>{group.code}</Text>
                <Text style={styles.panelTeamName} numberOfLines={1}>
                  {group.name}
                </Text>
              </View>

              {group.rows.map((row) =>
                editing === row._id ? (
                  /*
                   * Keyed by the sheet id and mounted only while it is open, so
                   * the form seeds itself from the row on mount and no effect
                   * has to copy the server value into state.
                   */
                  <SheetEditor
                    key={row._id}
                    row={row}
                    criteria={data.criteria}
                    maxTotal={data.maxTotal}
                    accent={accent}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={(patch) => saveSheet(row._id, patch)}
                  />
                ) : (
                  <View key={row._id} style={styles.panelRow}>
                    <MaterialCommunityIcons
                      name={row.submitted ? 'check-circle' : 'circle-edit-outline'}
                      size={15}
                      color={row.submitted ? Brand.green : Brand.amber}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.panelName}>{row.evaluatorName}</Text>
                      <Text style={styles.panelMeta}>
                        {row.evaluatorEmail ?? 'no login on record'}
                      </Text>
                      {!!row.signedForAnother && (
                        <Text style={styles.panelWarn}>
                          Written from {row.signedForAnother}&apos;s account
                        </Text>
                      )}
                      {!!row.notes && <Text style={styles.panelNote}>{row.notes}</Text>}

                      {/*
                        * Asked inline rather than in a dialog: this panel is
                        * already a modal, and stacking a second one over it is
                        * unreliable on Android.
                        */}
                      {removing === row._id && (
                        <View style={styles.panelConfirm}>
                          <Text style={styles.panelWarn}>
                            Delete this sheet? The round&apos;s mark for {group.code} is the
                            average of its sheets, so this moves the team. It cannot be undone.
                          </Text>
                          <View style={styles.panelConfirmRow}>
                            <Button
                              label="Cancel"
                              variant="ghost"
                              size="sm"
                              onPress={() => setRemoving(null)}
                              style={styles.flex}
                            />
                            <Button
                              label="Delete"
                              variant="danger"
                              size="sm"
                              icon="trash-can-outline"
                              loading={busy}
                              onPress={() => removeRow(row._id, row.evaluatorName)}
                              style={styles.flex}
                            />
                          </View>
                        </View>
                      )}
                    </View>
                    <View style={styles.panelScore}>
                      <Text style={[styles.panelTotal, { color: accent }]}>
                        {Math.round(row.total * 10) / 10}
                        <Text style={styles.panelMax}> / {row.maxTotal}</Text>
                      </Text>
                      <Text style={styles.panelMeta}>
                        {new Date(row.updatedAt).toLocaleString([], {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      {/* Only the master organiser is offered these. */}
                      {data.canManage && removing !== row._id && (
                        <View style={styles.panelActions}>
                          <IconButton
                            icon="pencil-outline"
                            size={16}
                            accessibilityLabel={`Edit ${row.evaluatorName}'s sheet`}
                            onPress={() => {
                              setRemoving(null);
                              setEditing(row._id);
                            }}
                          />
                          <IconButton
                            icon="trash-can-outline"
                            size={16}
                            color={Brand.red}
                            accessibilityLabel={`Delete ${row.evaluatorName}'s sheet`}
                            onPress={() => {
                              setEditing(null);
                              setRemoving(row._id);
                            }}
                          />
                        </View>
                      )}
                    </View>
                  </View>
                ),
              )}
            </Card>
          ))}
        </>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },

  publishCard: { gap: Space.lg },
  publishTop: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  publishMark: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishTitle: { color: Brand.text, fontSize: 15.5, fontWeight: '700' },
  publishHint: { color: Brand.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },

  checkList: { gap: 7 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  checkText: { color: Brand.textDim, fontSize: 12.5, flex: 1, lineHeight: 17 },

  preview: { gap: 5 },
  previewLabel: {
    color: Brand.textFaint,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  previewRank: {
    color: Brand.textFaint,
    fontSize: 12,
    fontWeight: '800',
    width: 16,
  },
  previewName: { color: Brand.text, fontSize: 13, fontWeight: '700', flex: 1 },
  previewCode: { color: Brand.textFaint, fontSize: 10.5 },
  previewPoints: { fontSize: 13, fontWeight: '800', minWidth: 46, textAlign: 'right' },
  pressed: { opacity: 0.65 },

  seedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, justifyContent: 'center' },

  round: { gap: Space.md },
  roundHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  roundName: { color: Brand.text, fontSize: 16, fontWeight: '700' },
  roundHint: { color: Brand.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },

  coverage: { gap: 6 },
  coverageTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  coverageLabel: { color: Brand.textDim, fontSize: 12.5, fontWeight: '600' },
  coverageValue: { color: Brand.textMuted, fontSize: 12, fontWeight: '700' },
  coverageHint: { color: Brand.textFaint, fontSize: 11.5 },

  roundActions: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },

  panelTeam: { gap: Space.md },
  panelTeamHead: { flexDirection: 'row', alignItems: 'baseline', gap: Space.sm },
  panelTeamCode: { fontSize: 12.5, fontWeight: '800', letterSpacing: 1 },
  panelTeamName: { color: Brand.text, fontSize: 14.5, fontWeight: '700', flex: 1 },
  panelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm },
  panelName: { color: Brand.text, fontSize: 14, fontWeight: '700' },
  panelMeta: { color: Brand.textFaint, fontSize: 11, marginTop: 2 },
  panelWarn: { color: Brand.amber, fontSize: 11, marginTop: 2 },
  panelNote: { color: Brand.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  panelScore: { alignItems: 'flex-end' },
  panelTotal: { fontSize: 15, fontWeight: '800' },
  panelMax: { color: Brand.textFaint, fontSize: 11, fontWeight: '700' },
  panelActions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  panelConfirm: {
    gap: Space.sm,
    marginTop: Space.sm,
    padding: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: withAlpha(Brand.red, 0.1),
  },
  panelConfirmRow: { flexDirection: 'row', gap: Space.sm },

  editor: {
    gap: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: withAlpha(Brand.text, 0.12),
  },
  editorHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editorTitle: { color: Brand.text, fontSize: 13.5, fontWeight: '700', flex: 1 },
  editorCriterion: { gap: 4 },
  editorCriterionHead: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  editorCriterionLabel: { color: Brand.textDim, fontSize: 12.5, flex: 1 },
  editorCriterionValue: { fontSize: 13.5, fontWeight: '800' },
  editorToggle: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  editorToggleLabel: { color: Brand.text, fontSize: 13, fontWeight: '600' },
  editorTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorTotalLabel: { color: Brand.textMuted, fontSize: 12 },
  editorActions: { flexDirection: 'row', gap: Space.sm },

  explainer: { gap: Space.md, borderRadius: Radius.lg },
  explainerTitle: { color: Brand.text, fontSize: 15, fontWeight: '700' },
  explainerBody: { color: Brand.textMuted, fontSize: 13, lineHeight: 20 },
}));
