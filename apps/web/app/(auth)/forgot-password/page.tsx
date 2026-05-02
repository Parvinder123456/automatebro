import { ForgotPasswordForm } from '../../../components/auth/forgot-password-form';

export const metadata = { title: 'Reset password — AutomateBro' };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-semibold">Reset your password</h1>
      <p className="mb-4 text-sm text-gray-600">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <ForgotPasswordForm />
    </main>
  );
}
