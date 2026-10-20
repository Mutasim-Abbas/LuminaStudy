import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  deleteAccount as apiDeleteAccount,
  fetchCloudSets,
  fetchSession,
  signIn as apiSignIn,
  signOut as apiSignOut,
  signOutEverywhere as apiSignOutEverywhere,
  signUp as apiSignUp,
  syncCloudSets,
  type AccountUser,
  type SignUpInput,
} from '../lib/api';
import { STUDY_SETS_KEY, type StudySet } from '../data/studySets';

/**
 * Account state, plus the one-time reconciliation that happens at sign-in.
 *
 * The app stays local-first: localStorage remains the thing the UI reads, so
 * everything keeps working with the backend switched off. Signing in pushes
 * whatever is local into the account and then adopts the server's merged view,
 * so work created while signed out is never silently dropped.
 */

interface AuthValue {
  user: AccountUser | null;
  /** True until the initial session check finishes. */
  loading: boolean;
  /**
   * True when no backend answered the session check, so there is nothing to
   * sign in to. The app then runs local-only: everything but AI and sync works.
   */
  guest: boolean;
  /** True while a sign-in/sign-up round trip (including sync) is running. */
  busy: boolean;
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Ends every session of the account, on every device. */
  signOutEverywhere: () => Promise<void>;
  /** Deletes the account for good. Pass the password, or none after confirming with Google. */
  deleteAccount: (password?: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function readLocalSets(): StudySet[] {
  try {
    const raw = localStorage.getItem(STUDY_SETS_KEY);
    return raw ? (JSON.parse(raw) as StudySet[]) : [];
  } catch {
    return [];
  }
}

/**
 * Wipe the local cache once an account has left this browser. Whatever is on
 * screen belongs to that account — and on a shared or library computer the
 * next person to sign in would otherwise inherit it *and* push it into their
 * own account on reconcile. The data is safe on the server (or deliberately
 * gone); this copy is only a cache.
 */
function forgetLocalData() {
  for (const key of [STUDY_SETS_KEY, 'lumina.srs', 'lumina.activity', 'lumina.userName']) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable — nothing cached to forget */
    }
  }
}

function writeLocalSets(sets: StudySet[]) {
  try {
    localStorage.setItem(STUDY_SETS_KEY, JSON.stringify(sets));
  } catch {
    /* storage unavailable — the session still works, it just won't persist */
  }
}



/**
 * One-time cleanup: earlier versions pre-installed two example sets ("Bio 101:
 * Cell Theory", "Intro to Psych: Memory") into every library. They're gone from
 * the product, but installs that already have them keep them in localStorage —
 * so they're removed here, matched by title *and* their known id or seed
 * description so a user's genuine set that happens to share a title survives.
 */
function purgeLegacySeeds(): void {
  const sets = readLocalSets();
  const isSeed = (s: StudySet) =>
    (s.title === 'Bio 101: Cell Theory' &&
      (s.id === 'bio-101-cell-theory' || s.description.startsWith('Reviewing mitochondria'))) ||
    (s.title === 'Intro to Psych: Memory' &&
      (s.id === 'psych-memory' || s.description.startsWith('Key concepts: short')));
  const kept = sets.filter((s) => !isSeed(s));
  if (kept.length !== sets.length) writeLocalSets(kept);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);

  // Resume an existing session on boot, and pull that account's sets.
  useEffect(() => {
    purgeLegacySeeds();
    let cancelled = false;
    (async () => {
      const { user: found, reachable } = await fetchSession();
      if (cancelled) return;
      setUser(found);
      setGuest(!reachable);
      if (found) {
        try {
          const sets = await fetchCloudSets();
          if (!cancelled && sets.length > 0) writeLocalSets(sets);
        } catch {
          // Offline: keep using the local copy rather than blanking the library.
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Push local work into the account, then adopt the server's merged list. */
  const reconcile = useCallback(async () => {
    const local = readLocalSets();
    const merged = local.length > 0 ? await syncCloudSets(local) : await fetchCloudSets();
    // A brand-new account simply starts empty — the library is the user's own
    // work, not example content nobody asked for.
    writeLocalSets(merged);
  }, []);

  const signUp = useCallback(
    async (input: SignUpInput) => {
      setBusy(true);
      try {
        setUser(await apiSignUp(input));
        await reconcile();
      } finally {
        setBusy(false);
      }
    },
    [reconcile],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      try {
        setUser(await apiSignIn(email, password));
        await reconcile();
      } finally {
        setBusy(false);
      }
    },
    [reconcile],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await apiSignOut();
      setUser(null);
      forgetLocalData();
    } finally {
      setBusy(false);
    }
  }, []);

  const signOutEverywhere = useCallback(async () => {
    setBusy(true);
    try {
      await apiSignOutEverywhere();
      setUser(null);
      forgetLocalData();
    } finally {
      setBusy(false);
    }
  }, []);

  const deleteAccount = useCallback(async (password?: string) => {
    setBusy(true);
    try {
      await apiDeleteAccount(password);
      setUser(null);
      forgetLocalData();
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, guest, busy, signUp, signIn, signOut, signOutEverywhere, deleteAccount }),
    [user, loading, guest, busy, signUp, signIn, signOut, signOutEverywhere, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
