import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from './supabase';
import { useWorkspace } from './workspace';

export interface PlanFeature {
  feature_key: string;
  is_enabled: boolean;
  limit_amount: number | null;
  warning_threshold: number | null;
}

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: string;
  limit?: number | null;
  usage?: number;
}

interface EntitlementContextValue {
  features: Record<string, PlanFeature>;
  loading: boolean;
  checkEntitlement: (featureKey: string, amount?: number) => Promise<EntitlementCheckResult>;
  canAccess: (featureKey: string) => boolean;
}

const EntitlementContext = createContext<EntitlementContextValue | undefined>(undefined);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { activeWorkspace } = useWorkspace();
  const [features, setFeatures] = useState<Record<string, PlanFeature>>({});
  const [loading, setLoading] = useState(true);

  const loadEntitlements = useCallback(async (workspaceId: string) => {
    setLoading(true);
    
    // 1. Get active subscription
    const { data: subData, error: subError } = await supabase
      .from('workspace_subscriptions')
      .select('plan_version_id')
      .eq('workspace_id', workspaceId)
      .in('status', ['trial', 'active', 'past_due'])
      .maybeSingle();

    if (subError || !subData) {
      setFeatures({});
      setLoading(false);
      return;
    }

    // 2. Get features for that plan version
    const { data: featureData, error: featureError } = await supabase
      .from('saas_plan_features')
      .select('*')
      .eq('plan_version_id', subData.plan_version_id);

    if (!featureError && featureData) {
      const featureMap: Record<string, PlanFeature> = {};
      for (const f of featureData) {
        featureMap[f.feature_key] = f;
      }
      setFeatures(featureMap);
    } else {
      setFeatures({});
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeWorkspace) {
      loadEntitlements(activeWorkspace.id);
    } else {
      setFeatures({});
      setLoading(false);
    }
  }, [activeWorkspace, loadEntitlements]);

  // Server-side limit check via RPC
  const checkEntitlement = useCallback(async (featureKey: string, amount = 1): Promise<EntitlementCheckResult> => {
    if (!activeWorkspace) return { allowed: false, reason: 'no_workspace' };

    const { data, error } = await supabase.rpc('check_workspace_entitlement', {
      p_workspace_id: activeWorkspace.id,
      p_feature_key: featureKey,
      p_amount: amount
    });

    if (error) {
      console.error('Entitlement check error:', error);
      return { allowed: false, reason: 'error' };
    }

    return data as EntitlementCheckResult;
  }, [activeWorkspace]);

  // Quick client-side check (doesn't check dynamic usage against limits, just if it's enabled on plan)
  const canAccess = useCallback((featureKey: string): boolean => {
    const feat = features[featureKey];
    if (!feat) return false;
    return feat.is_enabled;
  }, [features]);

  return (
    <EntitlementContext.Provider value={{ features, loading, checkEntitlement, canAccess }}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlements() {
  const context = useContext(EntitlementContext);
  if (context === undefined) {
    throw new Error('useEntitlements must be used within an EntitlementProvider');
  }
  return context;
}
