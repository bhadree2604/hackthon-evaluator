import { AuthForm } from '@/components/auth-form';

/** General sign-in. Works for every role; we route by whatever the profile says. */
export default function GeneralSignIn() {
  return <AuthForm role={null} />;
}
