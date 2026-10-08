import { useState } from 'react';
import { useRouter, matchRoute } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { usePortal } from '@/lib/portal';
import { LogOut, Menu, X, LayoutDashboard, FileText, Receipt, FolderKanban, CheckSquare, Settings, LifeBuoy, FileEdit } from 'lucide-react';
import { classNames } from '@/lib/format';

const NAVIGATION = [
  { name: 'Dashboard', href: '/portal/dashboard', icon: LayoutDashboard },
  { name: 'Quotations', href: '/portal/quotations', icon: FileText },
  { name: 'Invoices', href: '/portal/invoices', icon: Receipt },
  { name: 'Projects', href: '/portal/projects', icon: FolderKanban },
  { name: 'Approvals', href: '/portal/approvals', icon: CheckSquare },
  { name: 'Support', href: '/portal/support', icon: LifeBuoy },
  { name: 'Change Requests', href: '/portal/change-requests', icon: FileEdit },
  { name: 'Profile & Security', href: '/portal/settings', icon: Settings },
];

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const { path, navigate } = useRouter();
  const { signOut } = useAuth();
  const { activeMembership } = usePortal();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const clientName = activeMembership?.clients?.business_name || activeMembership?.clients?.contact_person || 'Client Portal';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-x-4 border-b border-slate-200 bg-white px-4 sm:gap-x-6 sm:px-6 lg:px-8 shadow-sm">
        <div className="flex flex-1 items-center gap-x-4">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-slate-700 lg:hidden"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
          
          <div className="font-semibold text-slate-900 text-lg hidden lg:block">
            {clientName}
          </div>
        </div>
        
        <div className="flex items-center gap-x-3 lg:gap-x-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <LayoutDashboard className="h-3.5 w-3.5 text-slate-500" />
            CRM User Panel
          </button>
          <button onClick={signOut} className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar for desktop */}
        <div className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white pt-6">
          <nav className="flex flex-1 flex-col px-4 space-y-1">
            {NAVIGATION.map((item) => {
              const isActive = matchRoute(item.href, path) || (item.href !== '/portal/dashboard' && path.startsWith(item.href));
              return (
                <button
                  key={item.name}
                  onClick={() => navigate(item.href)}
                  className={classNames(
                    isActive
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-slate-700 hover:text-indigo-600 hover:bg-slate-50',
                    'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold w-full text-left'
                  )}
                >
                  <item.icon
                    className={classNames(
                      isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-600',
                      'h-5 w-5 shrink-0'
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="relative z-50 lg:hidden">
            <div className="fixed inset-0 bg-slate-900/80" onClick={() => setMobileMenuOpen(false)} />
            <div className="fixed inset-0 flex">
              <div className="relative mr-16 flex w-full max-w-xs flex-1 flex-col bg-white pt-5 pb-4">
                <div className="absolute top-0 right-0 -mr-12 pt-2">
                  <button type="button" className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white" onClick={() => setMobileMenuOpen(false)}>
                    <X className="h-6 w-6 text-white" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex shrink-0 items-center px-4 font-semibold text-lg border-b pb-4 border-slate-100">
                  {clientName}
                </div>
                <nav className="mt-5 h-full flex-1 space-y-1 px-2 overflow-y-auto">
                  {NAVIGATION.map((item) => {
                    const isActive = matchRoute(item.href, path) || (item.href !== '/portal/dashboard' && path.startsWith(item.href));
                    return (
                      <button
                        key={item.name}
                        onClick={() => { navigate(item.href); setMobileMenuOpen(false); }}
                        className={classNames(
                          isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-700 hover:bg-slate-50 hover:text-indigo-600',
                          'group flex w-full items-center gap-x-3 rounded-md px-2 py-2 text-base font-semibold'
                        )}
                      >
                        <item.icon className={classNames(isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-600', 'h-6 w-6 shrink-0')} />
                        {item.name}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
