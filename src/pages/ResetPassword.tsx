import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, resetPassword } from '../lib/api';
import { LuminaMark } from '../components/LuminaMark';

/**
 * Where an emailed reset link lands: `#/reset?token=…`.
 *
 * The token is read from the URL and never shown or stored — it goes straight
 * back to the server with the new password. A successful reset also signs the
 * user in, so this hands off to the dashboard rather than the login form.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const inputClass =
    'w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2.5 font-body text-body-md text-on-surface transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Checked here as well as by the server so the user finds out before the
    // round trip, not after.
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Those passwords don’t match.');
      return;
    }

    setBusy(true);
    try {
      await resetPassword(token, password);
      // Reload rather than navigate: the auth context reads the session once on
      // boot, so a plain route change would leave it thinking we're signed out.
      window.location.hash = '#/';
      window.location.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  // Someone opened /reset directly, or the link got mangled in the mail client.
  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16 text-center">
        <div className="page-enter">
          <LuminaMark size={44} />
          <h1 className="mt-6 font-display text-headline-md text-on-surface">Link incomplete</h1>
          <p className="mt-3 font-body text-body-md text-on-surface-variant">
            This page needs the reset link from your email. Try opening that link again, or ask for
            a new one.
          </p>
          <Link
            to="/account"
            className="pressable mt-8 inline-block rounded-lg bg-primary px-6 py-3 font-label-lg text-label-lg text-on-primary"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="page-enter">
        <div className="flex flex-col items-center text-center">
          <LuminaMark size={44} />
          <h1 className="mt-5 font-display text-headline-md text-on-surface">Choose a new password</h1>
          <p className="mt-2 font-body text-body-md text-on-surface-variant">
            Pick something you haven’t used here before.
          </p>
        </div>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-label-sm text-label-sm text-on-surface-variant">New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
              placeholder="At least 8 characters"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              Confirm new password
            </span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Type it again"
              className={inputClass}
            />
          </label>

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
            {busy ? 'Saving…' : 'Set new password'}
          </button>
        </form>

        <p className="mt-6 text-center font-body text-body-md text-on-surface-variant">
          Changed your mind?{' '}
          <button
            type="button"
            onClick={() => navigate('/account')}
            className="font-semibold text-primary hover:underline"
          >
            Back to sign in
          </button>
        </p>
      </div>
    </div>
  );
}
