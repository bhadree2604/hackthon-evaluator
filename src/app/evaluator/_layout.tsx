import { Tabs } from 'expo-router/js-tabs';

import { RoleGate, tabIcon, useTabScreenOptions } from '@/components/role-shell';
import { useRoleTheme } from '@/lib/theme';
export default function EvaluatorLayout() {
  const accent = useRoleTheme().evaluator.accent;
  return (
    <RoleGate role="evaluator">
      <Tabs screenOptions={useTabScreenOptions(accent)}>
        <Tabs.Screen
          name="index"
          options={{ title: 'Teams', tabBarIcon: tabIcon('account-group-outline') }}
        />
        <Tabs.Screen
          name="leaderboard"
          options={{ title: 'Leaderboard', tabBarIcon: tabIcon('trophy-outline') }}
        />
        <Tabs.Screen
          name="attendance"
          options={{ title: 'Attendance', tabBarIcon: tabIcon('clipboard-list-outline') }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: tabIcon('account-circle-outline') }}
        />
      </Tabs>
    </RoleGate>
  );
}
