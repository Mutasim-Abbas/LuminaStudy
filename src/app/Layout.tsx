import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Nav } from './Nav';

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen flex-col bg-page text-primary">
      <Nav />
      <main className="flex-1">
        <Suspense fallback={<PageFallback />}>
          {/* Keying by pathname replays the enter animation on every route. */}
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </Suspense>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        Lumina Study — designed &amp; built by Mutasim Abbas
      </footer>
    </div>
  );
}
