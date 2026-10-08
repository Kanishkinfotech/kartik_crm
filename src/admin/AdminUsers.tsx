import { Users } from 'lucide-react';
export function AdminUsers() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Users className="h-8 w-8 text-admin-text-secondary" />
        <h1 className="text-2xl font-bold text-admin-text-primary">Platform Users</h1>
      </div>
      <div className="rounded-xl border border-admin-border-default bg-admin-bg-surface p-6 shadow-sm">
        <p className="text-sm text-admin-text-secondary">Manage Platform Admins and roles.</p>
        <div className="mt-4 overflow-hidden rounded-lg border border-admin-border-default">
          <table className="w-full text-left text-sm text-admin-text-secondary">
            <thead className="bg-admin-bg-muted text-admin-text-primary border-b border-admin-border-default">
              <tr>
                <th className="px-4 py-3 font-medium">Name & Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last Login</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr><td colSpan={5} className="p-4 text-center">No additional admins found.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}