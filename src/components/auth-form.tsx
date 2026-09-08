import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Segmented } from '@/components/ui/button';
import { TextField } from '@/components/ui/inputs';
import { useToast } from '@/components/ui/overlays';
import { Banner, Card, Pill } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/screen';
import { EVENT, Space, type RoleKey } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { getAuthClient } from '@/lib/auth-client';
import { errorMessage } from '@/lib/errors';
import { minPasswordFor, passwordError, passwordPlaceholder } from '@/lib/passwords';
import { useSession } from '@/lib/session';
import { makeStyles, useColors, useNeutralGradient, useRoleTheme } from '@/lib/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One screen, three shapes:
 *  - staff sign in with credentials an organiser created for them
 *  - the first organiser claims the master account with the setup key
 *  - a participant whose address is on a team roster picks their own password
 */
export function AuthForm({ role }: { role: RoleKey | null }) {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const neutral = useNeutralGradient();
  const router = useRouter();
  const toast = useToast();
  const { linkAccount, setActiveRole } = useSession();

  const theme = role ? RoleTheme[role] : null;
  const accent = theme?.accent ?? Brand.cyan;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [setupKey, setSetupKey] = useState('');
  // Organisers can either sign in or create an account with the setup key.
  const [organiserMode, setOrganiserMode] = useState<'sign-in' | 'create'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced so the roster lookup does not run on every keystroke.
  const [probeEmail, setProbeEmail] = useState('');
  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    const id = setTimeout(() => setProbeEmail(EMAIL_RE.test(trimmed) ? trimmed : ''), 400);
    return () => clearTimeout(id);
  }, [email]);

  const boot = useQuery(api.profiles.bootstrapState, role === 'admin' ? {} : 'skip');
  const social = useQuery(api.auth.socialProviders, {});
  const roster = useQuery(
    api.participants.checkEmail,
    role === 'participant' && probeEmail ? { email: probeEmail } : 'skip',
  );

  // With no organiser yet, creating is the only sensible default.
  const firstRun = role === 'admin' && boot?.adminExists === false;
  const claimingMaster =
    role === 'admin' &&
    boot?.masterExists === false &&
    !!boot?.masterEmail &&
    boot.masterEmail === email.trim().toLowerCase();
  const bootstrap = role === 'admin' && (firstRun || organiserMode === 'create');
  // A rostered participant with no account yet chooses their own password.
  const activating = role === 'participant' && roster?.onRoster === true && !roster.hasAccount;
  const notOnRoster = role === 'participant' && roster?.onRoster === false;
  const creating = bootstrap || activating;

  const emailValid = EMAIL_RE.test(email.trim());
  /** Participants may use anything they can remember; staff keep the minimum. */
  const minPassword = minPasswordFor(role ? [role] : []);
  const canSubmit =
    emailValid &&
    password.length >= minPassword &&
    !busy &&
    (!creating || password === confirm) &&
    (!bootstrap || (setupKey.trim().length > 0 && name.trim().length > 1)) &&
    !notOnRoster;

  const showGoogle = social?.google === true && !bootstrap && role !== 'participant';

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const auth = getAuthClient();

    try {
      if (creating) {
        const displayName = name.trim() || roster?.memberName || cleanEmail.split('@')[0];
        const result = await auth.signUp.email({
          email: cleanEmail,
          password,
          name: displayName,
        });
        if (result.error) {
          // A half-finished signup leaves the account existing but unlinked.
          // Signing in with the same password recovers it instead of dead-ending.
          const signedIn = await auth.signIn.email({ email: cleanEmail, password });
          if (signedIn.error) throw result.error;
        }
      } else {
        const result = await auth.signIn.email({ email: cleanEmail, password });
        if (result.error) throw result.error;
      }

      // Links the Better Auth account to a profile. The setup key is sent
      // whenever it was typed, so signing in can also grant organiser access.
      await linkAccount(setupKey.trim() || undefined);
      if (role) setActiveRole(role);
      toast.show(creating ? 'Account ready' : 'Welcome back', 'success');
    } catch (err) {
      const message = errorMessage(err, 'Could not sign you in. Check your details and retry.');
      setError(message);
      toast.show(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getAuthClient().signIn.social({ provider: 'google', callbackURL: '/' });
      if (result.error) throw result.error;
      if (role) setActiveRole(role);
    } catch (err) {
      const message = errorMessage(err, 'Google sign-in failed. Try email and password.');
      setError(message);
      toast.show(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const heading = bootstrap
    ? firstRun
      ? 'Claim the master account'
      : 'Create an organiser account'
    : activating
      ? 'Set your password'
      : theme
        ? `${theme.label} sign in`
        : 'Sign in';

  return (
    <Screen gradient={theme?.gradient ?? neutral} keyboardAware contentStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}
          style={styles.back}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={Brand.textDim} />
        </Pressable>
        <Image
          source={require('@/assets/images/brand/icon-512.png')}
          style={styles.mark}
          contentFit="contain"
        />
      </View>

      <View style={styles.head}>
        {!!theme && (
          <Pill
            label={theme.label.toUpperCase()}
            color={accent}
            icon={theme.icon as never}
            compact
          />
        )}
        <Text style={styles.title}>{heading}</Text>
        <Text style={styles.subtitle}>{theme?.tagline ?? `${EVENT.name} evaluation console.`}</Text>
      </View>

      {bootstrap && (
        <Banner
          tone="warn"
          title="First run"
          message={
            claimingMaster
              ? "This is the master organiser address. Enter the ADMIN_SETUP_KEY to claim it."
              : "No organiser exists yet. Enter the ADMIN_SETUP_KEY from your Convex environment to claim the first account."
          }
        />
      )}

      {(role === 'evaluator' || role === 'coordinator') && (
        <Banner
          tone="info"
          title="Organisers create your account"
          message="Sign in with the email and password the organisers gave you. There is no sign-up here."
        />
      )}

      {activating && (
        <Banner
          tone="success"
          title={`Welcome ${roster?.memberName ?? ''}`.trim()}
          message={`You are on ${roster?.teamName ?? 'your team'}${
            roster?.teamCode ? ` (${roster.teamCode})` : ''
          }. Choose a password to finish setting up your login.`}
        />
      )}

      {notOnRoster && (
        <Banner
          tone="danger"
          title="That email is not on any team"
          message="Participants sign in with the address their team registered. Ask your team leader or the organisers to check the roster."
        />
      )}

      {role === 'admin' && !firstRun && (
        <Segmented<'sign-in' | 'create'>
          accent={accent}
          value={organiserMode}
          onChange={setOrganiserMode}
          options={[
            { value: 'sign-in', label: 'Sign in', icon: 'login-variant' },
            { value: 'create', label: 'Create with key', icon: 'key-variant' },
          ]}
        />
      )}

      <Card style={styles.form}>
        {showGoogle && (
          <>
            <Button
              label="Continue with Google"
              variant="secondary"
              icon="google"
              accent={accent}
              size="lg"
              full
              disabled={busy}
              onPress={googleSignIn}
            />
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or use email</Text>
              <View style={styles.dividerLine} />
            </View>
          </>
        )}

        {bootstrap && (
          <TextField
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            icon="account-outline"
            autoCapitalize="words"
            accent={accent}
          />
        )}

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@ritrjpm.ac.in"
          icon="email-outline"
          keyboardType="email-address"
          autoCapitalize="none"
          accent={accent}
          error={email.length > 0 && !emailValid ? 'Enter a valid email address' : null}
        />

        <TextField
          label={creating ? 'Choose a password' : 'Password'}
          value={password}
          onChangeText={setPassword}
          placeholder={passwordPlaceholder(minPassword)}
          icon="lock-outline"
          secure
          autoCapitalize="none"
          accent={accent}
          returnKeyType={creating ? 'next' : 'go'}
          onSubmitEditing={creating ? undefined : submit}
          error={passwordError(password, minPassword)}
        />

        {creating && (
          <TextField
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type it again"
            icon="lock-check-outline"
            secure
            autoCapitalize="none"
            accent={accent}
            returnKeyType="go"
            onSubmitEditing={submit}
            error={confirm.length > 0 && confirm !== password ? 'Passwords do not match' : null}
          />
        )}

        {role === 'admin' && (
          <TextField
            label="Setup key"
            value={setupKey}
            onChangeText={setSetupKey}
            placeholder="ADMIN_SETUP_KEY"
            icon="key-variant"
            secure
            autoCapitalize="none"
            accent={accent}
          />
        )}

        {!!error && (
          <View style={styles.error}>
            <MaterialCommunityIcons name="alert-circle-outline" size={15} color={Brand.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Button
          label={creating ? 'Create my login' : 'Sign in'}
          onPress={submit}
          loading={busy}
          disabled={!canSubmit}
          accent={accent}
          size="lg"
          full
          iconRight="arrow-right"
        />
      </Card>

      <Text style={styles.legal}>
        {role === 'participant'
          ? 'Use the email your team registered with.'
          : 'Accounts are created by the organisers.'}{' '}
        Contact {EVENT.supportEmail} if you cannot get in.
      </Text>
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  content: { gap: Space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surfaceStrong,
  },
  mark: { width: 34, height: 34, opacity: 0.9 },

  head: { gap: Space.sm, marginTop: Space.md },
  title: { color: Brand.text, fontSize: 27, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: Brand.textMuted, fontSize: 13.5, lineHeight: 20, maxWidth: 320 },

  form: { gap: Space.lg, padding: Space.xl },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Brand.borderSubtle },
  dividerText: { color: Brand.textFaint, fontSize: 11.5, fontWeight: '600' },

  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    padding: Space.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.redDim,
    backgroundColor: Brand.redDim,
  },
  errorText: { color: Brand.textDim, fontSize: 12.5, flex: 1, lineHeight: 18 },

  legal: {
    color: Brand.textFaint,
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: Space.sm,
  },
}));
