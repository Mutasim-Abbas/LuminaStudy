import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LuminaMark } from '../components/LuminaMark';
import {
  DashboardIcon,
  LibraryIcon,
  CalculatorIcon,
  GraduationCapIcon,
  SearchIcon,
  BellIcon,
  HelpCircleIcon,
  MenuIcon,
  CloseIcon,
} from '../components/icons';
import { useLocalStorage } from '../hooks/useLocalStorage';

const LINKS: { to: string; label: string; end?: boolean; icon: (p: { className?: string }) => JSX.Element }[] = [
  { to: '/', label: 'Dashboard', end: true, icon: DashboardIcon },
  { to: '/study', label: 'Library', icon: LibraryIcon },
  { to: '/calculator', label: 'Grade Calculator', icon: CalculatorIcon },
  { to: '/planner', label: 'Degree Planner', icon: GraduationCapIcon },
];

const navItemClass = (active: boolean) =>
  `flex items-center gap-4 px-6 py-3 rounded-lg font-label-lg text-label-lg transition-colors duration-fast ${
    active
      ? 'border-l-4 border-primary bg-surface-container-low text-primary font-bold -ml-1 pl-[26px]'
      : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
  }`;

/**
 * Fixed 280px sidebar (desktop) + a fixed top bar with search. Mobile
 * collapses the sidebar behind a tap-to-open menu — a horizontal scroll
 * strip is unreliable on real phones, a full-screen drawer always works.
 */
export function Sidebar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed left-0 top-0 z-50 hidden h-screen w-[280px] flex-col gap-2 bg-surface-container-lowest py-stack-md shadow-nav md:flex"
    >
      <div className="mb-8 flex items-center gap-3 px-gutter">
        <LuminaMark size={36} />
        <div>
          <h1 className="font-display text-title-lg font-bold text-primary">Lumina</h1>
          <p className="font-label-sm text-label-sm text-on-surface-variant">Study Intelligence</p>
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} end={link.end} className={({ isActive }) => navItemClass(isActive)}>
              <link.icon className="h-5 w-5 shrink-0" />
              <span>{link.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Top bar: search + notification/help affordances + your initial. Fixed, offset for the sidebar on desktop. */
export function TopBar() {
  const [name] = useLocalStorage('lumina.userName', '');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const initial = name.trim().charAt(0).toUpperCase() || 'L';

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-surface-variant bg-surface-container-lowest/90 backdrop-blur-xl md:left-[280px]">
        <div className="mx-auto flex h-full max-w-container-max items-center justify-between gap-4 px-4 md:px-gutter">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-surface-variant md:hidden"
          >
            {mobileOpen ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
          </button>

          <div className="flex max-w-md flex-1 items-center gap-2 rounded-full bg-surface-container-low px-4 py-2 focus-within:ring-2 focus-within:ring-secondary/50">
            <SearchIcon className="h-5 w-5 shrink-0 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Search resources…"
              className="w-full bg-transparent font-body text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none"
            />
          </div>

          <div className="flex shrink-0 items-center gap-4 md:gap-6">
            <button
              type="button"
              aria-label="Notifications"
              className="relative text-on-surface-variant transition-colors hover:text-secondary"
            >
              <BellIcon className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-error" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Help"
              className="hidden text-on-surface-variant transition-colors hover:text-secondary sm:block"
            >
              <HelpCircleIcon className="h-5 w-5" />
            </button>
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-surface-container-highest bg-primary-fixed font-label-sm font-bold text-on-primary-fixed"
              title={name || 'You'}
            >
              {initial}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <nav
          aria-label="Primary mobile"
          className="rise-in fixed inset-x-0 top-16 z-40 flex flex-col gap-1 border-b border-surface-variant bg-surface-container-lowest p-2 shadow-soft md:hidden"
        >
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex min-h-[48px] items-center gap-4 rounded-lg px-4 font-label-lg text-label-lg ${
                  isActive ? 'bg-primary text-on-primary' : 'text-on-surface-variant active:bg-surface-container-low'
                }`
              }
            >
              <link.icon className="h-5 w-5" />
              {link.label}
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}
