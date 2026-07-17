import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const LINKS: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/calculator', label: 'Grade Calculator' },
  { to: '/planner', label: 'Degree Planner' },
  { to: '/study', label: 'Study Sets' },
];

/** Logo mark: a simple leaf/tree glyph in the brand indigo, matching the reference logo. */
function LuminaMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <rect width="26" height="26" rx="8" fill="var(--accent)" />
      <path d="M13 6c0 3-2 4-2 7s2 5 2 5 2-2 2-5-2-4-2-7Z" fill="var(--mint)" />
      <path d="M13 12v6" stroke="var(--on-accent)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Floating pill nav on desktop; a tap-to-open menu on mobile. A horizontal
 * scroll strip looks fine in a desktop preview but is unreliable with a real
 * finger on a real phone, so mobile gets a proper dropdown instead — every
 * link is always one tap away, each row a full touch target.
 */
export function Nav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-1/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-4 py-3">
        <NavLink to="/" className="flex items-center gap-2">
          <LuminaMark />
          <span className="font-display text-lg font-bold tracking-tight text-primary">
            Lumina Study
          </span>
        </NavLink>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `pill px-4 py-2 text-sm font-medium ${
                  isActive
                    ? 'bg-accent text-on-accent shadow-clay'
                    : 'text-secondary hover:bg-tertiary hover:text-primary'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <NavLink
          to="/upload"
          className="pill hidden bg-mint px-4 py-2 text-sm font-semibold text-on-mint shadow-clay sm:block"
        >
          + New Study Set
        </NavLink>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="grid h-11 w-11 place-items-center rounded-full text-primary md:hidden"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          aria-label="Primary mobile"
          className="rise-in flex flex-col gap-1 border-t border-border p-2 md:hidden"
        >
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex min-h-[48px] items-center rounded-2xl px-4 text-base font-medium ${
                  isActive ? 'bg-accent text-on-accent' : 'text-primary active:bg-tertiary'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink
            to="/upload"
            className="mt-1 flex min-h-[48px] items-center justify-center rounded-2xl bg-mint text-base font-semibold text-on-mint"
          >
            + New Study Set
          </NavLink>
        </nav>
      )}
    </header>
  );
}
