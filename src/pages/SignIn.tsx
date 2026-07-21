import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';
import { LuminaMark } from '../components/LuminaMark';

/**
 * Combined sign-in / sign-up. One form, one toggle — asking a student to find
 * a separate "register" page is friction with nothing to show for it.
 */
export default function SignIn() {
  const { user, signIn, signUp, signOut, busy } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  // RequireAuth stashes the page it intercepted so sign-in can land there.
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'signup') await signUp(email, password);
      else await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    }
  };

  const inputClass =
    'w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2.5 font-body text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

  // Already signed in — offer the way out rather than a pointless second form.
  if (user) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16 text-center">
        <LuminaMark size={44} />
        <h1 className="mt-6 font-display text-headline-md text-on-surface">You&apos;re signed in</h1>
        <p className="mt-2 font-body text-body-lg text-on-surface-variant">{user.email}</p>
        <p className="mt-4 font-body text-body-md text-on-surface-variant">
          Your study sets sync to this account, so they follow you to any device.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="pressable rounded-lg bg-primary px-6 py-3 font-label-lg text-label-lg text-on-primary"
          >
            Go to dashboard
          </Link>
          <button
            type="button"
            onClick={() => signOut()}
            disabled={busy}
            className="pressable rounded-lg border-2 border-outline-variant px-6 py-3 font-label-lg text-label-lg text-on-surface hover:border-primary"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="flex flex-col items-center text-center">
        <LuminaMark size={44} />
        <h1 className="mt-5 font-display text-headline-md text-on-surface">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-2 font-body text-body-md text-on-surface-variant">
          {mode === 'signin'
            ? 'Sign in to sync your study sets across devices.'
            : 'Your study sets will sync across every device you use.'}
        </p>
      </div>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-label-sm text-label-sm text-on-surface-variant">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@university.edu"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-label-sm text-label-sm text-on-surface-variant">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
            className={inputClass}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-error-container px-3 py-2 font-body text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="pressable mt-2 rounded-lg bg-primary px-6 py-3 font-label-lg text-label-lg text-on-primary transition-colors hover:bg-surface-tint"
        >
          {busy ? 'Just a moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center font-body text-body-md text-on-surface-variant">
        {mode === 'signin' ? "Don't have an account?" : 'Already have one?'}{' '}
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
          className="font-semibold text-primary hover:underline"
        >
          {mode === 'signin' ? 'Create one' : 'Sign in'}
        </button>
      </p>

      <p className="mt-8 text-center font-label-sm text-label-sm text-on-surface-variant">
        An account keeps your study sets, schedule and progress in sync across every device you use.
      </p>
    </div>
  );
}
