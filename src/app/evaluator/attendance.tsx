import { AttendanceOverview } from '@/components/attendance-overview';
import { useRoleTheme } from '@/lib/theme';
export default function EvaluatorAttendance() {
  const RoleTheme = useRoleTheme();
  return (
    <AttendanceOverview
      accent={RoleTheme.evaluator.accent}
      eyebrow="Evaluator"
      gradient={RoleTheme.evaluator.gradient}
    />
  );
}
