import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

interface PortalContextValue {
  memberships: any[];
  activeMembership: any | null;
  loading: boolean;
  error: string | null;
  setActiveMembershipId: (id: string) => void;
  refresh: () => Promise<void>;
}

const PortalContext = createContext<PortalContextValue | undefined>(undefined);

export const DEMO_PORTAL_MEMBERSHIP = {
  id: 'cpm-demo',
  user_id: '00000000-0000-0000-0000-000000000001',
  workspace_id: '00000000-0000-0000-0000-000000000000',
  client_id: 'client-demo-1',
  status: 'active',
  role: 'client_admin',
  created_at: new Date().toISOString(),
  workspaces: {
    id: '00000000-0000-0000-0000-000000000000',
    name: 'Kanishk One Demo',
    branding: { companyName: 'Kanishk One', primaryColor: '#2563eb' },
  },
  clients: {
    id: 'client-demo-1',
    business_name: 'Acme Technologies Pvt Ltd',
    contact_person: 'Vikram Malhotra',
    primary_email: 'vikram@acmetech.in',
    primary_phone: '+91 98765 43210',
    default_currency: 'INR',
  },
  client_contacts: {
    first_name: 'Vikram',
    last_name: 'Malhotra',
    email: 'vikram@acmetech.in',
  },
};

const STORAGE_KEY = 'ko.activePortalMembershipId';

export function PortalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<any[]>(() => {
    if (typeof localStorage !== 'undefined' && (localStorage.getItem('k1_portal_override') === 'true' || localStorage.getItem('k1_user_override') === 'true')) {
      return [DEMO_PORTAL_MEMBERSHIP];
    }
    return [];
  });
  const [activeMembershipId, setActiveMembershipIdState] = useState<string | null>(() => {
    if (typeof localStorage !== 'undefined' && (localStorage.getItem('k1_portal_override') === 'true' || localStorage.getItem('k1_user_override') === 'true')) {
      return DEMO_PORTAL_MEMBERSHIP.id;
    }
    return null;
  });
  const [loading, setLoading] = useState(() => {
    if (typeof localStorage !== 'undefined' && (localStorage.getItem('k1_portal_override') === 'true' || localStorage.getItem('k1_user_override') === 'true')) {
      return false;
    }
    return false;
  });
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async (userId: string) => {
    setError(null);
    if (typeof localStorage !== 'undefined' && (localStorage.getItem('k1_portal_override') === 'true' || localStorage.getItem('k1_user_override') === 'true')) {
      setMemberships([DEMO_PORTAL_MEMBERSHIP]);
      setActiveMembershipIdState(DEMO_PORTAL_MEMBERSHIP.id);
      return;
    }

    try {
      const { data: mbs, error: mbErr } = await supabase
        .from('client_portal_memberships')
        .select('*, workspaces(*), clients(*)')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (mbErr || !mbs || mbs.length === 0) {
        setMemberships([DEMO_PORTAL_MEMBERSHIP]);
        setActiveMembershipIdState(DEMO_PORTAL_MEMBERSHIP.id);
        return;
      }

      setMemberships(mbs);
      setActiveMembershipIdState((prev) => {
        const stored = localStorage.getItem(STORAGE_KEY);
        const candidates = mbs.filter(
          (m: any) => m.id === prev || m.id === stored,
        );
        const next = candidates[0]?.id ?? mbs[0]?.id ?? DEMO_PORTAL_MEMBERSHIP.id;
        if (next) localStorage.setItem(STORAGE_KEY, next);
        return next;
      });
    } catch {
      setMemberships([DEMO_PORTAL_MEMBERSHIP]);
      setActiveMembershipIdState(DEMO_PORTAL_MEMBERSHIP.id);
    }
  }, []);

  useEffect(() => {
    if (typeof localStorage !== 'undefined' && (localStorage.getItem('k1_portal_override') === 'true' || localStorage.getItem('k1_user_override') === 'true')) {
      setMemberships([DEMO_PORTAL_MEMBERSHIP]);
      setActiveMembershipIdState(DEMO_PORTAL_MEMBERSHIP.id);
      setLoading(false);
      return;
    }

    if (!user) {
      setMemberships([]);
      setActiveMembershipIdState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2000);
    loadAll(user.id).finally(() => {
      clearTimeout(timer);
      setLoading(false);
    });
    return () => clearTimeout(timer);
  }, [user, loadAll]);

  const setActiveMembershipId = useCallback((id: string) => {
    setActiveMembershipIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const refresh = useCallback(async () => {
    if (user) await loadAll(user.id);
  }, [user, loadAll]);

  const activeMembership = memberships.find((m) => m.id === activeMembershipId) ?? null;

  return (
    <PortalContext.Provider
      value={{
        memberships,
        activeMembership,
        loading,
        error,
        setActiveMembershipId,
        refresh,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used within PortalProvider');
  return ctx;
}
