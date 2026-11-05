import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/overlays';
import { Card, withAlpha } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/screen';
import { EVENT, Space } from '@/constants/brand';
import { errorMessage } from '@/lib/errors';
import { makeStyles, useColors } from '@/lib/theme';
import { useSession } from '@/lib/session';

/**
 * Landing spot for an authenticated account that has no profile yet (email not
 * on the invite list) or has been disabled by an organiser.
 */
export default function PendingAccess() {
  const Brand = useColors();
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { status, email, linkAccount, signOut } = useSession();
  const [busy, setBusy] = useState(false);

  if (status === 'signed-out') return <Redirect href="/" />;

  const disabled = status === 'disabled';
  const tone = disabled ? Brand.red : Brand.amber;

  async function retry() {
    setBusy(true);
    try {
      await linkAccount();
      toast.show('Checked again', 'info');
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await signOut();
      router.replace('/');
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll={false} contentStyle={styles.center}>
      <View style={[styles.icon, { backgroundColor: withAlpha(tone, 0.12) }]}>
        <MaterialCommunityIcons
          name={disabled ? 'account-cancel-outline' : 'account-clock-outline'}
          size={30}
          color={tone}
        />
      </View>

      <Text style={styles.title}>
        {disabled ? 'Account disabled' : 'Not on the list yet'}
      </Text>
      <Text style={styles.body}>
        {disabled
          ? 'An organiser has switched this account off. Contact them if that looks wrong.'
          : 'Your sign-in worked, but this email has not been added as an evaluator, coordinator or organiser yet.'}
      </Text>

      {!!email && (
        <Card style={styles.emailCard}>
          <Text style={styles.emailLabel}>SIGNED IN AS</Text>
          <Text style={styles.email}>{email}</Text>
        </Card>
      )}

      <View style={styles.actions}>
        {!disabled && (
          <Button label="Check again" onPress={retry} loading={busy} icon="refresh" full />
        )}
        <Button
          label={`Email ${EVENT.supportEmail}`}
          variant="secondary"
          icon="email-outline"
          onPress={() =>
            Linking.openURL(
              `mailto:${EVENT.supportEmail}?subject=Hackthon%20Evaluator%20console%20access`,
            ).catch(() => {})
          }
          full
        />
        <Button label="Sign out" variant="ghost" onPress={leave} icon="logout" full />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  center: { alignItems: 'center', justifyContent: 'center', gap: Space.md },
  icon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.sm,
  },
  title: { color: Brand.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  body: {
    color: Brand.textMuted,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  emailCard: { alignItems: 'center', gap: 4, alignSelf: 'stretch', marginTop: Space.sm },
  emailLabel: {
    color: Brand.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  email: { color: Brand.text, fontSize: 14.5, fontWeight: '600' },
  actions: { alignSelf: 'stretch', gap: Space.sm, marginTop: Space.lg },
}));
