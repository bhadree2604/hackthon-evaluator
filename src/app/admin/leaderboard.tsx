import { LeaderboardView } from '@/components/leaderboard-view';
import { useRoleTheme } from '@/lib/theme';
export default function AdminLeaderboard() {
  const RoleTheme = useRoleTheme();
  return (
    <LeaderboardView
      accent={RoleTheme.admin.accent}
      eyebrow="Organiser"
      gradient={RoleTheme.admin.gradient}
    />
  );
}
