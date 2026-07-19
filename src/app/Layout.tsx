import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar, TopBar } from './Nav';

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-variant border-t-primary" />
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen flex-col bg-background text-on-background">
      <Sidebar />
      <TopBar />
      <div className="flex flex-1 flex-col md:ml-[280px]">
        <main className="flex-1 pt-16">
          <Suspense fallback={<PageFallback />}>
            {/* Keying by pathname replays the page-enter animation on every route. */}
            <div key={location.pathname} className="page-enter">
              <Outlet />
            </div>
          </Suspense>
        </main>
        <footer className="mt-auto flex flex-col items-center gap-2 border-t border-outline-variant/30 px-gutter py-stack-md text-center sm:flex-row sm:justify-between">
          <span className="font-label-lg text-label-lg font-bold text-primary">Lumina</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            Designed &amp; built by Mutasim Abbas
          </span>
        </footer>
      </div>
    </div>
  );
}
