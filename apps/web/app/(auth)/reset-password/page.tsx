import { ResetPasswordForm } from '../../../components/auth/reset-password-form';

export const metadata = { title: 'Set new password — AutomateBro' };

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-semibold">Set a new password</h1>
      <ResetPasswordForm />
    </main>
  );
}
