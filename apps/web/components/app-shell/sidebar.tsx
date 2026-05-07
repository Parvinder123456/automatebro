/**
 * Spec 011 §3.3 — sidebar nav for /app/* pages.
 *
 * Server Component. Reads `x-pathname` header (set by middleware) and
 * highlights the active link by prefix-match. Active link is also
 * tagged `data-testid="nav-active"` so E2E tests can assert which
 * section is current.
 */
import { headers } from 'next/headers';

interface NavLink {
  href: string;
  label: string;
}

const LINKS: NavLink[] = [
  { href: '/app/dashboard', label: 'Dashboard' },
  { href: '/app/automations', label: 'Automations' },
  // Spec 026 — WhatsApp top-level nav. Placement after Automations
  // because WA flows are conceptually a kind of automation.
  { href: '/app/whatsapp', label: 'WhatsApp' },
  { href: '/app/leads', label: 'Leads' },
  { href: '/app/sends', label: 'Sends' },
  { href: '/app/integrations', label: 'Integrations' },
  { href: '/app/settings', label: 'Settings' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/app/dashboard') return pathname === '/app/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export async function Sidebar({ workspaceName }: { workspaceName: string }) {
  const h = await headers();
  const pathname = h.get('x-pathname') ?? '/app/dashboard';

  return (
    <aside
      className="flex w-60 shrink-0 flex-col border-r bg-gray-50 p-4"
      data-testid="app-sidebar"
    >
      <div className="mb-6 px-2">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <img src="/logo-header.png" alt="BloomDM" width={28} height={28} />
          BloomDM
        </div>
        <div className="text-xs text-gray-600" data-testid="sidebar-workspace">
          {workspaceName}
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <a
              key={link.href}
              href={link.href}
              className={`rounded px-3 py-2 text-sm ${
                active ? 'bg-black font-medium text-white' : 'text-gray-700 hover:bg-gray-200'
              }`}
              data-testid={active ? 'nav-active' : undefined}
            >
              {link.label}
            </a>
          );
        })}
      </nav>

      <div className="mt-auto pt-4">
        <form action="/logout" method="POST">
          <button
            type="submit"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
