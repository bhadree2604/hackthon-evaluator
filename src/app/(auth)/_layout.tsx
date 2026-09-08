import { Redirect, Stack } from 'expo-router';

import { homeFor, useSession } from '@/lib/session';
import { useColors } from '@/lib/theme';

export default function AuthLayout() {
  const Brand = useColors();
  const { status, profile, activeRole } = useSession();

  // A signed-in, registered user never needs the auth stack.
  if (status === 'ready' && profile) return <Redirect href={homeFor(activeRole ?? profile.role)} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: Brand.bg },
      }}
    />
  );
}
