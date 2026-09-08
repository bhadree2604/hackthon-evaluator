import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from 'convex/react';

import { AnnouncementFeed } from '@/components/announcement-feed';
import { TAB_BAR_INSET } from '@/components/role-shell';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/primitives';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { api } from '@/convex/_generated/api';
import { useNotifications } from '@/lib/notifications';
import { useRoleTheme } from '@/lib/theme';


export default function ParticipantUpdates() {
  const RoleTheme = useRoleTheme();
  const accent = useRoleTheme().participant.accent;
  const feed = useQuery(api.announcements.feed, { limit: 60 });
  const { permission, requestPermission } = useNotifications();

  return (
    <Screen gradient={RoleTheme.participant.gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow="Participant"
        title="Updates"
        subtitle="Everything the organisers broadcast during the build."
        right={<MaterialCommunityIcons name="bullhorn-outline" size={22} color={accent} />}
      />

      {permission === 'denied' && (
        <Banner
          tone="warn"
          title="Notifications are off"
          message="Turn them on so you hear the urgent calls, not just see them here."
          action={
            <Button
              label="Enable notifications"
              size="sm"
              accent={accent}
              icon="bell-ring-outline"
              onPress={() => void requestPermission()}
            />
          }
        />
      )}

      <AnnouncementFeed items={feed} accent={accent} />
    </Screen>
  );
}
