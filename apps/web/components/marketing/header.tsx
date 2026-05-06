'use client';

import { useState } from 'react';
import { CompareMenu } from './compare-menu';

/**
 * Spec 012 §3.3 — marketing header. Logo + nav + CTAs.
 *
 * Client Component because the mobile menu has open/closed state.
 * On screens < 640px we show a hamburger; on ≥ 640px the inline nav.
 */
export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b bg-white" data-testid="marketing-header">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a
          href="/"
          className="flex items-center gap-2 text-lg font-semibold"
          data-testid="header-logo"
        >
          <img src="/logo-header.png" alt="BloomDM" width={32} height={32} />
          BloomDM
        </a>

        <nav className="hidden items-center gap-6 sm:flex">
          <a href="/pricing" className="text-sm text-gray-700 hover:text-black">
            Pricing
          </a>
          <CompareMenu />
          <a href="/login" className="text-sm text-gray-700 hover:text-black">
            Sign in
          </a>
          <a
            href="/signup"
            className="rounded bg-black px-4 py-2 text-sm text-white hover:opacity-90"
            data-testid="header-cta-signup"
          >
            Sign up
          </a>
        </nav>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          className="sm:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          data-testid="mobile-menu-trigger"
        >
          <span className="block h-0.5 w-6 bg-black" />
          <span className="mt-1.5 block h-0.5 w-6 bg-black" />
          <span className="mt-1.5 block h-0.5 w-6 bg-black" />
        </button>
      </div>

      {mobileOpen && (
        <nav className="border-t bg-white px-6 py-4 sm:hidden" data-testid="mobile-menu">
          <ul className="space-y-3 text-sm">
            <li>
              <a href="/pricing">Pricing</a>
            </li>
            <li>
              <a href="/compare/manychat">vs ManyChat</a>
            </li>
            <li>
              <a href="/compare/linkplease">vs LinkPlease</a>
            </li>
            <li>
              <a href="/compare/linkdm">vs LinkDM</a>
            </li>
            <li>
              <a href="/login">Sign in</a>
            </li>
            <li>
              <a href="/signup" className="inline-block rounded bg-black px-4 py-2 text-white">
                Sign up
              </a>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
