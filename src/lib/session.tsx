import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { RoleKey } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { getAuthClient } from '@/lib/auth-client';
import * as SecureStore from '@/lib/secure-store';

export type SessionStatus = 'loading' | 'signed-out' | 'unregistered' | 'disabled' | 'ready';

export type SessionProfile = {
  _id: string;
  name: string;
  email: string;
  role: RoleKey;
  /** Every role this account may sign in as. */
  roles: RoleKey[];
  isMaster: boolean;
  phone?: string;
  department?: string;
  labIds: string[];
  teamId?: string;
  memberId?: string;
  active: boolean;
};

const ACTIVE_ROLE_KEY = 'hackthon-evaluator.activeRole';

/** Order used when picking a default role for a multi-role account. */
const ROLE_PRIORITY: RoleKey[] = ['admin', 'evaluator', 'coordinator', 'participant'];

type SessionValue = {
  status: SessionStatus;
  profile: SessionProfile | null;
  labs: { _id: string; name: string; block?: string }[];
  email: string | null;
  /** Roles the signed-in account holds. Empty when signed out. */
  roles: RoleKey[];
  /** The role the app is currently presenting. */
  activeRole: RoleKey | null;
  setActiveRole: (role: RoleKey) => void;
  signOut: () => Promise<void>;
  linkAccount: (setupKey?: string) => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.profiles.me, isAuthenticated ? {} : 'skip');
  const ensureProfile = useMutation(api.profiles.ensureProfile);

  const [storedRole, setStoredRole] = useState<RoleKey | null>(null);
  const linkedFor = useRef<string | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(ACTIVE_ROLE_KEY)
      .then((value) => {
        if (value) setStoredRole(value as RoleKey);
      })
      .catch(() => {
        // No stored choice: fall back to role priority.
      });
  }, []);

  const setActiveRole = useCallback((role: RoleKey) => {
    setStoredRole(role);
    SecureStore.setItemAsync(ACTIVE_ROLE_KEY, role).catch(() => {
      // Still applied for this launch.
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated || me === undefined) return;
    if (me.state !== 'unregistered') return;

    const key = me.email ?? 'anonymous';
    if (linkedFor.current === key) return;
    linkedFor.current = key;
    ensureProfile({}).catch(() => {
      // Surfaced on the pending screen through `status`.
    });
  }, [ensureProfile, isAuthenticated, me]);

  useEffect(() => {
    if (!isAuthenticated) linkedFor.current = null;
  }, [isAuthenticated]);

  const signOut = useCallback(async () => {
    linkedFor.current = null;
    await getAuthClient().signOut();
  }, []);

  const linkAccount = useCallback(
    async (setupKey?: string) => {
      linkedFor.current = 'manual';
      await ensureProfile(setupKey ? { setupKey } : {});
    },
    [ensureProfile],
  );

  const value = useMemo<SessionValue>(() => {
    const base = {
      profile: null,
      labs: [],
      email: null,
      roles: [] as RoleKey[],
      activeRole: null,
      setActiveRole,
      signOut,
      linkAccount,
    };

    if (authLoading) return { ...base, status: 'loading' };
    if (!isAuthenticated) return { ...base, status: 'signed-out' };
    if (me === undefined) return { ...base, status: 'loading' };

    if (me.state === 'ready') {
      const profile = me.profile as SessionProfile;
      const roles = (profile.roles?.length ? profile.roles : [profile.role]) as RoleKey[];

      // Honour the stored choice only while the account still holds that role.
      const activeRole =
        storedRole && roles.includes(storedRole)
          ? storedRole
          : (ROLE_PRIORITY.find((r) => roles.includes(r)) ?? roles[0]);

      return {
        ...base,
        status: 'ready',
        profile,
        roles,
        activeRole,
        labs: me.labs.map((l) => ({ _id: l._id, name: l.name, block: l.block })),
        email: profile.email,
      };
    }
    if (me.state === 'disabled') return { ...base, status: 'disabled', email: me.email };
    if (me.state === 'unregistered') {
      return { ...base, status: 'unregistered', email: me.email ?? null };
    }
    return { ...base, status: 'signed-out' };
  }, [authLoading, isAuthenticated, linkAccount, me, setActiveRole, signOut, storedRole]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/** Landing route for a role, used by every redirect in the app. */
export function homeFor(role: RoleKey) {
  if (role === 'admin') return '/admin';
  if (role === 'evaluator') return '/evaluator';
  if (role === 'participant') return '/participant';
  return '/coordinator';
}
