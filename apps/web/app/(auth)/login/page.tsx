import { Suspense } from 'react';
import { LoginForm } from '../../../components/auth/login-form';

export const metadata = { title: 'Sign in — BloomDM' };

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
