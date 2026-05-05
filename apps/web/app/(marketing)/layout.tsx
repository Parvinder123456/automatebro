/**
 * Spec 012 §3.1 — marketing route group layout.
 *
 * Wraps every public marketing page (`/`, `/pricing`, `/compare/*`,
 * `/privacy`, `/terms`, `/dpa`, `/deleted`) with header + footer chrome.
 *
 * Route groups (parens-folder) don't affect URLs, so this layout
 * applies to those URLs without nesting them under `/marketing/*`.
 *
 * NB: no `getCtx()` call here — these pages are public and must
 * render statically. Adding any DB / cookie call would force-dynamic
 * the whole tree.
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CookieBanner } from '../../components/marketing/cookie-banner';
import { Footer } from '../../components/marketing/footer';
import { Header } from '../../components/marketing/header';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://automatebro.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'AutomateBro — Instagram DM automation for Indian creators',
    template: '%s — AutomateBro',
  },
  description:
    'Auto-reply to comments and stories with templated or AI-generated DMs. Flat INR pricing, true unlimited accounts, native AI replies. Built for Indian creators and D2C brands.',
  openGraph: {
    title: 'AutomateBro — Instagram DM automation for Indian creators',
    description:
      'Comment-to-DM, story-reply automation, AI replies, lead capture. Flat INR pricing.',
    url: SITE_URL,
    siteName: 'AutomateBro',
    locale: 'en_IN',
    type: 'website',
  },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <CookieBanner />
    </div>
  );
}
