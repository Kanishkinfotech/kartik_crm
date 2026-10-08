import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { Workspace, WorkspaceMember, Role } from './types';

interface WorkspaceContextValue {
  workspaces: Workspace[];
  memberships: WorkspaceMember[];
  activeWorkspace: Workspace | null;
  activeMembership: WorkspaceMember | null;
  role: Role | null;
  loading: boolean;
  error: string | null;
  setActiveWorkspaceId: (id: string) => void;
  refresh: () => Promise<void>;
  bootstrapWorkspace: (
    name: string,
    industry?: string,
    country?: string,
    state?: string,
    timezone?: string,
    teamSize?: string,
    currency?: string,
    idempotencyKey?: string
  ) => Promise<{ error: string | null; workspace: Workspace | null }>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

// Keep DEMO_WORKSPACE for test environments but never leak its ID into production UUID fields.
export const DEMO_WORKSPACE: Workspace = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Kanishk One Workspace',
  slug: 'kanishk-one',
  branding: {
    companyName: 'Kanishk One Demo',
    primaryColor: '#2563eb',
  },
  numbering: {},
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const DEMO_MEMBERSHIP: WorkspaceMember = {
  id: 'm-demo',
  workspace_id: '00000000-0000-0000-0000-000000000000',
  user_id: '00000000-0000-0000-0000-000000000001',
  role: 'owner',
  member_status: 'active',
  joined_at: new Date().toISOString(),
};

const STORAGE_KEY = 'ko.activeWorkspaceId';

const isUUID = (str: string | null) => {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  // Initialization: Remove invalid cached workspaces automatically
  const getInitialActiveId = () => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true') {
      return DEMO_WORKSPACE.id;
    }
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored && !isUUID(stored)) {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored;
  };

  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true') {
      return [DEMO_WORKSPACE];
    }
    return [];
  });
  const [memberships, setMemberships] = useState<WorkspaceMember[]>(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true') {
      return [DEMO_MEMBERSHIP];
    }
    return [];
  });
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(getInitialActiveId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async (userId: string) => {
    setError(null);

    if (userId === '00000000-0000-0000-0000-000000000001' || userId === 'demo-user-1' || (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true')) {
      setWorkspaces([DEMO_WORKSPACE]);
      setMemberships([DEMO_MEMBERSHIP]);
      setActiveWorkspaceIdState(DEMO_WORKSPACE.id);
      return;
    }

    try {
      const { data: mbs, error: mbErr } = await supabase
        .from('workspace_members')
        .select('id, workspace_id, user_id, role, member_status, joined_at')
        .eq('user_id', userId)
        .eq('member_status', 'active');

      if (mbErr) {
        setError(mbErr.message);
        setWorkspaces([]);
        setMemberships([]);
        setActiveWorkspaceIdState(null);
        return;
      }

      const activeMbs = (mbs ?? []) as WorkspaceMember[];
      if (activeMbs.length === 0) {
        setWorkspaces([]);
        setMemberships([]);
        setActiveWorkspaceIdState(null);
        return;
      }

      setMemberships(activeMbs);

      const wsIds = activeMbs.map((m) => m.workspace_id);
      const { data: wsRows, error: wsErr } = await supabase
        .from('workspaces')
        .select('*')
        .in('id', wsIds)
        .eq('status', 'active');

      if (wsErr || !wsRows || wsRows.length === 0) {
        if (wsErr) setError(wsErr.message);
        setWorkspaces([]);
        setActiveWorkspaceIdState(null);
        return;
      }

      const wsList = wsRows as Workspace[];
      setWorkspaces(wsList);

      setActiveWorkspaceIdState((prev) => {
        let stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (stored && !isUUID(stored)) {
          if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
          stored = null;
        }

        const candidates = wsList.filter(
          (w) => w.id === prev || w.id === stored,
        );
        const next = candidates[0]?.id ?? wsList[0]?.id ?? null;
        if (next && typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, next);
        }
        return next;
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load workspace');
      setWorkspaces([]);
      setMemberships([]);
      setActiveWorkspaceIdState(null);
    }
  }, []);

  useEffect(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true') {
      setWorkspaces([DEMO_WORKSPACE]);
      setMemberships([DEMO_MEMBERSHIP]);
      setActiveWorkspaceIdState(DEMO_WORKSPACE.id);
      setLoading(false);
      return;
    }

    if (!user) {
      setWorkspaces([]);
      setMemberships([]);
      setActiveWorkspaceIdState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2500);
    loadAll(user.id).finally(() => {
      clearTimeout(timer);
      setLoading(false);
    });
    return () => clearTimeout(timer);
  }, [user, loadAll]);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    if (isUUID(id) && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (user) await loadAll(user.id);
  }, [user, loadAll]);

  const bootstrapWorkspace = useCallback(
    async (
      name: string,
      industry?: string,
      country?: string,
      state?: string,
      timezone?: string,
      teamSize?: string,
      currency?: string,
      idempotencyKey?: string
    ) => {
      if (!user) return { error: 'Not authenticated', workspace: null };
      const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'ws';
      const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;
      const resolvedIdempotencyKey = idempotencyKey || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36));

      const { data: wsRow, error: wsErr } = await supabase
        .rpc('create_self_service_workspace', { 
          p_name: name, 
          p_slug: slug,
          p_idempotency_key: resolvedIdempotencyKey,
          p_industry: industry,
          p_country: country,
          p_state: state,
          p_timezone: timezone,
          p_team_size: teamSize,
          p_currency: currency || 'INR'
        });

      if (wsErr) return { error: wsErr.message, workspace: null };
      
      // The RPC returns { success: boolean, workspace_id: string }
      let response: any = wsRow;
      if (Array.isArray(wsRow)) {
        response = wsRow[0]?.create_self_service_workspace || wsRow[0];
      }
      
      if (!response || !response.success || !response.workspace_id) {
        return { error: 'Workspace creation failed', workspace: null };
      }

      await loadAll(user.id);
      
      const newWs = workspaces.find(w => w.id === response.workspace_id) || null;
      if (newWs) {
        setActiveWorkspaceIdState(newWs.id);
        localStorage.setItem(STORAGE_KEY, newWs.id);
      }
      return { error: null, workspace: newWs };
    },
    [user, loadAll, setActiveWorkspaceId],
  );

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? (workspaces.length > 0 ? workspaces[0] : null);
  const activeMembership = memberships.find((m) => m.workspace_id === (activeWorkspace?.id ?? activeWorkspaceId)) ?? (memberships.length > 0 ? memberships[0] : null);
  const role = activeMembership?.role ?? null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        memberships,
        activeWorkspace,
        activeMembership,
        role,
        loading,
        error,
        setActiveWorkspaceId,
        refresh,
        bootstrapWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
