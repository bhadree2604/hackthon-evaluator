import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { Button, Segmented } from '@/components/ui/button';
import { TextField } from '@/components/ui/inputs';
import { ConfirmDialog, Sheet, useToast } from '@/components/ui/overlays';
import { Avatar, Card, KeyValue, Pill, Section, withAlpha } from '@/components/ui/primitives';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { EVENT, Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { errorMessage } from '@/lib/errors';
import { minPasswordFor } from '@/lib/passwords';
import { makeStyles, useColors, useRoleTheme, useThemeMode } from '@/lib/theme';
import { useNotifications } from '@/lib/notifications';
import { homeFor, useSession } from '@/lib/session';

export function ProfileView() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const router = useRouter();
  const toast = useToast();
  const { profile, labs, signOut, roles, activeRole, setActiveRole } = useSession();
  /** Participants may use anything; staff keep the longer minimum. */
  const minPassword = minPasswordFor(roles);
  const { mode, setMode } = useThemeMode();
  const updateProfile = useMutation(api.profiles.updateMyProfile);
  const changeMyPassword = useMutation(api.accounts.changeMyPassword);
  const { permission, pushToken, remotePushAvailable, requestPermission, releaseDevice, sendTestPush } =
    useNotifications();

  const [editing, setEditing] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [department, setDepartment] = useState(profile?.department ?? '');

  if (!profile) return null;
  const theme = RoleTheme[profile.role];

  async function save() {
    setBusy(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim(), department: department.trim() });
      toast.show('Profile updated', 'success');
      setEditing(false);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      // Hand the device back before the session goes, or the next person to
      // sign in on this phone keeps receiving this account's alerts.
      await releaseDevice();
      await signOut();
      setConfirmSignOut(false);
      router.replace('/');
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen gradient={theme.gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader eyebrow={theme.label} title="Profile" />

      <Card style={styles.identity}>
        <Avatar name={profile.name} size={62} color={theme.accent} />
        <Text style={styles.name}>{profile.name}</Text>
        <Text style={styles.email}>{profile.email}</Text>
        <Pill label={theme.label} color={theme.accent} icon={theme.icon as never} />
      </Card>

      <Section
        title="Details"
        action={
          <Button
            label="Edit"
            variant="secondary"
            size="sm"
            icon="pencil-outline"
            accent={theme.accent}
            onPress={() => {
              setName(profile.name);
              setPhone(profile.phone ?? '');
              setDepartment(profile.department ?? '');
              setEditing(true);
            }}
          />
        }>
        <Card>
          <View style={styles.kvGrid}>
            <KeyValue label="Phone" value={profile.phone} />
            <KeyValue label="Department" value={profile.department} />
          </View>
        </Card>
      </Section>

      {profile.role === 'coordinator' && (
        <Section title="Assigned labs" hint="Set by the organisers">
          <Card>
            {labs.length === 0 ? (
              <Text style={styles.emptyText}>
                No lab assigned yet. Ask an organiser to add you to one.
              </Text>
            ) : (
              <View style={styles.labList}>
                {labs.map((lab) => (
                  <View key={lab._id} style={styles.labRow}>
                    <View
                      style={[
                        styles.labIcon,
                        { backgroundColor: withAlpha(theme.accent, 0.13) },
                      ]}>
                      <MaterialCommunityIcons name="door-open" size={15} color={theme.accent} />
                    </View>
                    <Text style={styles.labName}>{lab.name}</Text>
                    {!!lab.block && <Text style={styles.labBlock}>{lab.block}</Text>}
                  </View>
                ))}
              </View>
            )}
          </Card>
        </Section>
      )}

      {roles.length > 1 && (
        <Section title="Signed in as" hint="One login, several roles">
          <Card>
            <Segmented<string>
              accent={theme.accent}
              scrollable
              value={activeRole ?? profile.role}
              onChange={(next) => {
                setActiveRole(next as typeof profile.role);
                router.replace(homeFor(next as typeof profile.role));
              }}
              options={roles.map((r) => ({
                value: r,
                label: RoleTheme[r].label,
                icon: RoleTheme[r].icon as never,
              }))}
            />
            <Text style={styles.switchHint}>
              Switching takes you straight to that area. Your account keeps every role.
            </Text>
          </Card>
        </Section>
      )}

      <Section title="Security">
        <Card>
          <View style={styles.notifyRow}>
            <MaterialCommunityIcons name="key-outline" size={18} color={theme.accent} />
            <View style={styles.flex}>
              <Text style={styles.notifyTitle}>Password</Text>
              <Text style={styles.notifyBody}>
                {profile.isMaster
                  ? 'This is the master organiser account. Only you can change this password.'
                  : 'Change the password you sign in with.'}
              </Text>
            </View>
          </View>
          <View style={styles.notifyActions}>
            <Button
              label="Change password"
              size="sm"
              variant="secondary"
              icon="lock-reset"
              accent={theme.accent}
              onPress={() => {
                setNewPassword('');
                setConfirmPassword('');
                setChangingPassword(true);
              }}
            />
          </View>
        </Card>
      </Section>

      <Section title="Appearance" hint="Applies to this device">
        <Card>
          <Segmented<'system' | 'light' | 'dark'>
            accent={theme.accent}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'system', label: 'System', icon: 'cellphone-cog' },
              { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
              { value: 'dark', label: 'Dark', icon: 'weather-night' },
            ]}
          />
        </Card>
      </Section>

      <Section title="Notifications" hint="Announcements and help-desk replies">
        <Card>
          <View style={styles.notifyRow}>
            <MaterialCommunityIcons
              name={
                permission === 'granted'
                  ? 'bell-ring-outline'
                  : permission === 'denied'
                    ? 'bell-off-outline'
                    : 'bell-outline'
              }
              size={18}
              color={
                permission === 'granted'
                  ? Brand.green
                  : permission === 'denied'
                    ? Brand.red
                    : Brand.amber
              }
            />
            <View style={styles.flex}>
              <Text style={styles.notifyTitle}>
                {permission === 'granted'
                  ? pushToken
                    ? 'This phone is registered'
                    : 'Allowed, alerts show while the app is open'
                  : permission === 'denied'
                    ? 'Notifications are turned off'
                    : 'Not set up yet'}
              </Text>
              <Text style={styles.notifyBody}>
                {permission === 'denied'
                  ? 'Turn them on so you hear urgent calls, not just see them here.'
                  : !remotePushAvailable
                    ? 'This build cannot receive alerts while fully closed.'
                    : pushToken
                      ? 'Announcements sent to you will reach this phone.'
                      : 'Allow notifications to register this phone.'}
              </Text>
            </View>
          </View>

          <View style={styles.notifyActions}>
            {permission !== 'granted' && (
              <Button
                label="Enable"
                size="sm"
                icon="bell-ring-outline"
                accent={theme.accent}
                onPress={() => void requestPermission()}
              />
            )}
            <Button
              label="Send test alert"
              size="sm"
              variant="secondary"
              icon="bell-badge-outline"
              accent={theme.accent}
              onPress={() => void sendTestPush()}
            />
          </View>
        </Card>
      </Section>

      <Section title="Event">
        <Card>
          <View style={styles.kvGrid}>
            <KeyValue label="Hackathon" value={EVENT.name} />
            <KeyValue label="Dates" value={EVENT.dates} />
            <KeyValue label="Venue" value={EVENT.host} />
            <KeyValue label="Prize pool" value={EVENT.prizePool} />
          </View>
          <Button
            label="Open event site"
            variant="ghost"
            size="sm"
            icon="open-in-new"
            style={styles.siteButton}
            onPress={() => Linking.openURL(EVENT.site).catch(() => {})}
          />
        </Card>
      </Section>

      <Button
        label="Sign out"
        variant="danger"
        icon="logout"
        full
        onPress={() => setConfirmSignOut(true)}
      />

      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title="Edit profile"
        subtitle="Only you and the organisers see this."
        accent={theme.accent}
        footer={
          <>
            <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} style={styles.flex} />
            <Button
              label="Save"
              onPress={save}
              loading={busy}
              accent={theme.accent}
              style={styles.flex}
            />
          </>
        }>
        <TextField
          label="Full name"
          value={name}
          onChangeText={setName}
          icon="account-outline"
          autoCapitalize="words"
          accent={theme.accent}
        />
        <TextField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          icon="phone-outline"
          keyboardType="phone-pad"
          accent={theme.accent}
        />
        <TextField
          label="Department"
          value={department}
          onChangeText={setDepartment}
          icon="school-outline"
          accent={theme.accent}
        />
      </Sheet>

      <Sheet
        visible={changingPassword}
        onClose={() => setChangingPassword(false)}
        title="Change your password"
        accent={theme.accent}
        footer={
          <>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setChangingPassword(false)}
              style={styles.flex}
            />
            <Button
              label="Save"
              accent={theme.accent}
              loading={busy}
              disabled={newPassword.length < minPassword || newPassword !== confirmPassword}
              onPress={async () => {
                setBusy(true);
                try {
                  await changeMyPassword({ newPassword });
                  toast.show('Password changed', 'success');
                  setChangingPassword(false);
                } catch (err) {
                  toast.show(errorMessage(err), 'error');
                } finally {
                  setBusy(false);
                }
              }}
              style={styles.flex}
            />
          </>
        }>
        <TextField
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          icon="key-variant"
          secure
          autoCapitalize="none"
          accent={theme.accent}
          hint={
            minPassword <= 1
              ? 'Anything you will remember.'
              : `At least ${minPassword} characters.`
          }
        />
        <TextField
          label="Confirm"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          icon="lock-check-outline"
          secure
          autoCapitalize="none"
          accent={theme.accent}
          error={
            confirmPassword.length > 0 && confirmPassword !== newPassword
              ? 'Passwords do not match'
              : null
          }
        />
      </Sheet>

      <ConfirmDialog
        visible={confirmSignOut}
        title="Sign out?"
        message="You will need your email and password to get back in."
        confirmLabel="Sign out"
        destructive
        loading={busy}
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={leave}
      />
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  identity: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xl },
  name: { color: Brand.text, fontSize: 20, fontWeight: '800', marginTop: Space.sm },
  email: { color: Brand.textMuted, fontSize: 13 },
  kvGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.lg },
  emptyText: { color: Brand.textFaint, fontSize: 13, lineHeight: 19 },
  labList: { gap: Space.md },
  labRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  labIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labName: { color: Brand.text, fontSize: 14.5, fontWeight: '600', flex: 1 },
  labBlock: { color: Brand.textFaint, fontSize: 12 },
  siteButton: { marginTop: Space.lg, alignSelf: 'flex-start' },
  notifyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  notifyTitle: { color: Brand.text, fontSize: 14, fontWeight: '700' },
  notifyBody: { color: Brand.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  notifyActions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg },
  switchHint: { color: Brand.textFaint, fontSize: 11.5, lineHeight: 16, marginTop: Space.md },
}));
