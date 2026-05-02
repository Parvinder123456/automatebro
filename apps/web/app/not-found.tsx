/**
 * App Router 404 page. Without this, Next.js falls back to the legacy
 * pages-router _error which uses <Html> internally and breaks the build.
 */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-gray-600">The page you&apos;re looking for doesn&apos;t exist.</p>
      <a href="/" className="mt-4 inline-block underline">
        Back to home
      </a>
    </main>
  );
}
