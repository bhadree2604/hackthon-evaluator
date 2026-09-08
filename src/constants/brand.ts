/**
 * Hackfinity 3.0 design tokens.
 *
 * The dark palette is lifted from hackfinity3.0.ramcoad.com so the companion
 * app reads as the same product. The light palette keeps the same token names
 * and the same meaning, with accents darkened enough to stay legible on paper
 * white — the site's cyan is unreadable as text on a light background.
 *
 * Components never import a palette directly; they call `useColors()` from
 * `@/lib/theme`, which returns one of these two.
 */

export type Colors = {
  bg: string;
  bgDeep: string;
  bgElevated: string;
  surface: string;
  surfaceStrong: string;
  surfacePressed: string;

  border: string;
  borderStrong: string;
  borderSubtle: string;

  cyan: string;
  cyanDim: string;
  orange: string;
  orangeDim: string;
  green: string;
  greenDim: string;
  greenSoft: string;
  blue: string;
  lilac: string;
  amber: string;
  amberDim: string;
  red: string;
  redDim: string;

  text: string;
  textDim: string;
  textMuted: string;
  textFaint: string;
  onAccent: string;

  /** Neutral outline every card shares. */
  cardBorder: string;
  cardBg: string;
  /** Fill behind progress tracks and inert chips. */
  track: string;
  inputBg: string;
  inputBgFocused: string;
  tabBar: string;
  overlay: string;
};

export const DarkColors: Colors = {
  bg: '#050509',
  bgDeep: '#020206',
  bgElevated: '#0C0C15',
  surface: 'rgba(255,255,255,0.045)',
  surfaceStrong: 'rgba(255,255,255,0.075)',
  surfacePressed: 'rgba(255,255,255,0.11)',

  border: 'rgba(148,190,255,0.14)',
  borderStrong: 'rgba(87,230,255,0.32)',
  borderSubtle: 'rgba(255,255,255,0.07)',

  cyan: '#57e6ff',
  cyanDim: 'rgba(87,230,255,0.14)',
  orange: '#ff7a3c',
  orangeDim: 'rgba(255,122,60,0.14)',
  green: '#34d399',
  greenDim: 'rgba(52,211,153,0.14)',
  greenSoft: '#86efac',
  blue: '#7cc4ff',
  lilac: '#a5b8ff',
  amber: '#f7c948',
  amberDim: 'rgba(247,201,72,0.14)',
  red: '#ff6b6b',
  redDim: 'rgba(255,107,107,0.14)',

  text: '#eef4ff',
  textDim: '#c9d4e4',
  textMuted: '#8492a8',
  textFaint: '#5b6779',
  onAccent: '#04121a',

  cardBorder: 'rgba(255,255,255,0.10)',
  cardBg: 'rgba(255,255,255,0.045)',
  track: 'rgba(255,255,255,0.09)',
  inputBg: 'rgba(255,255,255,0.035)',
  inputBgFocused: 'rgba(255,255,255,0.06)',
  tabBar: 'rgba(7,8,15,0.98)',
  overlay: 'rgba(2,2,8,0.7)',
};

export const LightColors: Colors = {
  bg: '#f4f6fa',
  bgDeep: '#e9edf4',
  bgElevated: '#ffffff',
  surface: '#ffffff',
  surfaceStrong: '#eef2f8',
  surfacePressed: '#e3e9f2',

  border: '#dbe2ec',
  borderStrong: '#b9c6d9',
  borderSubtle: '#e6ebf3',

  cyan: '#0e7490',
  cyanDim: 'rgba(14,116,144,0.10)',
  orange: '#c2410c',
  orangeDim: 'rgba(194,65,12,0.10)',
  green: '#047857',
  greenDim: 'rgba(4,120,87,0.10)',
  greenSoft: '#059669',
  blue: '#1d4ed8',
  lilac: '#4f46e5',
  amber: '#b45309',
  amberDim: 'rgba(180,83,9,0.10)',
  red: '#be123c',
  redDim: 'rgba(190,18,60,0.10)',

  text: '#0f172a',
  textDim: '#26364d',
  textMuted: '#55657c',
  textFaint: '#7d8ca3',
  onAccent: '#ffffff',

  cardBorder: '#e0e6ef',
  cardBg: '#ffffff',
  track: '#e4e9f1',
  inputBg: '#ffffff',
  inputBgFocused: '#ffffff',
  tabBar: '#ffffff',
  overlay: 'rgba(15,23,42,0.35)',
};

