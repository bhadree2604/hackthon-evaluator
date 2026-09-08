import { AttendanceOverview } from '@/components/attendance-overview';
import { useRoleTheme } from '@/lib/theme';
export default function AdminAttendance() {
  const RoleTheme = useRoleTheme();
  return (
    <AttendanceOverview
      accent={RoleTheme.admin.accent}
      eyebrow="Organiser"
      gradient={RoleTheme.admin.gradient}
    />
  );
}
