import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { Button, Segmented } from '@/components/ui/button';
import { OptionPicker, SearchInput, TextField } from '@/components/ui/inputs';
import { Sheet, useToast } from '@/components/ui/overlays';
import { Avatar, Banner, Card, EmptyState, Pill, Section, withAlpha } from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { Space, type RoleKey } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';

type StaffRole = 'admin' | 'evaluator' | 'coordinator';
type Filter = 'all' | StaffRole;

const STAFF_ROLES: StaffRole[] = ['admin', 'evaluator', 'coordinator'];

export default function AdminPeople() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const accent = RoleTheme.admin.accent;
  const toast = useToast();
  const { profile: me } = useSession();

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const staff = useQuery(api.accounts.listStaff, {});
  const labs = useQuery(api.labs.list, {});

  const createStaffAccount = useMutation(api.accounts.createStaffAccount);
  const setPassword = useMutation(api.accounts.setPassword);
  const setRoles = useMutation(api.accounts.setRoles);
  const setPersonActive = useMutation(api.profiles.setPersonActive);
  const setPersonLabs = useMutation(api.profiles.setPersonLabs);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'evaluator' as StaffRole,
    password: '',
    phone: '',
    department: '',
    labIds: [] as Id<'labs'>[],
    setupKey: '',
  });

  const [passwordFor, setPasswordFor] = useState<{ id: Id<'profiles'>; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [rolesFor, setRolesFor] = useState<{
    id: Id<'profiles'>;
    name: string;
    roles: RoleKey[];
    labIds: Id<'labs'>[];
    /** Whether they already had organiser access before this edit. */
    hadAdmin: boolean;
  } | null>(null);
  const [rolesKey, setRolesKey] = useState('');

  const counts = useMemo(() => {
    const rows = staff ?? [];
    return {
      all: rows.length,
      admin: rows.filter((r) => r.roles.includes('admin')).length,
      evaluator: rows.filter((r) => r.roles.includes('evaluator')).length,
      coordinator: rows.filter((r) => r.roles.includes('coordinator')).length,
    };
  }, [staff]);

  const rows = useMemo(() => {
    const list = staff ?? [];
    const needle = search.trim().toLowerCase();
    return list.filter((row) => {
      if (filter !== 'all' && !row.roles.includes(filter)) return false;
      if (!needle) return true;
      return row.name.toLowerCase().includes(needle) || row.email.includes(needle);
    });
  }, [filter, search, staff]);

  function toggle<T>(list: T[], value: T) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  async function run(action: () => Promise<unknown>, message: string, after?: () => void) {
    setBusy(true);
    try {
      await action();
      toast.show(message, 'success');
      after?.();
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
        title="People"
        subtitle="You create every staff account and set its password. Nobody signs themselves up."
        right={
          <Button
            label="Add"
            size="sm"
            icon="account-plus-outline"
            accent={accent}
            onPress={() => setCreating(true)}
          />
        }
      />

      <Banner
        tone="info"
        title="One email can hold several roles"
        message="Adding an existing address as another role widens that same login instead of creating a second account."
      />

      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search name or email"
        accent={accent}
      />

      <Segmented<Filter>
        accent={accent}
        scrollable
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: counts.all },
          { value: 'admin', label: 'Organisers', count: counts.admin },
          { value: 'evaluator', label: 'Evaluators', count: counts.evaluator },
          { value: 'coordinator', label: 'Coordinators', count: counts.coordinator },
        ]}
      />

      {staff === undefined ? (
        <ScreenLoading label="Loading accounts" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="account-tie-outline"
          title={search ? 'No match' : 'No staff accounts yet'}
          message="Add an evaluator or coordinator and hand them the password."
        />
      ) : (
        <Section title="Accounts" hint={`${rows.length} with access`}>
          <View style={styles.list}>
            {rows.map((person) => {
              const locked = person.isMaster && person._id !== me?._id;
              return (
                <Card key={person._id}>
                  <View style={styles.row}>
                    <Avatar
                      name={person.name}
                      size={42}
                      color={RoleTheme[person.roles[0] as RoleKey].accent}
                    />
                    <View style={styles.flex}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>
                          {person.name}
                        </Text>
                        {person.isMaster && (
                          <Pill label="Master" color={Brand.amber} icon="shield-lock-outline" compact />
                        )}
                        {!person.active && <Pill label="Disabled" color={Brand.red} compact />}
                      </View>
                      <Text style={styles.email} numberOfLines={1}>
                        {person.email}
                      </Text>
                      <View style={styles.tags}>
                        {person.roles.map((r) => (
                          <Pill
                            key={r}
                            label={RoleTheme[r as RoleKey].label}
                            color={RoleTheme[r as RoleKey].accent}
                            compact
                          />
                        ))}
                        {person.roles.includes('coordinator') &&
                          person.labNames.map((lab) => (
                            <Pill key={lab} label={lab} color={Brand.green} compact />
                          ))}
                      </View>
                    </View>
                  </View>

                  {locked ? (
                    <Text style={styles.lockNote}>
                      The master account can only be changed by itself.
                    </Text>
                  ) : (
                    <View style={styles.actionRow}>
                      <Button
                        label="Roles"
                        size="sm"
                        variant="secondary"
                        icon="shield-account-outline"
                        accent={accent}
                        onPress={() => {
                          setRolesKey('');
                          setRolesFor({
                            id: person._id as Id<'profiles'>,
                            name: person.name,
                            roles: person.roles as RoleKey[],
                            labIds: person.labIds as Id<'labs'>[],
                            hadAdmin: person.roles.includes('admin'),
                          });
                        }}
                      />
                      <Button
                        label="Password"
                        size="sm"
                        variant="secondary"
                        icon="key-outline"
                        accent={Brand.blue}
                        onPress={() => {
                          setNewPassword('');
                          setPasswordFor({ id: person._id as Id<'profiles'>, name: person.name });
                        }}
                      />
                      <View style={styles.flex} />
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          run(
                            () =>
                              setPersonActive({
                                profileId: person._id as Id<'profiles'>,
                                active: !person.active,
                              }),
                            person.active ? 'Account disabled' : 'Account enabled',
                          )
                        }>
                        <Text
                          style={[
                            styles.toggle,
                            { color: person.active ? Brand.red : Brand.green },
                          ]}>
                          {person.active ? 'Disable' : 'Enable'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        </Section>
      )}

      {/* Create ------------------------------------------------------------ */}
      <Sheet
        visible={creating}
        onClose={() => setCreating(false)}
        title="New staff account"
        subtitle="They sign in with exactly these details."
        accent={accent}
        footer={
          <>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setCreating(false)}
              style={styles.flex}
            />
            <Button
              label="Create"
              accent={accent}
              loading={busy}
              disabled={
                !form.email.includes('@') ||
                form.name.trim().length < 2 ||
                form.password.length < 8 ||
                (form.role === 'admin' && form.setupKey.trim().length === 0)
              }
              onPress={() =>
                run(
                  () =>
                    createStaffAccount({
                      email: form.email,
                      name: form.name,
                      role: form.role,
                      password: form.password,
                      phone: form.phone || undefined,
                      department: form.department || undefined,
                      labIds: form.labIds,
                      setupKey: form.role === 'admin' ? form.setupKey.trim() : undefined,
                    }),
                  'Account ready',
                  () => {
                    setCreating(false);
                    setForm({
                      name: '',
                      email: '',
                      role: 'evaluator',
                      password: '',
                      phone: '',
                      department: '',
                      labIds: [],
                      setupKey: '',
                    });
                  },
                )
              }
              style={styles.flex}
            />
          </>
        }>
        <TextField
          label="Full name"
          value={form.name}
          onChangeText={(name) => setForm({ ...form, name })}
          icon="account-outline"
          autoCapitalize="words"
          accent={accent}
        />
        <TextField
          label="Email"
          value={form.email}
          onChangeText={(email) => setForm({ ...form, email })}
          icon="email-outline"
          keyboardType="email-address"
          autoCapitalize="none"
          accent={accent}
          hint="Already used? The role is added to that same login."
        />
        <TextField
          label="Password"
          value={form.password}
          onChangeText={(password) => setForm({ ...form, password })}
          icon="key-variant"
          secure
          autoCapitalize="none"
          accent={accent}
          hint="At least 8 characters. Hand this to them."
        />
        <OptionPicker<StaffRole>
          label="Role"
          accent={accent}
          value={form.role}
          onChange={(role) => setForm({ ...form, role })}
          options={[
            { value: 'evaluator', label: 'Evaluator', icon: 'clipboard-check-outline' },
            { value: 'coordinator', label: 'Coordinator', icon: 'account-group-outline' },
            { value: 'admin', label: 'Organiser', icon: 'shield-crown-outline' },
          ]}
        />
        <TextField
          label="Phone"
          value={form.phone}
          onChangeText={(phone) => setForm({ ...form, phone })}
          icon="phone-outline"
          keyboardType="phone-pad"
          accent={accent}
        />
        <TextField
          label="Department"
          value={form.department}
          onChangeText={(department) => setForm({ ...form, department })}
          icon="school-outline"
          accent={accent}
        />

        {form.role === 'admin' && (
          <TextField
            label="Admin setup key"
            value={form.setupKey}
            onChangeText={(setupKey) => setForm({ ...form, setupKey })}
            icon="shield-key-outline"
            secure
            autoCapitalize="none"
            accent={Brand.amber}
            hint="Organiser accounts can only be created with the key from your Convex environment."
          />
        )}

        {form.role === 'coordinator' && (
          <View style={styles.pickerBlock}>
            <Text style={styles.pickerLabel}>LABS</Text>
            <View style={styles.chips}>
              {(labs ?? []).map((lab) => {
                const on = form.labIds.includes(lab._id);
                return (
                  <Pressable
                    key={lab._id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => setForm({ ...form, labIds: toggle(form.labIds, lab._id) })}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: on ? withAlpha(Brand.green, 0.16) : Brand.surfaceStrong,
                        borderColor: on ? withAlpha(Brand.green, 0.4) : Brand.borderSubtle,
                      },
                    ]}>
                    <Text
                      style={[styles.chipText, { color: on ? Brand.green : Brand.textMuted }]}>
                      {lab.name}
                    </Text>
                  </Pressable>
                );
              })}
              {labs?.length === 0 && <Text style={styles.hint}>Add labs in Setup first.</Text>}
            </View>
          </View>
        )}
      </Sheet>

      {/* Password ---------------------------------------------------------- */}
      <Sheet
        visible={passwordFor !== null}
        onClose={() => setPasswordFor(null)}
        title="Set a new password"
        subtitle={passwordFor?.name}
        accent={Brand.blue}
        footer={
          <>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setPasswordFor(null)}
              style={styles.flex}
            />
            <Button
              label="Save password"
              accent={Brand.blue}
              loading={busy}
              disabled={newPassword.length < 8}
              onPress={() =>
                run(
                  () =>
                    setPassword({ profileId: passwordFor!.id, newPassword }),
                  'Password updated',
                  () => setPasswordFor(null),
                )
              }
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
          accent={Brand.blue}
          hint="At least 8 characters. They can sign in with it immediately."
        />
      </Sheet>

      {/* Roles ------------------------------------------------------------- */}
      <Sheet
        visible={rolesFor !== null}
        onClose={() => setRolesFor(null)}
        title="Roles"
        subtitle={rolesFor?.name}
        accent={accent}
        footer={
          <>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setRolesFor(null)}
              style={styles.flex}
            />
            <Button
              label="Save"
              accent={accent}
              loading={busy}
              disabled={
                (rolesFor?.roles.length ?? 0) === 0 ||
                (!!rolesFor &&
                  rolesFor.roles.includes('admin') &&
                  !rolesFor.hadAdmin &&
                  rolesKey.trim().length === 0)
              }
              onPress={async () => {
                if (!rolesFor) return;
                await run(
                  async () => {
                    await setRoles({
                      profileId: rolesFor.id,
                      roles: rolesFor.roles,
                      setupKey:
                        rolesFor.roles.includes('admin') && !rolesFor.hadAdmin
                          ? rolesKey.trim()
                          : undefined,
                    });
                    if (rolesFor.roles.includes('coordinator')) {
                      await setPersonLabs({ profileId: rolesFor.id, labIds: rolesFor.labIds });
                    }
                  },
                  'Roles updated',
                  () => setRolesFor(null),
                );
              }}
              style={styles.flex}
            />
          </>
        }>
        <Text style={styles.hint}>
          Tick every role this person can sign in as. They pick one on the home screen and can
          switch any time from their profile.
        </Text>
        <View style={styles.chips}>
          {STAFF_ROLES.map((r) => {
            const on = rolesFor?.roles.includes(r) ?? false;
            const tone = RoleTheme[r].accent;
            return (
              <Pressable
                key={r}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() =>
                  setRolesFor((cur) =>
                    cur ? { ...cur, roles: toggle(cur.roles, r as RoleKey) } : cur,
                  )
                }
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? withAlpha(tone, 0.16) : Brand.surfaceStrong,
                    borderColor: on ? withAlpha(tone, 0.4) : Brand.borderSubtle,
                  },
                ]}>
                <MaterialCommunityIcons
                  name={RoleTheme[r].icon as never}
                  size={13}
                  color={on ? tone : Brand.textMuted}
                />
                <Text style={[styles.chipText, { color: on ? tone : Brand.textMuted }]}>
                  {RoleTheme[r].label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!!rolesFor && rolesFor.roles.includes('admin') && !rolesFor.hadAdmin && (
          <TextField
            label="Admin setup key"
            value={rolesKey}
            onChangeText={setRolesKey}
            icon="shield-key-outline"
            secure
            autoCapitalize="none"
            accent={Brand.amber}
            hint="Granting organiser access needs the key."
          />
        )}

        {rolesFor?.roles.includes('coordinator') && (
          <View style={styles.pickerBlock}>
            <Text style={styles.pickerLabel}>LABS</Text>
            <View style={styles.chips}>
              {(labs ?? []).map((lab) => {
                const on = rolesFor?.labIds.includes(lab._id) ?? false;
                return (
                  <Pressable
                    key={lab._id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() =>
                      setRolesFor((cur) =>
                        cur ? { ...cur, labIds: toggle(cur.labIds, lab._id) } : cur,
                      )
                    }
                    style={[
                      styles.chip,
                      {
                        backgroundColor: on ? withAlpha(Brand.green, 0.16) : Brand.surfaceStrong,
                        borderColor: on ? withAlpha(Brand.green, 0.4) : Brand.borderSubtle,
                      },
                    ]}>
                    <Text style={[styles.chipText, { color: on ? Brand.green : Brand.textMuted }]}>
                      {lab.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  list: { gap: Space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, flexWrap: 'wrap' },
  name: { color: Brand.text, fontSize: 14.5, fontWeight: '700', flexShrink: 1 },
  email: { color: Brand.textMuted, fontSize: 12, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Space.sm },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderSubtle,
  },
  toggle: { fontSize: 12, fontWeight: '700' },
  lockNote: {
    color: Brand.textFaint,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderSubtle,
  },

  pickerBlock: { gap: Space.sm },
  pickerLabel: {
    color: Brand.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  hint: { color: Brand.textFaint, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  chipText: { fontSize: 12.5, fontWeight: '700' },
}));
