import { SignupForm } from '../../../components/auth/signup-form';

export const metadata = { title: 'Create account — BloomDM' };

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-semibold">Create account</h1>
      <SignupForm />
    </main>
  );
}
