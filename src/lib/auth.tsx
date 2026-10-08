import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const DEMO_USER: User = {
  id: '00000000-0000-0000-0000-000000000001',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Demo Workspace User' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  email: 'user@kanishkone.com',
  role: 'authenticated',
  updated_at: new Date().toISOString(),
} as unknown as User;

export const DEMO_SESSION: Session = {
  access_token: 'demo-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'demo-refresh-token',
  user: DEMO_USER,
};

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  loginAsDemo: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true') {
      return DEMO_SESSION;
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // If demo override is set, resolve loading immediately with demo session
    if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true') {
      setSession(DEMO_SESSION);
      setLoading(false);
      return;
    }

    // Safety timeout: ensure loading state resolves within 2 seconds even if Supabase is unreachable/blocked
    const timeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 2000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        if (data?.session) {
          // Real session found — clear any stale demo overrides
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('k1_user_override');
            // Also clear demo workspace ID if it's not a real UUID
            const storedWs = localStorage.getItem('ko.activeWorkspaceId');
            if (storedWs && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storedWs)) {
              localStorage.removeItem('ko.activeWorkspaceId');
            }
          }
          setSession(data.session);
        } else if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true') {
          setSession(DEMO_SESSION);
        } else {
          setSession(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Supabase auth getSession failed or timed out:', err);
        if (mounted) {
          if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true') {
            setSession(DEMO_SESSION);
          }
          setLoading(false);
        }
      })
      .finally(() => {
        clearTimeout(timeout);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      if (newSession) {
        setSession(newSession);
      } else if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true') {
        setSession(DEMO_SESSION);
      } else {
        setSession(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  const loginAsDemo = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('k1_user_override', 'true');
    }
    setSession(DEMO_SESSION);
    setLoading(false);
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { error: error.message };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Authentication service unreachable' };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) return { error: error.message };
      if (data.user && !data.session) {
        return { error: 'Check your email for a confirmation link to complete sign-up.' };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Authentication service unreachable' };
    }
  };

  const signOut = async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('k1_user_override');
      localStorage.removeItem('k1_admin_override');
    }
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors
    }
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut, loginAsDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
