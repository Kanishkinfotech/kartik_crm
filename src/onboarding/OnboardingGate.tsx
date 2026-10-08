import { CreateWorkspacePage } from './CreateWorkspacePage';
import { OnboardingWizard } from './OnboardingWizard';
import { useWorkspace } from '@/lib/workspace';
import { LoadingState } from '@/components/ui';

export function OnboardingGate({ path }: { path: string }) {
  const { activeWorkspace, loading, workspaces } = useWorkspace();

  if (loading) return <LoadingState label="Loading..." />;

  // If they have no workspace, they must create one
  if (workspaces.length === 0 || path === '/create-workspace') {
    return <CreateWorkspacePage />;
  }

  // If they have a workspace but are on the onboarding path, show the wizard
  if (path === '/onboarding') {
    return <OnboardingWizard />;
  }

  return null;
}
