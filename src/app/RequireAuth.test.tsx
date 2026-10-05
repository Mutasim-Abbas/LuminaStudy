import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../hooks/useAuth';
import { RequireAuth } from './RequireAuth';

function renderGated() {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/account" element={<p>sign-in page</p>} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <p>dashboard</p>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RequireAuth', () => {
  it('sends a signed-out visitor to sign-in when the backend answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ user: null }), { status: 200 })),
    );
    renderGated();
    expect(await screen.findByText('sign-in page')).toBeInTheDocument();
  });

  it('lets a guest in when there is no backend (the GitHub Pages build)', async () => {
    // What Pages returns for /api/auth/me: its own HTML 404 page.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html>', { status: 404 })),
    );
    renderGated();
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
  });

  it('lets a guest in when the backend cannot be reached at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderGated();
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
  });
});
