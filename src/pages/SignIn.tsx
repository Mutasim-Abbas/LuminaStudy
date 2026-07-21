import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';
import { LuminaMark } from '../components/LuminaMark';
import { CheckCircleIcon } from '../components/icons';

/**
 * Combined sign-in / sign-up. One form, one toggle — asking a student to find
 * a separate "register" page is friction with nothing to show for it.
 *
 * Bot resistance without a third-party CAPTCHA (see the server for the matching
 * checks): a hidden honeypot field that only a script fills, a minimum time on
 * the form, and a "confirm you're not a robot" checkbox required to submit a
 * sign-up. None is bulletproof alone; together with the server's per-account
 * lockout they stop the bulk automated sign-ups a small app actually sees.
 */
export default function SignIn() {
  const { user, signIn, signUp, signOut, busy } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [notRobot, setNotRobot] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  // RequireAuth stashes the page it intercepted so sign-in can land there.
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  // When the form was shown — used to reject submissions that arrive impossibly
  // fast. A ref, not state, so it never triggers a re-render.
  const shownAt = useRef(Date.now());
  useEffect(() => {
    shownAt.current = Date.now();
  }, [mode]);

  const isSignup = mode === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSignup && !notRobot) {
      setError('Please confirm you are not a robot.');
      return;
    }

    try {
      if (isSignup) {
        await signUp({
          name,
          email,
          password,
          website: honeypot,
          elapsedMs: Date.now() - shownAt.current,
        });
      } else {
        await signIn(email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const inputClass =
    'w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2.5 font-body text-body-md text-on-surface transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

  // Already signed in — offer the way out rather than a pointless second form.
  if (user) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16 text-center">
        <div className="page-enter">
          <LuminaMark size={44} />
          <h1 className="mt-6 font-display text-headline-md text-on-surface">You&apos;re signed in</h1>
          <p className="mt-2 font-body text-body-lg text-on-surface-variant">
            {user.name ? `${user.name} · ${user.email}` : user.email}
          </p>
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
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      {/* key=mode replays the entrance animation each time the form flips */}
      <div key={mode} className="page-enter">
        <div className="flex flex-col items-center text-center">
          <LuminaMark size={44} />
          <h1 className="mt-5 font-display text-headline-md text-on-surface">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2 font-body text-body-md text-on-surface-variant">
            {isSignup
              ? 'Your study sets will sync across every device you use.'
              : 'Sign in to sync your study sets across devices.'}
          </p>
        </div>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          {/* Honeypot: off-screen and hidden from assistive tech; a real user
              never sees it, so anything typed here came from a script. */}
          <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
            <label>
              Leave this field empty
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </label>
          </div>

          {isSignup && (
            <label className="flex flex-col gap-1.5">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                maxLength={80}
                placeholder="What should we call you?"
                className={inputClass}
              />
            </label>
          )}

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
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder={isSignup ? 'At least 8 characters' : ''}
              className={inputClass}
            />
          </label>

          {/* "Not a robot" — a genuine interaction, checked on the server too. */}
          {isSignup && (
            <button
              type="button"
              onClick={() => setNotRobot((v) => !v)}
              aria-pressed={notRobot}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                notRobot
                  ? 'border-secondary bg-secondary-container/30'
                  : 'border-surface-variant hover:border-primary'
              }`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${
                  notRobot ? 'border-secondary bg-secondary text-on-secondary' : 'border-outline-variant'
                }`}
              >
                {notRobot && <CheckCircleIcon className="h-4 w-4" />}
              </span>
              <span className="font-body text-body-md text-on-surface">I&apos;m not a robot</span>
            </button>
          )}

          {error && (
            <p
              role="alert"
              className="rise-in rounded-lg bg-error-container px-3 py-2 font-body text-body-sm text-on-error-container"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="pressable mt-2 rounded-lg bg-primary px-6 py-3 font-label-lg text-label-lg text-on-primary transition-colors hover:bg-surface-tint disabled:opacity-70"
          >
            {busy ? 'Just a moment…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center font-body text-body-md text-on-surface-variant">
          {isSignup ? 'Already have one?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isSignup ? 'signin' : 'signup');
              setError(null);
              setNotRobot(false);
            }}
            className="font-semibold text-primary hover:underline"
          >
            {isSignup ? 'Sign in' : 'Create one'}
          </button>
        </p>

        <p className="mt-8 text-center font-label-sm text-label-sm text-on-surface-variant">
          An account keeps your study sets, schedule and progress in sync across every device you use.
        </p>
      </div>
    </div>
  );
}
