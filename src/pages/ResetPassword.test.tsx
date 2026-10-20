import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ResetPassword from './ResetPassword';

afterEach(cleanup);

/** Shows the router's current address, the way the browser's bar would. */
function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname + location.search}</output>;
}

describe('ResetPassword', () => {
  it('takes the token out of the address but keeps the form usable', async () => {
    render(
      <MemoryRouter initialEntries={['/reset?token=secret-reset-token']}>
        <Routes>
          <Route
            path="/reset"
            element={
              <>
                <ResetPassword />
                <Address />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect((await screen.findByTestId('address')).textContent).toBe('/reset');
    // Still the "choose a new password" form, not the "link is missing" page.
    expect(screen.getAllByLabelText(/password/i).length).toBeGreaterThan(0);
  });
});
