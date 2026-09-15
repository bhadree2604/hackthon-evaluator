import { useQuery } from 'convex/react';
import { Tabs } from 'expo-router/js-tabs';

import { RoleGate, tabIcon, useTabScreenOptions } from '@/components/role-shell';
import { api } from '@/convex/_generated/api';
import { useRoleTheme } from '@/lib/theme';


export default function ParticipantLayout() {
  return (
    <RoleGate role="participant">
      <ParticipantTabs />
    </RoleGate>
  );
}

function ParticipantTabs() {
  const accent = useRoleTheme().participant.accent;
  const unread = useQuery(api.chat.unreadCount, {});

  return (
    <Tabs screenOptions={useTabScreenOptions(accent)}>
      <Tabs.Screen
        name="index"
        options={{ title: 'My team', tabBarIcon: tabIcon('account-group-outline') }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Help desk',
          tabBarIcon: tabIcon('message-text-outline'),
          tabBarBadge: unread && unread > 0 ? unread : undefined,
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{ title: 'Updates', tabBarIcon: tabIcon('bullhorn-outline') }}
      />
      <Tabs.Screen
        name="results"
        options={{ title: 'Results', tabBarIcon: tabIcon('trophy-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('account-circle-outline') }}
      />
    </Tabs>
  );
}