/** Static dark palette, for the few places outside the React tree. */
export const Brand = DarkColors;

export type RoleKey = 'admin' | 'evaluator' | 'coordinator' | 'participant';

export type RoleThemeEntry = {
  label: string;
  accent: string;
  accentDim: string;
  icon: string;
  tagline: string;
  gradient: [string, string, string];
};

/** Role identity, resolved against whichever palette is active. */
export function roleThemes(c: Colors, isDark: boolean): Record<RoleKey, RoleThemeEntry> {
  return {
    admin: {
      label: 'Organiser',
      accent: c.orange,
      accentDim: c.orangeDim,
      icon: 'shield-crown-outline',
      tagline: 'Teams, labs, rubric and the people who run the floor.',
      gradient: isDark ? ['#150a05', '#0a0710', c.bg] : ['#fdf1ea', '#f7f3f6', c.bg],
    },
    evaluator: {
      label: 'Evaluator',
      accent: c.cyan,
      accentDim: c.cyanDim,
      icon: 'clipboard-check-outline',
      tagline: 'Score every team, watch the leaderboard move.',
      gradient: isDark ? ['#04141b', '#060a16', c.bg] : ['#e9f4f8', '#eff2f8', c.bg],
    },
    coordinator: {
      label: 'Coordinator',
      accent: c.green,
      accentDim: c.greenDim,
      icon: 'account-group-outline',
      tagline: 'Your labs, your teams, attendance every session.',
      gradient: isDark ? ['#04160f', '#050b13', c.bg] : ['#e8f5ef', '#eef3f7', c.bg],
    },
    participant: {
      label: 'Participant',
      accent: c.lilac,
      accentDim: 'rgba(79,70,229,0.10)',
      icon: 'rocket-launch-outline',
      tagline: 'Your team, your lab, your updates and a direct line to the desk.',
      gradient: isDark ? ['#0b0a1c', '#070812', c.bg] : ['#eeeefb', '#f0f2f9', c.bg],
    },
  };
}

/** Neutral backdrop used by screens with no role of their own. */
export function neutralGradient(c: Colors, isDark: boolean): [string, string, string] {
  return isDark ? ['#0a0d1a', '#060711', c.bg] : ['#eef2f8', '#f2f5fa', c.bg];
}

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const EVENT = {
  name: 'Hackfinity 3.0',
  tagline: 'Build at rocket speed',
  host: 'Ramco Institute of Technology',
  location: 'Rajapalayam, Tamil Nadu',
  dates: 'September 18 - 19, 2026',
  durationHours: 24,
  prizePool: '₹30,000',
  site: 'https://hackfinity3.0.ramcoad.com',
  supportEmail: 'hackfinity3.0@gmail.com',
} as const;

export type AttendanceStatus = 'present' | 'late' | 'excused' | 'absent';

export function attendanceStatusMeta(c: Colors): Record<
  AttendanceStatus,
  { label: string; color: string; dim: string; icon: string }
> {
  return {
    present: { label: 'Present', color: c.green, dim: c.greenDim, icon: 'check' },
    late: { label: 'Late', color: c.amber, dim: c.amberDim, icon: 'clock-outline' },
    excused: { label: 'Excused', color: c.blue, dim: c.cyanDim, icon: 'note-outline' },
    absent: { label: 'Absent', color: c.red, dim: c.redDim, icon: 'close' },
  };
}

export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'waived';

export function paymentStatusMeta(c: Colors): Record<
  PaymentStatus,
  { label: string; color: string; icon: string }
> {
  return {
    paid: { label: 'Paid', color: c.green, icon: 'check-decagram' },
    pending: { label: 'Payment pending', color: c.amber, icon: 'clock-outline' },
    failed: { label: 'Payment failed', color: c.red, icon: 'alert-decagram-outline' },
    waived: { label: 'Fee waived', color: c.blue, icon: 'ticket-percent-outline' },
  };
}
