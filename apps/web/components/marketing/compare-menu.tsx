'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Spec 012 — header dropdown for the Compare nav item.
 * Closes on outside click, Escape key, or blur.
 */
export function CompareMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent): void {
      if (containerRef.current === null) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-gray-700 hover:text-black"
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="compare-menu-trigger"
      >
        Compare ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-48 rounded border bg-white p-1 text-sm shadow-lg"
          data-testid="compare-menu"
        >
          <a
            href="/compare/manychat"
            className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-100"
          >
            vs ManyChat
          </a>
          <a
            href="/compare/linkplease"
            className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-100"
          >
            vs LinkPlease
          </a>
          <a
            href="/compare/linkdm"
            className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-100"
          >
            vs LinkDM
          </a>
        </div>
      )}
    </div>
  );
}
