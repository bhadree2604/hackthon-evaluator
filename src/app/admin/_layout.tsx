import { useQuery } from 'convex/react';
import { Tabs } from 'expo-router/js-tabs';

import { RoleGate, tabIcon, useTabScreenOptions } from '@/components/role-shell';
import { api } from '@/convex/_generated/api';
import { useRoleTheme } from '@/lib/theme';


export default function AdminLayout() {
  return (
    <RoleGate role="admin">
      <AdminTabs />
    </RoleGate>
  );
}

function AdminTabs() {
  const accent = useRoleTheme().admin.accent;
  const unread = useQuery(api.chat.unreadCount, {});

  return (
    <Tabs screenOptions={useTabScreenOptions(accent)}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: tabIcon('view-dashboard-outline') }}
      />
      <Tabs.Screen
        name="teams"
        options={{ title: 'Teams', tabBarIcon: tabIcon('account-group-outline') }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: tabIcon('message-text-outline'),
          tabBarBadge: unread && unread > 0 ? unread : undefined,
        }}
      />
      <Tabs.Screen
        name="people"
        options={{ title: 'People', tabBarIcon: tabIcon('account-tie-outline') }}
      />
      <Tabs.Screen name="setup" options={{ title: 'Setup', tabBarIcon: tabIcon('tune-variant') }} />
      {/* Organisers need a way out too; this is where Sign out lives. */}
      <Tabs.Screen
        name="profile"
        options={{ title: 'Me', tabBarIcon: tabIcon('account-circle-outline') }}
      />

      {/* Pushed from Home, kept out of the tab bar. */}
      <Tabs.Screen name="rounds" options={{ href: null, title: 'Rounds' }} />
      <Tabs.Screen name="import" options={{ href: null, title: 'Import' }} />
      <Tabs.Screen name="leaderboard" options={{ href: null, title: 'Leaderboard' }} />
      <Tabs.Screen name="announce" options={{ href: null, title: 'Announce' }} />
      <Tabs.Screen name="participants" options={{ href: null, title: 'Participant logins' }} />
      <Tabs.Screen name="attendance" options={{ href: null, title: 'Attendance' }} />
    </Tabs>
  );
}
