import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { COMPETITORS, getCompetitor } from '../competitors';

/**
 * Spec 012 §3.4 — dynamic competitor comparison page. Slugs:
 * `manychat`, `linkplease`, `linkdm`. Anything else → notFound().
 */

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return Object.keys(COMPETITORS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const competitor = getCompetitor(slug);
  if (competitor === null) return { title: 'Compare' };
  return {
    title: competitor.headline,
    description: competitor.positioning,
  };
}

export default async function ComparePage({ params }: Params) {
  const { slug } = await params;
  const competitor = getCompetitor(slug);
  if (competitor === null) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16" data-testid={`compare-page-${competitor.slug}`}>
      <header className="mb-10">
        <p className="mb-2 text-sm uppercase tracking-wider text-gray-500">Compare</p>
        <h1 className="mb-3 text-4xl font-bold">{competitor.headline}</h1>
        <p className="text-gray-600">{competitor.positioning}</p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">Where {competitor.name} is strong</h2>
        <ul className="space-y-2 text-gray-700">
          {competitor.strengths.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true">+</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">Where {competitor.name} falls short</h2>
        <ul className="space-y-2 text-gray-700">
          {competitor.weaknesses.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true">−</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10 rounded border bg-gray-50 p-5" data-testid="verdict">
        <h2 className="mb-2 text-xl font-semibold">Our take</h2>
        <p className="text-gray-700">{competitor.verdict}</p>
      </section>

      <div className="flex flex-wrap gap-3">
        <a href="/signup" className="rounded bg-black px-5 py-2 text-white hover:opacity-90">
          Try BloomDM free
        </a>
        <a href="/pricing" className="rounded border px-5 py-2 hover:bg-gray-50">
          See pricing
        </a>
      </div>
    </div>
  );
}
