import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Gate for every route that isn't the sign-in page.
 *
 * While the session check is in flight we render a spinner rather than
 * redirecting: bouncing a signed-in user to the login screen for a few hundred
 * milliseconds on every refresh looks like being logged out at random.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          role="status"
          aria-label="Checking your session"
          className="h-8 w-8 animate-spin rounded-full border-2 border-surface-variant border-t-primary"
        />
      </div>
    );
  }

  if (!user) {
    // Remember where they were headed so sign-in can send them back.
    return <Navigate to="/account" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
