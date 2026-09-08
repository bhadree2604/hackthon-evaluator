import { useQuery } from 'convex/react';
import { Tabs } from 'expo-router/js-tabs';

import { RoleGate, tabIcon, useTabScreenOptions } from '@/components/role-shell';
import { api } from '@/convex/_generated/api';
import { useRoleTheme } from '@/lib/theme';

export default function CoordinatorLayout() {
  return (
    <RoleGate role="coordinator">
      <CoordinatorTabs />
    </RoleGate>
  );
}

function CoordinatorTabs() {
  const accent = useRoleTheme().coordinator.accent;
  const unread = useQuery(api.chat.unreadCount, {});

  return (
    <>
      <Tabs screenOptions={useTabScreenOptions(accent)}>
        <Tabs.Screen
          name="index"
          options={{ title: 'My teams', tabBarIcon: tabIcon('account-group-outline') }}
        />
        <Tabs.Screen
          name="attendance"
          options={{ title: 'Attendance', tabBarIcon: tabIcon('clipboard-check-outline') }}
        />
        <Tabs.Screen
          name="chats"
          options={{
            title: 'Chat',
            tabBarIcon: tabIcon('message-text-outline'),
            tabBarBadge: unread && unread > 0 ? unread : undefined,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: tabIcon('account-circle-outline') }}
        />
      </Tabs>
    </>
  );
}
