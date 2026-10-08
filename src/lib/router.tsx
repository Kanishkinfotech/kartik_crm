import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface RouterContextValue {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextValue | undefined>(undefined);

function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, '');
  const raw = hash || (window.location.pathname !== '/' ? window.location.pathname : '/');
  const clean = raw.split('?')[0].replace(/\/$/, '') || '/';
  return clean;
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(currentPath());

  useEffect(() => {
    // If user accessed via direct pathname like /admin or /admin/dashboard, convert to hash route
    if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/portal/api') && !window.location.pathname.startsWith('/api')) {
      const pathname = window.location.pathname;
      const currentHash = window.location.hash ? window.location.hash.replace(/^#/, '') : pathname;
      window.history.replaceState(null, '', '/#' + currentHash);
      setPath(currentHash);
    }

    const onHash = () => setPath(currentPath());
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) {
      const initialPath = window.location.pathname !== '/' ? window.location.pathname : '/';
      window.location.hash = initialPath;
    }
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (to: string) => {
    const target = to.startsWith('/') ? to : `/${to}`;
    if (window.location.hash === `#${target}`) {
      setPath(target);
    } else {
      window.location.hash = target;
    }
  };

  return (
    <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>
  );
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within RouterProvider');
  return ctx;
}

export interface RouteMatch {
  params: Record<string, string>;
  remaining: string;
}

/**
 * Match a route pattern like "/clients/:id" against a path like "/clients/abc".
 * Returns null if no match.
 */
export function matchRoute(pattern: string, path: string): RouteMatch | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    const ap = pathParts[i];
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = decodeURIComponent(ap);
    } else if (pp !== ap) {
      return null;
    }
  }
  return { params, remaining: '' };
}
