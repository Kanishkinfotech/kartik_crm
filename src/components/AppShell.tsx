import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard, Users, UserPlus, Package, FileText, FolderKanban, ListTodo,
  Receipt, CreditCard, ClipboardList, MessagesSquare, Workflow, BarChart3,
  UsersRound, Settings, LogOut, Menu, X, ChevronDown, Building2, KanbanSquare, Bot, Sliders, ExternalLink, BookOpen,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { can, type Permission } from '@/lib/permissions';
import { classNames, initials } from '@/lib/format';
import type { Role } from '@/lib/types';
import { GlobalAIAssistant } from '@/components/GlobalAIAssistant';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { isDemoMode } from '@/lib/dbError';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  permission: Permission;
  enabled: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Automation Engine',
    items: [
      { label: 'Automations', path: '/automations', icon: <Workflow className="h-[18px] w-[18px]" />, permission: 'automation.view', enabled: true },
      { label: 'Settings', path: '/settings/automations', icon: <Settings className="h-[18px] w-[18px]" />, permission: 'settings.view', enabled: true },
    ],
  },
];

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  accounts: 'Accounts',
  sales: 'Sales',
  project_manager: 'Project Manager',
  team_member: 'Team Member',
  viewer: 'Viewer',
};

export function AppShell({ children }: { children: ReactNode }) {
  const { path, navigate } = useRouter();
  const { user, signOut } = useAuth();
  const { workspaces, activeWorkspace, role, setActiveWorkspaceId } = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const handleNav = (item: NavItem) => {
    if (!item.enabled) return;
    navigate(item.path);
    setMobileOpen(false);
  };

  const isActive = (itemPath: string) =>
    itemPath === '/dashboard' ? path === '/dashboard' : path === itemPath || path.startsWith(`${itemPath}/`);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside
        className={classNames(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-hidden transform border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">K1</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">Kanishk One</div>
            <div className="text-[11px] text-slate-400">Smart Business Suite</div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-100 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section, idx) => {
            const items = section.items.filter((n) => can(role, n.permission));
            if (items.length === 0) return null;
            return (
              <div key={idx} className="space-y-1">
                {section.title && (
                  <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {section.title}
                  </div>
                )}
                {items.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => handleNav(item)}
                    disabled={!item.enabled}
                    className={classNames(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive(item.path) ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      !item.enabled && 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-slate-600',
                    )}
                    title={!item.enabled ? 'Available in a later phase' : undefined}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {!item.enabled && <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">Soon</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {initials(user?.user_metadata?.full_name ?? user?.email)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-slate-700">{user?.user_metadata?.full_name ?? 'User'}</div>
              <div className="truncate text-[11px] text-slate-400">{role ? ROLE_LABELS[role] : ''}</div>
            </div>
            <button onClick={signOut} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>

          {/* Workspace switcher */}
          <div className="relative">
            <button
              onClick={() => setWsMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Building2 className="h-4 w-4 text-slate-400" />
              <span className="max-w-[160px] truncate">{activeWorkspace?.name ?? 'No workspace'}</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            {wsMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setWsMenuOpen(false)} />
                <div className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Workspaces</div>
                  {workspaces.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => { setActiveWorkspaceId(w.id); setWsMenuOpen(false); }}
                      className={classNames(
                        'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50',
                        w.id === activeWorkspace?.id ? 'text-blue-700' : 'text-slate-700',
                      )}
                    >
                      <Building2 className="h-4 w-4 text-slate-400" />
                      <span className="truncate">{w.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
            >
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">Ask AI</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <AnnouncementBanner />
            {isDemoMode() && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span>
                  <strong>Demo mode.</strong> You are not signed in to a real account, so nothing you create here can be saved to the database.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem('k1_user_override');
                      localStorage.removeItem('ko.activeWorkspaceId');
                    } catch { /* ignore */ }
                    window.location.href = '/';
                    window.location.reload();
                  }}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  Exit demo &amp; sign in
                </button>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>

      <GlobalAIAssistant isOpen={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}

