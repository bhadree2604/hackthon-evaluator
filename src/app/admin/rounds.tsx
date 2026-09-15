import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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

  explainer: { gap: Space.md, borderRadius: Radius.lg },
  explainerTitle: { color: Brand.text, fontSize: 15, fontWeight: '700' },
  explainerBody: { color: Brand.textMuted, fontSize: 13, lineHeight: 20 },
}));
