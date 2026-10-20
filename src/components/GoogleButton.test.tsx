import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GoogleButton } from './GoogleButton';

// Unmount between tests, so each one queries only its own button.
afterEach(cleanup);

describe('GoogleButton', () => {
  it('is a link to the server route, labelled the way Google allows', () => {
    render(<GoogleButton href="/api/auth/google" />);
    const link = screen.getByRole('link', { name: 'Continue with Google' });
    expect(link.getAttribute('href')).toBe('/api/auth/google');
  });

  it('keeps the standard-colour G, hidden from screen readers', () => {
    const { container } = render(<GoogleButton href="/api/auth/google" label="Sign in with Google" />);
    const fills = [...container.querySelectorAll('svg path')].map((p) => p.getAttribute('fill'));
    expect(fills).toEqual(['#4285F4', '#34A853', '#FBBC04', '#E94235']);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('link').textContent).toBe('Sign in with Google');
  });
});
