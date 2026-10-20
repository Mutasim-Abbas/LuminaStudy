import { useState, type FormEvent } from 'react';
import { ApiError, GOOGLE_CONFIRM_URL } from '../lib/api';
import { GoogleButton } from './GoogleButton';

/**
 * Deleting the account, behind a deliberate second step. The server refuses
 * unless the person proves again that the account is theirs: the password, or
 * — for an account made through Google, which has none — confirming with
 * Google in the last few minutes.
 */
export function DeleteAccount({
  hasPassword,
  googleConfirmed,
  busy,
  onDelete,
}: {
  hasPassword: boolean;
  /** Back from a Google confirmation just now (?google=confirmed). */
  googleConfirmed: boolean;
  busy: boolean;
  onDelete: (password?: string) => Promise<void>;
}) {
  // A fresh Google confirmation means the person came here to delete: open
  // the confirmation straight away.
  const [open, setOpen] = useState(googleConfirmed);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onDelete(hasPassword ? password : undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <section className="mt-10 border-t border-surface-variant pt-6 text-left">
      <h2 className="font-label-lg text-label-lg text-on-surface">Delete account</h2>
      <p className="mt-1 font-body text-body-sm text-on-surface-variant">
        Permanently deletes your account and every study set in it. This can&apos;t be undone.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pressable mt-4 rounded-lg border-2 border-error px-4 py-2 font-label-lg text-label-lg text-error"
        >
          Delete my account…
        </button>
      ) : hasPassword || googleConfirmed ? (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          {hasPassword && (
            <label className="flex flex-col gap-1.5">
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Enter your password to confirm
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2.5 font-body text-body-md text-on-surface focus:border-error focus:outline-none focus:ring-2 focus:ring-error/20"
              />
            </label>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-error-container px-3 py-2 font-body text-body-sm text-on-error-container"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy}
              className="pressable rounded-lg bg-error px-4 py-2 font-label-lg text-label-lg text-on-error disabled:opacity-70"
            >
              {busy ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPassword('');
                setError(null);
              }}
              className="pressable rounded-lg px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <p className="font-body text-body-sm text-on-surface-variant">
            Your account signs in with Google, so confirm it&apos;s you with Google first.
          </p>
          <GoogleButton href={GOOGLE_CONFIRM_URL} />
        </div>
      )}
    </section>
  );
}
