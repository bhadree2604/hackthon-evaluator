import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/inputs';
import { ScoreSlider } from '@/components/ui/score-slider';
import { ConfirmDialog, Sheet, useToast } from '@/components/ui/overlays';
import {
  Banner,
  Card,
  EmptyState,
  Pill,
  ProgressBar,
  Section,
  withAlpha,
} from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { Radius, Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/lib/errors';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';

/**
 * One team's score sheet, for one round.
 *
 * A sheet belongs to (round, team, evaluator): the same team is scored again
 * in every round, and the rounds are what add up to the cumulative. The round
 * can be switched from the chips at the top without leaving the team.
 */
export default function ScoreSheet() {
  const Brand = useColors();
  const accent = useRoleTheme().evaluator.accent;
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();

  const params = useLocalSearchParams<{ id: string; roundId?: string }>();
  const teamId = params.id as Id<'teams'>;

  const detail = useQuery(api.scores.teamRounds, { teamId });
  const [picked, setPicked] = useState<Id<'rounds'> | null>(
    params.roundId ? (params.roundId as Id<'rounds'>) : null,
  );

  /**
   * Derived, not an effect: with no round in the link, open the first one
   * still accepting marks.
   */
  const roundId = useMemo(() => {
    if (!detail || detail.rounds.length === 0) return null;
    if (picked && detail.rounds.some((round) => round.roundId === picked)) return picked;
    return (detail.rounds.find((round) => round.status === 'open') ?? detail.rounds[0]).roundId;
  }, [detail, picked]);

  if (detail === undefined) {
    return (
      <Screen>
        <ScreenLoading label="Opening the sheet" />
      </Screen>
    );
  }

  if (detail === null) {
    return (
      <Screen>
        <EmptyState
          icon="account-question-outline"
          title="Team not found"
          message="It may have been removed since this screen was opened."
          action={<Button label="Go back" variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  if (detail.rounds.length === 0) {
    return (
      <Screen>
        <ScreenHeader eyebrow={detail.team.code} title={detail.team.name} />
        <EmptyState
          icon="clipboard-alert-outline"
          title="No evaluation rounds yet"
          message="An organiser creates the rounds, then opens the first one for scoring."
          action={<Button label="Go back" variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow={detail.team.code}
        title={detail.team.name}
        subtitle="Your marks are private until you submit them."
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

      <Section title="Round" hint="The same team is scored once in each round.">
        <View style={styles.chipWrap}>
          {detail.rounds.map((round) => {
            const active = round.roundId === roundId;
            return (
              <Pressable
                key={round.roundId}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setPicked(round.roundId)}
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
                {round.myState === 'submitted' && (
                  <MaterialCommunityIcons name="check-circle" size={13} color={Brand.green} />
                )}
                {round.myState === 'draft' && (
                  <MaterialCommunityIcons
                    name="circle-edit-outline"
                    size={13}
                    color={Brand.amber}
                  />
                )}
                {round.status === 'locked' && (
                  <MaterialCommunityIcons name="lock-outline" size={13} color={Brand.textFaint} />
                )}
              </Pressable>
            );
          })}
        </View>
      </Section>

      {!!roundId && (
        <RoundSheet
          key={roundId}
          teamId={teamId}
          roundId={roundId}
          accent={accent}
          onSaved={(message) => toast.show(message, 'success')}
        />
      )}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Pick an internal evaluator off the staff roster.
 *
 * The employee id field is the quick path for somebody who knows their own id;
 * this is for everybody else. Searches on id or name, and returns both, so the
 * sheet ends up with the id even when the person was found by name.
 */
function FacultyPicker({
  visible,
  accent,
  onClose,
  onPick,
}: {
  visible: boolean;
  accent: string;
  onClose: () => void;
  onPick: (person: { employeeId: string; name: string }) => void;
}) {
  const styles = useStyles();
  const [term, setTerm] = useState('');
  const results = useQuery(api.faculty.search, visible ? { query: term, limit: 40 } : 'skip');

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      accent={accent}
      title="Staff list"
      subtitle="Search by name or employee id."
      footer={<Button label="Close" variant="ghost" onPress={onClose} style={styles.flex} />}>
      <TextField
        label="Search"
        value={term}
        onChangeText={setTerm}
        placeholder="Name or employee id"
        accent={accent}
        icon="magnify"
        autoFocus
      />

      {results === undefined ? (
        <ScreenLoading label="Loading the staff list" />
      ) : results.rows.length === 0 ? (
        <EmptyState
          icon="account-search-outline"
          title="Nobody matches that"
          message="Check the spelling, or close this and type the employee id straight in."
        />
      ) : (
        <>
          <Text style={styles.signatureHint}>
            {results.matched} of {results.total} staff
          </Text>
          {results.rows.map((person) => (
            <Pressable
              key={person.employeeId}
              onPress={() => onPick(person)}
              style={styles.facultyRow}>
              <View style={styles.flex}>
                <Text style={styles.facultyName}>{person.name}</Text>
                <Text style={styles.signatureHint}>
                  {person.employeeId}
                  {person.department ? ` · dept ${person.department}` : ''}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={accent} />
            </Pressable>
          ))}
        </>
      )}
    </Sheet>
  );
}

function RoundSheet({
  teamId,
  roundId,
  accent,
  onSaved,
}: {
  teamId: Id<'teams'>;
  roundId: Id<'rounds'>;
  accent: string;
  onSaved: (message: string) => void;
}) {
  const Brand = useColors();
  const styles = useStyles();
  const toast = useToast();

  const sheet = useQuery(api.scores.mySheet, { roundId, teamId });
  const save = useMutation(api.scores.save);

  const [values, setValues] = useState<Record<string, number | null>>({});
  const [signature, setSignature] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null);
  const [confirming, setConfirming] = useState(false);

  /**
   * Internal (college faculty, known by employee id) or external (a guest).
   * Null until chosen: defaulting it would put an employee id field in front
   * of a visitor from another college.
   */
  const [kind, setKind] = useState<'internal' | 'external' | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [picking, setPicking] = useState(false);

  /**
   * The roster row for the id typed so far. Skipped entirely until the id is
   * long enough to be one, so the first keystroke does not fire a query.
   */
  const faculty = useQuery(
    api.faculty.lookup,
    kind === 'internal' && employeeId.trim().length >= 3
      ? { employeeId: employeeId.trim() }
      : 'skip',
  );

  /**
   * The server copy seeds the form once per (round, save). Re-seeding on every
   * update would fight the evaluator's thumb while they are still typing.
   */
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!sheet) return;
    const stamp = `${roundId}:${sheet.updatedAt ?? 'new'}`;
    if (seeded.current === stamp) return;
    seeded.current = stamp;

    const next: Record<string, number | null> = {};
    for (const criterion of sheet.criteria) next[criterion.key] = criterion.value;
    setValues(next);
    setSignature(sheet.evaluatorName);
    setNotes(sheet.notes);
    setKind(sheet.evaluatorKind);
    setEmployeeId(sheet.evaluatorEmployeeId);
  }, [roundId, sheet]);

  /**
   * The employee id fills in the name.
   *
   * Keyed on the id that was resolved, so it fires once when the lookup lands
   * and never again — the evaluator is free to correct the spelling afterwards
   * without it being overwritten on the next render.
   */
  const autofilled = useRef<string | null>(null);
  useEffect(() => {
    if (kind !== 'internal' || !faculty) return;
    if (autofilled.current === faculty.employeeId) return;
    autofilled.current = faculty.employeeId;
    setSignature(faculty.name);
  }, [kind, faculty]);

  const running = useMemo(() => {
    if (!sheet) return { total: 0, filled: 0 };
    let total = 0;
    let filled = 0;
    for (const criterion of sheet.criteria) {
      const value = values[criterion.key];
      if (typeof value === 'number') {
        total += value * criterion.weight;
        filled++;
      }
    }
    return { total, filled };
  }, [sheet, values]);

  if (sheet === undefined) return <ScreenLoading label="Loading the rubric" />;

  if (sheet.criteria.length === 0) {
    return (
      <EmptyState
        icon="format-list-checks"
        title="The rubric is empty"
        message="An organiser adds the criteria in Setup before any scoring can happen."
      />
    );
  }

  /**
   * A sheet is signed once the kind is chosen, a name is typed, and — for an
   * internal evaluator — an employee id is given. The id does not have to be
   * on the roster: a member of staff who joined after the export still scores.
   */
  const signed =
    signature.trim().length > 0 &&
    kind !== null &&
    (kind === 'external' || employeeId.trim().length > 0);
  const complete = running.filled === sheet.criteria.length && signed;
  const percent = sheet.maxTotal > 0 ? (running.total / sheet.maxTotal) * 100 : 0;

  async function write(submit: boolean) {
    if (!sheet) return;
    setBusy(submit ? 'submit' : 'draft');
    try {
      const payload = sheet.criteria
        .map((criterion) => ({ key: criterion.key, value: values[criterion.key] }))
        .filter((entry): entry is { key: string; value: number } => entry.value !== null);

      const result = await save({
        roundId,
        teamId,
        values: payload,
        evaluatorName: signature,
        ...(kind ? { evaluatorKind: kind } : {}),
        ...(kind === 'internal' ? { evaluatorEmployeeId: employeeId.trim() } : {}),
        notes,
        submit,
      });
      onSaved(
        submit
          ? `${result.evaluatorName} submitted ${result.total} of ${result.maxTotal} for ${result.roundName}`
          : 'Draft saved',
      );
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <>
      {!sheet.editable && (
        <Banner
          tone={sheet.round.status === 'locked' ? 'warn' : 'info'}
          title={
            sheet.round.status === 'locked'
              ? `${sheet.round.name} is locked`
              : `${sheet.round.name} has not opened yet`
          }
          message={
            sheet.round.status === 'locked'
              ? 'Marks are frozen. Ask an organiser to reopen the round if something needs changing.'
              : 'An organiser opens the round when scoring is due to start.'
          }
        />
      )}

      {sheet.submitted && sheet.editable && (
        <Banner
          tone="success"
          title="Submitted"
          message="This sheet counts towards the round. Changing it and submitting again replaces it."
        />
      )}

      {/*
        * Signed, not just logged in. One evaluator account is often passed
        * around a panel, so the sheet records who actually sat with the team
        * rather than whose phone it was typed on.
        */}
      <Card style={styles.signature}>
        {/* Which kind of evaluator is holding the phone. Nothing is preselected. */}
        <View style={styles.kindRow}>
          {(['internal', 'external'] as const).map((option) => (
            <Pressable
              key={option}
              disabled={!sheet.editable}
              onPress={() => {
                setKind(option);
                if (option === 'external') setEmployeeId('');
              }}
              style={[
                styles.kindChip,
                kind === option && {
                  borderColor: accent,
                  backgroundColor: withAlpha(accent, 0.14),
                },
              ]}>
              <MaterialCommunityIcons
                name={option === 'internal' ? 'school-outline' : 'account-tie-outline'}
                size={15}
                color={kind === option ? accent : Brand.textFaint}
              />
              <Text style={[styles.kindLabel, kind === option && { color: accent }]}>
                {option === 'internal' ? 'Internal' : 'External'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.signatureHint}>
          {kind === 'internal'
            ? 'College faculty. Enter your employee id and your name fills in.'
            : kind === 'external'
              ? 'Guest evaluator from outside the college. Your name is enough.'
              : 'Choose which you are before scoring this team.'}
        </Text>

        {kind === 'internal' && (
          <>
            <TextField
              label="Employee id"
              value={employeeId}
              onChangeText={setEmployeeId}
              placeholder="e.g. 1223"
              accent={accent}
              editable={sheet.editable}
              keyboardType="number-pad"
              icon="card-account-details-outline"
            />
            <View style={styles.signatureFoot}>
              <MaterialCommunityIcons
                name={
                  faculty
                    ? 'check-circle-outline'
                    : employeeId.trim().length >= 3
                      ? 'alert-circle-outline'
                      : 'magnify'
                }
                size={13}
                color={
                  faculty
                    ? Brand.green
                    : employeeId.trim().length >= 3
                      ? Brand.amber
                      : Brand.textFaint
                }
              />
              <Text style={styles.signatureHint}>
                {faculty
                  ? `${faculty.name} on the staff roster`
                  : employeeId.trim().length >= 3
                    ? 'Not on the roster. You can still type your name and carry on.'
                    : 'Type your id, or pick yourself from the list.'}
              </Text>
            </View>
            <Button
              label="Find me in the staff list"
              variant="secondary"
              size="sm"
              icon="account-search-outline"
              accent={accent}
              disabled={!sheet.editable}
              onPress={() => setPicking(true)}
            />
          </>
        )}

        {kind !== null && (
          <TextField
            label="Your name, as the evaluator of this team"
            value={signature}
            onChangeText={setSignature}
            placeholder="Type your name"
            accent={accent}
            editable={sheet.editable}
            autoCapitalize="words"
          />
        )}

        <View style={styles.signatureFoot}>
          <MaterialCommunityIcons
            name="account-check-outline"
            size={13}
            color={Brand.textFaint}
          />
          <Text style={styles.signatureHint}>
            {/*
              * Deliberately blank on a new sheet. The server sends back only
              * what was signed on this sheet, never the account name or the
              * last team's signature, so whoever is holding the phone has to
              * say who they are before this team can be scored. An employee id
              * fills it in, and it stays editable afterwards.
              */}
            Saved against {sheet.evaluatorEmail} and shown to the organisers with this round.
          </Text>
        </View>
      </Card>

      <FacultyPicker
        visible={picking}
        accent={accent}
        onClose={() => setPicking(false)}
        onPick={(person) => {
          setEmployeeId(person.employeeId);
          setSignature(person.name);
          setPicking(false);
        }}
      />

      <Card style={styles.tally}>
        <View style={styles.tallyTop}>
          <View>
            <Text style={styles.tallyLabel}>YOUR TOTAL</Text>
            <Text style={[styles.tallyValue, { color: accent }]}>
              {Math.round(running.total * 10) / 10}
              <Text style={styles.tallyMax}> / {sheet.maxTotal}</Text>
            </Text>
          </View>
          <Pill
            label={`${running.filled} of ${sheet.criteria.length} filled`}
            color={complete ? Brand.green : Brand.amber}
            compact
          />
        </View>
        <ProgressBar value={percent} color={accent} />
        <Text style={styles.tallyHint}>
          {sheet.round.weight === 1
            ? `This round adds up to ${sheet.maxTotal} towards the team's cumulative total.`
            : `Weighted ×${sheet.round.weight}, so this round adds up to ${
                sheet.maxTotal * sheet.round.weight
              } towards the cumulative.`}
        </Text>
      </Card>

      {sheet.criteria.map((criterion) => (
        <Card key={criterion.key} style={styles.criterion}>
          <View style={styles.criterionHead}>
            <View style={styles.flex}>
              <Text style={styles.criterionLabel}>{criterion.label}</Text>
              {!!criterion.description && (
                <Text style={styles.criterionHint}>{criterion.description}</Text>
              )}
            </View>
            {criterion.weight !== 1 && (
              <Pill label={`×${criterion.weight}`} color={Brand.lilac} compact />
            )}
          </View>

          <ScoreSlider
            value={values[criterion.key] ?? null}
            max={criterion.maxScore}
            accent={accent}
            disabled={!sheet.editable}
            onChange={(value) =>
              setValues((current) => ({ ...current, [criterion.key]: value }))
            }
          />
        </Card>
      ))}

      <TextField
        label="Notes for the organisers"
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything the panel should know about this team"
        multiline
        accent={accent}
        editable={sheet.editable}
      />

      {sheet.editable && (
        <View style={styles.actions}>
          <Button
            label="Save draft"
            variant="secondary"
            icon="content-save-outline"
            accent={accent}
            loading={busy === 'draft'}
            disabled={busy !== null}
            onPress={() => write(false)}
            style={styles.flex}
          />
          <Button
            label={sheet.submitted ? 'Resubmit' : 'Submit'}
            icon="check-bold"
            accent={accent}
            loading={busy === 'submit'}
            disabled={!complete || busy !== null}
            onPress={() => setConfirming(true)}
            style={styles.flex}
          />
        </View>
      )}

      {sheet.editable && !complete && (
        <Text style={styles.footnote}>
          {signed
            ? 'Fill in every criterion to submit. A draft can be saved at any point.'
            : 'Enter your name above, then fill in every criterion to submit.'}
        </Text>
      )}

      <ConfirmDialog
        visible={confirming}
        title={sheet.submitted ? 'Replace your submitted marks?' : 'Submit these marks?'}
        message={`${Math.round(running.total * 10) / 10} of ${sheet.maxTotal} for ${
          sheet.round.name
        }, signed by ${signature.trim()}. You can come back and change it while the round is open.`}
        confirmLabel={sheet.submitted ? 'Replace' : 'Submit'}
        loading={busy === 'submit'}
        onConfirm={() => write(true)}
        onCancel={() => setConfirming(false)}
      />
    </>
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

  signature: { gap: Space.sm },
  signatureFoot: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  signatureHint: { color: Brand.textFaint, flex: 1, fontSize: 11.5, lineHeight: 16 },

  kindRow: { flexDirection: 'row', gap: Space.sm },
  kindChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: withAlpha(Brand.text, 0.12),
  },
  kindLabel: { color: Brand.textDim, fontSize: 13, fontWeight: '700' },

  facultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(Brand.text, 0.07),
  },
  facultyName: { color: Brand.text, fontSize: 14, fontWeight: '600' },

  tally: { gap: Space.md },
  tallyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tallyLabel: {
    color: Brand.textFaint,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tallyValue: { fontSize: 30, fontWeight: '800', letterSpacing: -1, marginTop: 2 },
  tallyMax: { color: Brand.textFaint, fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  tallyHint: { color: Brand.textFaint, fontSize: 11.5, lineHeight: 16 },

  criterion: { gap: Space.md },
  criterionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm },
  criterionLabel: { color: Brand.text, fontSize: 15.5, fontWeight: '700' },
  criterionHint: { color: Brand.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },

  actions: { flexDirection: 'row', gap: Space.sm },
  footnote: { color: Brand.textFaint, fontSize: 12, textAlign: 'center', lineHeight: 17 },
}));
