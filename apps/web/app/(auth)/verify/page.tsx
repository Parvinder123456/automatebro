export const metadata = { title: 'Check your email — AutomateBro' };

export default function VerifyPage() {
  return (
    <main className="mx-auto max-w-md p-8" data-testid="verify-page">
      <h1 className="mb-6 text-2xl font-semibold">Check your email</h1>
      <p className="text-gray-700">
        We&apos;ve sent you a verification link. Click it to confirm your email and finish setting
        up your account.
      </p>
      <p className="mt-4 text-sm text-gray-500">
        Don&apos;t see it? Check your spam folder. If you still need help,{' '}
        <a href="/login" className="underline">
          back to sign in
        </a>
        .
      </p>
    </main>
  );
}
