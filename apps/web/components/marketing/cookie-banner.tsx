'use client';

import { useEffect, useState } from 'react';

/**
 * Spec 013 §3 — cookie / data-use banner. Shows once on first visit
 * and dismisses to localStorage. Single dismiss button — v1 marketing
 * site uses no third-party analytics cookies, only sign-in cookies.
 */
const STORAGE_KEY = 'ab_cookie_ack_v1';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === null) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable (private mode) — don't show banner.
    }
  }, []);

  function dismiss(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-white p-4 shadow-lg"
      data-testid="cookie-banner"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-700">
          We use cookies only for sign-in. No third-party trackers on this site. See our{' '}
          <a href="/privacy" className="underline">
            privacy policy
          </a>{' '}
          for details.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="rounded bg-black px-4 py-2 text-sm text-white hover:opacity-90"
          data-testid="cookie-banner-dismiss"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
