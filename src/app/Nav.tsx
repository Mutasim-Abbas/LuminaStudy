import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LuminaMark } from '../components/LuminaMark';
import {
  DashboardIcon,
  LibraryIcon,
  CalculatorIcon,
  GraduationCapIcon,
  SearchIcon,
  HelpCircleIcon,
  MenuIcon,
  CloseIcon,
  SunIcon,
  MoonIcon,
} from '../components/icons';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { SEED_STUDY_SETS, type StudySet } from '../data/studySets';
import { setMastery, type SrsState } from '../engine/srs';

const LINKS: { to: string; label: string; end?: boolean; icon: (p: { className?: string }) => JSX.Element }[] = [
  { to: '/', label: 'Dashboard', end: true, icon: DashboardIcon },
  { to: '/study', label: 'Library', icon: LibraryIcon },
  { to: '/calculator', label: 'Grade Calculator', icon: CalculatorIcon },
  { to: '/planner', label: 'Degree Planner', icon: GraduationCapIcon },
];

/**
 * Sidebar item. The active route keeps a solid accent bar; an inactive item
 * *previews* that same treatment on hover — the accent bar grows in from the
 * left and the row nudges over — then settles back when the pointer leaves.
 * The left border is always present but transparent, so nothing reflows as it
 * colours in. `group` lets the accent react to hovering anywhere on the row.
 */
const navItemClass = (active: boolean) =>
  [
    'group relative flex items-center gap-4 rounded-lg border-l-4 py-3 pl-[20px] pr-6',
    'font-label-lg text-label-lg transition-all duration-fast ease-out',
    active
      ? 'border-primary bg-surface-container-low font-bold text-primary'
      : 'border-transparent text-on-surface-variant hover:translate-x-1 hover:border-primary/60 hover:bg-surface-container-low hover:text-primary',
  ].join(' ');

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
              <link.icon className="h-5 w-5 shrink-0 transition-transform duration-fast ease-out group-hover:scale-110" />
              <span>{link.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Toggles light/dark, labelled by the theme it will switch *to*. */
function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const goingDark = resolved === 'light';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={goingDark ? 'Switch to dark theme' : 'Switch to light theme'}
      title={goingDark ? 'Dark theme' : 'Light theme'}
      className="pressable grid h-9 w-9 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary"
    >
      {goingDark ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
    </button>
  );
}

/**
 * Avatar that doubles as the account entry point: signed in it shows the
 * account's initial and links to the account page; signed out it invites you
 * to sign in without ever blocking use of the app.
 */
function AccountButton({ fallbackInitial, localName }: { fallbackInitial: string; localName: string }) {
  const { user, loading } = useAuth();
  // Prefer the account's name for the avatar initial, then its email.
  const initial = user ? (user.name || user.email).charAt(0).toUpperCase() : fallbackInitial;

  return (
    <Link
      to="/account"
      title={
        user
          ? `Signed in as ${user.name || user.email}`
          : localName
            ? `${localName} — sign in to sync`
            : 'Sign in to sync'
      }
      aria-label={user ? `Account: ${user.name || user.email}` : 'Sign in'}
      className="pressable relative grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-surface-container-highest bg-primary-fixed font-label-sm font-bold text-on-primary-fixed"
    >
      {initial}
      {/* A quiet dot marks a synced account — no badge when signed out. */}
      {!loading && user && (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-container-lowest bg-secondary"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}

/** Case-insensitive match across the fields a student would actually search by. */
function searchSets(sets: StudySet[], query: string): StudySet[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return sets
    .filter((s) =>
      [s.title, s.subject, s.description].some((field) => field?.toLowerCase().includes(q)),
    )
    .slice(0, 6);
}

/**
 * Search over the user's study sets. Opens on ⌘K / Ctrl+K, navigates with the
 * arrow keys, commits with Enter — the interaction people expect from a search
 * field that means it.
 */
function SetSearch() {
  const [sets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);
  const [srs] = useLocalStorage<SrsState>('lumina.srs', {});
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => searchSets(sets, query), [sets, query]);

  // ⌘K / Ctrl+K focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (set: StudySet) => {
    navigate(`/study/${set.id}`);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active] ?? results[0]);
    }
  };

  const showMenu = open && query.trim().length > 0;

  return (
    <div className="relative max-w-md flex-1">
      <div className="flex items-center gap-2 rounded-full bg-surface-container-low px-4 py-2 focus-within:ring-2 focus-within:ring-secondary/50">
        <SearchIcon className="h-5 w-5 shrink-0 text-on-surface-variant" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Delay so a click on a result lands before the menu unmounts.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Search your study sets…"
          aria-label="Search study sets"
          role="combobox"
          aria-expanded={showMenu}
          aria-controls="search-results"
          className="w-full bg-transparent font-body text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded border border-outline-variant/60 px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant sm:block">
          ⌘K
        </kbd>
      </div>

      {showMenu && (
        <div
          id="search-results"
          role="listbox"
          className="rise-in absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-modal"
        >
          {results.length === 0 ? (
            <p className="px-4 py-3 font-body text-body-sm text-on-surface-variant">
              No study sets match “{query.trim()}”.
            </p>
          ) : (
            results.map((set, i) => (
              <button
                key={set.id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(set)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                  i === active ? 'bg-surface-container-low' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-label-lg text-label-lg text-on-surface">{set.title}</span>
                  <span className="block truncate font-body text-body-sm text-on-surface-variant">
                    {set.subject} · {set.cards.length} cards
                  </span>
                </span>
                <span className="shrink-0 font-label-sm text-label-sm text-on-surface-variant">{setMastery(set, srs)}%</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Top bar: search + theme toggle + your initial. Fixed, offset for the sidebar on desktop. */
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

          <SetSearch />

          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <ThemeToggle />
            <button
              type="button"
              aria-label="Keyboard shortcuts and help"
              title="Press ⌘K to search · Space flips a card · 1-4 answers a quiz"
              className="pressable hidden h-9 w-9 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary sm:grid"
            >
              <HelpCircleIcon className="h-5 w-5" />
            </button>
            <AccountButton fallbackInitial={initial} localName={name} />
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
