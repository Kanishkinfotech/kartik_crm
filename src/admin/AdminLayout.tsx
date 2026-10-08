import { ReactNode } from 'react';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { 
  Shield, LayoutDashboard, Building2, Package, CreditCard, 
  Receipt, Activity, AlertCircle, Clock, Users, LogOut, Settings, HelpCircle,
  FileText, Zap
} from 'lucide-react';

export function AdminLayout({ children, path }: { children: ReactNode; path: string }) {
  const { navigate } = useRouter();
  const { signOut } = useAuth();

  const navItems = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Workspaces', path: '/admin/workspaces', icon: Building2 },
    { name: 'SaaS Plans', path: '/admin/plans', icon: Package },
    { name: 'Subscriptions', path: '/admin/subscriptions', icon: FileText },
    { name: 'Payments', path: '/admin/payments', icon: CreditCard },
    { name: 'Invoices', path: '/admin/invoices', icon: Receipt },
    { name: 'Usage & Limits', path: '/admin/usage', icon: Activity },
    { name: 'Support', path: '/admin/support', icon: HelpCircle },
    { name: 'Announcements', path: '/admin/announcements', icon: AlertCircle },
    { name: 'Platform Users', path: '/admin/admin-users', icon: Users },
    { name: 'Audit Logs', path: '/admin/audit', icon: Clock },
    { name: 'Settings', path: '/admin/settings', icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-admin-bg-app font-sans">
      {/* Sidebar */}
      <div className="flex w-64 flex-col bg-admin-bg-surface border-r border-admin-border-subtle">
        <div className="flex h-16 items-center gap-3 border-b border-admin-border-subtle px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-admin-primary font-bold text-white shadow-sm">
            K1
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-admin-text-primary leading-tight">Kanishk One</span>
            <span className="text-xs text-admin-text-secondary leading-tight">Platform Administration</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
          {navItems.map((item) => {
            const active = path === item.path || (path === '/admin' && item.path === '/admin/dashboard');
            return (
              <button
                key={item.name}
                onClick={() => navigate(item.path)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-admin-primary-bg text-admin-primary'
                    : 'text-admin-text-secondary hover:bg-slate-50 hover:text-admin-text-primary'
                }`}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {item.name}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-admin-border-subtle">
          <button
            onClick={() => navigate('/')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-admin-text-secondary hover:bg-slate-50 hover:text-admin-text-primary mb-2"
          >
            <Building2 className="h-4 w-4" />
            Return to App
          </button>
          <button
            onClick={() => {
              if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('k1_admin_override');
                localStorage.removeItem('k1_admin_email');
              }
              signOut();
              navigate('/admin');
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-admin-text-secondary hover:bg-slate-50 hover:text-admin-text-primary"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-admin-border-subtle bg-admin-bg-surface px-8">
          <div className="flex items-center gap-2 text-sm font-medium text-admin-text-secondary">
            {navItems.find(i => i.path === path)?.name || 'Dashboard'}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-admin-primary-bg text-admin-primary text-sm font-bold">
                A
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-admin-text-primary leading-none">Admin</p>
                <p className="text-xs text-admin-text-secondary mt-1">Platform Owner</p>
              </div>
            </div>
          </div>
        </header>
        
        {/* Page Content */}
        <div className="flex-1 overflow-auto p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
