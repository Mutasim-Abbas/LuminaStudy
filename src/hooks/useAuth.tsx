import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  fetchCloudSets,
  fetchCurrentUser,
  signIn as apiSignIn,
  signOut as apiSignOut,
  signUp as apiSignUp,
  syncCloudSets,
  type AccountUser,
  type SignUpInput,
} from '../lib/api';
import { SEED_STUDY_SETS, STUDY_SETS_KEY, installSeedSets, type StudySet } from '../data/studySets';

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
  /** True while a sign-in/sign-up round trip (including sync) is running. */
  busy: boolean;
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
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

function writeLocalSets(sets: StudySet[]) {
  try {
    localStorage.setItem(STUDY_SETS_KEY, JSON.stringify(sets));
  } catch {
    /* storage unavailable — the session still works, it just won't persist */
  }
}

/** Sets the user created before signing in, minus the untouched seed examples. */
function localSetsWorthKeeping(): StudySet[] {
  const seedIds = new Set(SEED_STUDY_SETS.map((s) => s.id));
  return readLocalSets().filter((s) => !seedIds.has(s.id));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Resume an existing session on boot, and pull that account's sets.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await fetchCurrentUser();
      if (cancelled) return;
      setUser(found);
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
    const local = localSetsWorthKeeping();
    const merged = local.length > 0 ? await syncCloudSets(local) : await fetchCloudSets();

    if (merged.length > 0) {
      writeLocalSets(merged);
    } else {
      // A brand-new account with nothing to adopt: start it on fresh examples
      // rather than an empty library. Clearing first means the seeds are
      // regenerated with ids unique to this install.
      localStorage.removeItem(STUDY_SETS_KEY);
      installSeedSets();
    }
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
      /**
       * Wipe the local cache on the way out. Now that an account is required,
       * whatever is on screen belongs to the account that just left — and on a
       * shared or library computer the next person to sign in would otherwise
       * inherit it *and* push it into their own account on reconcile. The data
       * is safe on the server; this copy is only a cache.
       */
      localStorage.removeItem(STUDY_SETS_KEY);
      localStorage.removeItem('lumina.srs');
      localStorage.removeItem('lumina.activity');
      localStorage.removeItem('lumina.userName');
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, busy, signUp, signIn, signOut }),
    [user, loading, busy, signUp, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
