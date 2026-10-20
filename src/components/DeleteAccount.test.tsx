import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../lib/api';
import { DeleteAccount } from './DeleteAccount';

afterEach(cleanup);

function setup(props: { hasPassword: boolean; googleConfirmed?: boolean; onDelete?: () => Promise<void> }) {
  const onDelete = vi.fn(props.onDelete ?? (async () => {}));
  render(
    <DeleteAccount
      hasPassword={props.hasPassword}
      googleConfirmed={props.googleConfirmed ?? false}
      busy={false}
      onDelete={onDelete}
    />,
  );
  return { onDelete, user: userEvent.setup() };
}

describe('DeleteAccount', () => {
  it('asks for the password before deleting a password account', async () => {
    const { onDelete, user } = setup({ hasPassword: true });
    expect(screen.queryByLabelText(/password/i)).toBeNull(); // hidden until asked
    await user.click(screen.getByRole('button', { name: 'Delete my account…' }));
    await user.type(screen.getByLabelText('Enter your password to confirm'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(onDelete).toHaveBeenCalledWith('correct horse');
  });

  it('sends a Google-only account to confirm with Google instead', async () => {
    const { onDelete, user } = setup({ hasPassword: false });
    await user.click(screen.getByRole('button', { name: 'Delete my account…' }));
    expect(screen.getByRole('link', { name: 'Continue with Google' }).getAttribute('href')).toBe(
      '/api/auth/google?confirm=1',
    );
    expect(screen.queryByRole('button', { name: 'Delete permanently' })).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('opens straight to the final step after a Google confirmation', async () => {
    const { onDelete, user } = setup({ hasPassword: false, googleConfirmed: true });
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(onDelete).toHaveBeenCalledWith(undefined);
  });

  it('shows why the server refused', async () => {
    const { user } = setup({
      hasPassword: true,
      onDelete: async () => {
        throw new ApiError('That password is incorrect.', 403);
      },
    });
    await user.click(screen.getByRole('button', { name: 'Delete my account…' }));
    await user.type(screen.getByLabelText('Enter your password to confirm'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect((await screen.findByRole('alert')).textContent).toBe('That password is incorrect.');
  });
});
