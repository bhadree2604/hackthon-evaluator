import { LeaderboardView } from '@/components/leaderboard-view';
import { useRoleTheme } from '@/lib/theme';
export default function EvaluatorLeaderboard() {
  const RoleTheme = useRoleTheme();
  return (
    <LeaderboardView
      accent={RoleTheme.evaluator.accent}
      eyebrow="Evaluator"
      gradient={RoleTheme.evaluator.gradient}
    />
  );
}
