import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError, fetchCaptcha, requestPasswordReset, type Captcha } from '../lib/api';
import { LuminaMark } from '../components/LuminaMark';
import { SyncIcon } from '../components/icons';

/**
 * Combined sign-in / sign-up. One form, one toggle — asking a student to find
 * a separate "register" page is friction with nothing to show for it.
 *
 * Sign-up carries a real CAPTCHA: the server draws a distorted code, and the
 * user has to type what they see. The answer is only ever on the server, so a
 * script can't read it out of the page — it has to actually solve the image.
 * A hidden honeypot field sits behind it as a second, free signal.
 */
export default function SignIn() {
  const { user, signIn, signUp, signOut, busy } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once a reset link has been requested — swaps the form for a receipt. */
  const [resetSent, setResetSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  // RequireAuth stashes the page it intercepted so sign-in can land there.
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';

  /** Switch form, clearing anything left over from the previous one. */
  const switchTo = (next: 'signin' | 'signup' | 'forgot') => {
    setMode(next);
    setError(null);
    setResetSent(null);
  };

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaInput('');
    try {
      setCaptcha(await fetchCaptcha());
    } catch {
      setCaptcha(null);
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  // Fetch a challenge when the sign-up form is shown, and none while signing in.
  useEffect(() => {
    if (isSignup) void loadCaptcha();
    else setCaptcha(null);
  }, [isSignup, loadCaptcha]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isForgot) {
      setSending(true);
      try {
        // The same confirmation shows whether or not the address has an
        // account — the server won't say, and neither should the UI.
        setResetSent(await requestPasswordReset(email));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      } finally {
        setSending(false);
      }
      return;
    }

    if (isSignup && (!captcha || captchaInput.trim().length === 0)) {
      setError('Please type the characters from the image.');
      return;
    }

    try {
      if (isSignup) {
        await signUp({
          name,
          email,
          password,
          website: honeypot,
          captchaToken: captcha!.token,
          captcha: captchaInput,
        });
      } else {
        await signIn(email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setError(apiErr ? apiErr.message : 'Something went wrong. Please try again.');
      // A consumed or wrong CAPTCHA is dead — always hand back a fresh image.
      if (isSignup) void loadCaptcha();
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
            {isForgot ? 'Reset your password' : isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2 font-body text-body-md text-on-surface-variant">
            {isForgot
              ? 'Enter your email and we’ll send you a link to choose a new password.'
              : isSignup
                ? 'Your study sets will sync across every device you use.'
                : 'Sign in to sync your study sets across devices.'}
          </p>
        </div>

        {/* Reset requested: a receipt, not a form. Worded so it says nothing
            about whether that address actually has an account. */}
        {isForgot && resetSent ? (
          <div className="mt-8 flex flex-col gap-4 text-center">
            <p className="rise-in rounded-lg bg-surface-container px-4 py-4 font-body text-body-md text-on-surface">
              {resetSent}
            </p>
            <p className="font-body text-body-sm text-on-surface-variant">
              The link works once and expires in 30 minutes. Check your spam folder if it hasn’t
              arrived in a minute or two.
            </p>
            <button
              type="button"
              onClick={() => switchTo('signin')}
              className="pressable mt-2 rounded-lg bg-primary px-6 py-3 font-label-lg text-label-lg text-on-primary"
            >
              Back to sign in
            </button>
          </div>
        ) : (
        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          {/* Honeypot: off-screen and hidden from assistive tech. */}
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
              placeholder="you@gmail.com"
              className={inputClass}
            />
          </label>

          {!isForgot && (
            <label className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Password</span>
                {!isSignup && (
                  <button
                    type="button"
                    onClick={() => switchTo('forgot')}
                    className="font-label-sm text-label-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
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
          )}

          {/* Real CAPTCHA — solve the distorted image to prove you're human. */}
          {isSignup && (
            <div className="flex flex-col gap-1.5">
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Type the characters below
              </span>
              <div className="flex items-stretch gap-2">
                <div className="flex h-[52px] flex-1 items-center justify-center overflow-hidden rounded-lg border border-surface-variant bg-[#f2f0f7]">
                  {captchaLoading ? (
                    <SyncIcon className="h-5 w-5 animate-spin text-on-surface-variant/60" />
                  ) : captcha ? (
                    // Trusted: this SVG is generated by our own server, not user input.
                    <div
                      aria-label="Verification image"
                      role="img"
                      className="[&>svg]:h-[50px] [&>svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: captcha.svg }}
                    />
                  ) : (
                    <span className="px-2 font-label-sm text-label-sm text-error">
                      Couldn&apos;t load the image
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void loadCaptcha()}
                  aria-label="Get a new image"
                  title="New image"
                  className="pressable grid w-12 shrink-0 place-items-center rounded-lg border border-surface-variant text-on-surface-variant hover:border-primary hover:text-primary"
                >
                  <SyncIcon className="h-5 w-5" />
                </button>
              </div>
              <input
                type="text"
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                required
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={10}
                placeholder="Enter the code"
                className={`${inputClass} tracking-[0.3em]`}
              />
            </div>
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
            disabled={busy || sending}
            className="pressable mt-2 rounded-lg bg-primary px-6 py-3 font-label-lg text-label-lg text-on-primary transition-colors hover:bg-surface-tint disabled:opacity-70"
          >
            {busy || sending
              ? 'Just a moment…'
              : isForgot
                ? 'Send reset link'
                : isSignup
                  ? 'Create account'
                  : 'Sign in'}
          </button>
        </form>
        )}

        <p className="mt-6 text-center font-body text-body-md text-on-surface-variant">
          {isForgot ? (
            <>
              Remembered it?{' '}
              <button
                type="button"
                onClick={() => switchTo('signin')}
                className="font-semibold text-primary hover:underline"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              {isSignup ? 'Already have one?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => switchTo(isSignup ? 'signin' : 'signup')}
                className="font-semibold text-primary hover:underline"
              >
                {isSignup ? 'Sign in' : 'Create one'}
              </button>
            </>
          )}
        </p>

        <p className="mt-8 text-center font-label-sm text-label-sm text-on-surface-variant">
          Use any email you like — a personal Gmail is perfectly fine. Your account keeps your study
          sets and progress in sync across every device.
        </p>
      </div>
    </div>
  );
}
