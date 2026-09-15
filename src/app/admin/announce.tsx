import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { AnnouncementFeed } from '@/components/announcement-feed';
import { TAB_BAR_INSET } from '@/components/role-shell';
import { Button } from '@/components/ui/button';
import { OptionPicker, TextField, Toggle } from '@/components/ui/inputs';
import { ConfirmDialog, useToast } from '@/components/ui/overlays';
import { Banner, Card, Section, withAlpha } from '@/components/ui/primitives';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/lib/errors';
import { useNotifications } from '@/lib/notifications';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';


type Audience = 'all' | 'participants' | 'coordinators' | 'evaluators' | 'admins';
type Role = 'admin' | 'evaluator' | 'coordinator' | 'participant';

/** Mirrors AUDIENCE_ROLES in convex/announcements.ts. */
const AUDIENCE_ROLES: Record<Audience, Role[] | undefined> = {
  all: undefined,
  participants: ['participant'],
  coordinators: ['coordinator'],
  evaluators: ['evaluator'],
  admins: ['admin'],
};

const PRESETS: { title: string; body: string; urgent: boolean }[] = [
  { title: 'Report to your lab', body: 'Please return to your assigned lab now.', urgent: true },
  {
    title: 'Attendance check',
    body: 'Attendance is being taken. Stay at your table until your coordinator marks you.',
    urgent: true,
  },
  { title: 'Food is served', body: 'Head to the dining hall for your break.', urgent: false },
  {
    title: 'Judging round starting',
    body: 'Evaluators are on the floor. Be ready to demo in five minutes.',
    urgent: true,
  },
  {
    title: 'Final submission soon',
    body: 'Submissions close in 30 minutes. Push your work and prepare the pitch.',
    urgent: true,
  },
];

export default function Announce() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const accent = useRoleTheme().admin.accent;
  const router = useRouter();
  const toast = useToast();
  const publish = useMutation(api.announcements.publish);
  const remove = useMutation(api.announcements.remove);
  const feed = useQuery(api.announcements.feed, { limit: 40 });
  const { remotePushReady, sendTestPush } = useNotifications();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('participants');
  const [urgent, setUrgent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const reach = useQuery(api.notifications.reach, { roles: AUDIENCE_ROLES[audience] });
  const canSend = title.trim().length > 2 && body.trim().length > 2;

  async function send() {
    setBusy(true);
    try {
      const result = await publish({
        title: title.trim(),
        body: body.trim(),
        audience,
        urgent,
      });
      toast.show(`Sent to ${result.recipients} people`, 'success');
      setTitle('');
      setBody('');
      setConfirming(false);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen gradient={RoleTheme.admin.gradient} bottomInset={TAB_BAR_INSET} keyboardAware>
      <ScreenHeader
        eyebrow="Organiser"
        title="Announce"
        subtitle="Pushes to every selected phone with sound and vibration."
        right={
          <Button
            label="Back"
            size="sm"
            variant="ghost"
            icon="chevron-left"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))}
          />
        }
      />

      {/*
        No token on the organiser's own phone means the build cannot reach a
        closed app at all, which is worth knowing before a "report to your lab"
        goes out to 114 people.
      */}
      {!remotePushReady && (
        <Banner
          tone="warn"
          title="This phone is not registered for push"
          message="Announcements will only appear to people who have the app open. Allow notifications and reopen the app; if that does not fix it, the build is missing its Firebase configuration."
        />
      )}

      <Section title="Quick sends">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presets}>
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.title}
              accessibilityRole="button"
              onPress={() => {
                setTitle(preset.title);
                setBody(preset.body);
                setUrgent(preset.urgent);
              }}
              style={({ pressed }) => [
                styles.preset,
                { borderColor: withAlpha(accent, 0.28), opacity: pressed ? 0.7 : 1 },
              ]}>
              <Text style={styles.presetTitle}>{preset.title}</Text>
              <Text style={styles.presetBody} numberOfLines={2}>
                {preset.body}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </Section>

      <Card style={styles.form}>
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="Come to the main hall"
          icon="format-title"
          accent={accent}
          maxLength={70}
        />
        <TextField
          label="Message"
          value={body}
          onChangeText={setBody}
          placeholder="Everything you want the phones to show"
          multiline
          accent={accent}
          maxLength={400}
        />

        <OptionPicker<Audience>
          label="Send to"
          accent={accent}
          value={audience}
          onChange={setAudience}
          options={[
            { value: 'participants', label: 'Participants', icon: 'rocket-launch-outline' },
            { value: 'coordinators', label: 'Coordinators', icon: 'account-group-outline' },
            { value: 'evaluators', label: 'Evaluators', icon: 'clipboard-check-outline' },
            { value: 'admins', label: 'Organisers', icon: 'shield-crown-outline' },
            { value: 'all', label: 'Everyone', icon: 'account-multiple-outline' },
          ]}
        />

        <Toggle
          label="Urgent"
          description="Shows as a full heads-up alert over whatever is on screen, with a long vibration. Use it for calls people must not miss."
          value={urgent}
          onChange={setUrgent}
          accent={Brand.orange}
        />

        {!!reach && (
          <Banner
            tone={reach.reachable === 0 ? 'warn' : 'info'}
            title={
              reach.reachable === 0
                ? 'Nobody in this audience has the app open yet'
                : `Will buzz ${reach.devices} phone${reach.devices === 1 ? '' : 's'}`
            }
            message={
              reach.reachable === 0
                ? 'They still see it in the app under Updates. Phones appear here once each person signs in once and allows notifications.'
                : `${reach.reachable} of ${reach.people} people have a registered device.${
                    reach.silent > 0
                      ? ` ${reach.silent} will only see it in the app.`
                      : ''
                  }`
            }
          />
        )}

        <Button
          label="Send announcement"
          icon="bullhorn"
          accent={accent}
          size="lg"
          full
          disabled={!canSend}
          loading={busy}
          onPress={() => setConfirming(true)}
        />

        <Button
          label="Send a test to myself"
          variant="ghost"
          icon="bell-badge-outline"
          size="sm"
          full
          loading={testing}
          disabled={!remotePushReady || testing}
          onPress={async () => {
            setTesting(true);
            try {
              const result = await sendTestPush();
              toast.show(
                `Test sent to ${result.devices} device${
                  result.devices === 1 ? '' : 's'
                }. Lock the phone and it should still arrive.`,
                'success',
              );
            } catch (err) {
              toast.show(errorMessage(err), 'error');
            } finally {
              setTesting(false);
            }
          }}
        />
      </Card>

      <Section title="Sent" hint="Newest first">
        <AnnouncementFeed
          items={feed}
          accent={accent}
          showAudience
          onDelete={(id) => {
            remove({ announcementId: id as Id<'announcements'> }).catch((err) =>
              toast.show(errorMessage(err), 'error'),
            );
          }}
        />
      </Section>

      <ConfirmDialog
        visible={confirming}
        title="Send this now?"
        message={`"${title.trim()}" goes to ${audience === 'all' ? 'everyone' : audience}${
          urgent ? ' on the urgent channel' : ''
        }.`}
        confirmLabel="Send"
        loading={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={send}
      />
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  presets: { flexDirection: 'row', gap: Space.sm, paddingRight: Space.lg },
  preset: {
    width: 200,
    padding: Space.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    backgroundColor: Brand.surfaceStrong,
    gap: 4,
  },
  presetTitle: { color: Brand.text, fontSize: 13.5, fontWeight: '700' },
  presetBody: { color: Brand.textFaint, fontSize: 11.5, lineHeight: 16 },
  form: { gap: Space.lg, padding: Space.xl },
}));
