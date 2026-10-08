import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState, Button, Modal, Field, TextInput, Select, TextArea } from '@/components/ui';
import { AlertCircle, Megaphone, Plus, RefreshCw, Trash2, Eye, Globe, Shield } from 'lucide-react';
import { formatDateTime } from '@/lib/format';

export function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [bannerType, setBannerType] = useState<'info' | 'warning' | 'critical' | 'success'>('info');
  const [targetAudience, setTargetAudience] = useState<'all' | 'trial' | 'active'>('all');
  const [busy, setBusy] = useState(false);

  const loadAnnouncements = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('platform_announcements')
      .select('*')
      .order('created_at', { ascending: false });

    setAnnouncements(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleCreateAnnouncement = async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);

    const { error } = await supabase.from('platform_announcements').insert({
      title: title.trim(),
      content: content.trim(),
      banner_type: bannerType,
      target_audience: targetAudience,
      is_active: true,
      created_at: new Date().toISOString(),
    });

    setBusy(false);
    if (!error) {
      setShowCreateModal(false);
      setTitle('');
      setContent('');
      loadAnnouncements();
    } else {
      alert(`Failed to broadcast announcement: ${error.message}`);
    }
  };

  const toggleActiveStatus = async (id: string, currentStatus: boolean) => {
    await supabase.from('platform_announcements').update({ is_active: !currentStatus }).eq('id', id);
    loadAnnouncements();
  };

  if (loading) return <LoadingState label="Loading Announcements..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-admin-primary" /> Platform In-App Announcements
          </h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Broadcast system maintenance banners, feature updates, or notices across customer CRM dashboards.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={loadAnnouncements} className="gap-2 text-xs">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)} className="gap-2 text-xs">
            <Plus className="h-4 w-4" /> Broadcast Announcement
          </Button>
        </div>
      </div>

      <div className="bg-admin-bg-surface rounded-xl shadow-sm border border-admin-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-admin-text-secondary">
            <thead className="bg-slate-50 text-admin-text-primary border-b border-admin-border-subtle font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Announcement</th>
                <th className="px-6 py-3.5">Banner Type</th>
                <th className="px-6 py-3.5">Target Audience</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Date Created</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {announcements.length > 0 ? (
                announcements.map((a) => {
                  let badgeType = 'bg-blue-100 text-blue-800';
                  if (a.banner_type === 'warning') badgeType = 'bg-amber-100 text-amber-800';
                  if (a.banner_type === 'critical') badgeType = 'bg-rose-100 text-rose-800';
                  if (a.banner_type === 'success') badgeType = 'bg-emerald-100 text-emerald-800';

                  return (
                    <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-admin-text-primary">{a.title}</div>
                        <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">{a.content}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 text-[11px] rounded-full uppercase font-bold tracking-wider ${badgeType}`}>
                          {a.banner_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium capitalize text-slate-700">
                        {a.target_audience || 'All Workspaces'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs rounded-full uppercase font-bold tracking-wider ${a.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                          {a.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {formatDateTime(a.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleActiveStatus(a.id, a.is_active)}
                          className="text-xs"
                        >
                          {a.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs text-slate-400">
                    No active platform announcements broadcasted.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Broadcast Announcement Banner">
          <div className="space-y-4 py-2">
            <Field label="Announcement Title">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled System Maintenance" />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Banner Severity">
                <Select value={bannerType} onChange={(e) => setBannerType(e.target.value as any)}>
                  <option value="info">Information (Blue)</option>
                  <option value="warning">Warning (Amber)</option>
                  <option value="critical">Critical Alert (Red)</option>
                  <option value="success">Feature Release (Green)</option>
                </Select>
              </Field>

              <Field label="Target Workspace Audience">
                <Select value={targetAudience} onChange={(e) => setTargetAudience(e.target.value as any)}>
                  <option value="all">All SaaS Customers</option>
                  <option value="trial">Free / Trial Workspaces Only</option>
                  <option value="active">Paid Active Workspaces Only</option>
                </Select>
              </Field>
            </div>

            <Field label="Announcement Message Content">
              <TextArea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Message that will display at top of CRM dashboard..."
                rows={3}
              />
            </Field>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateAnnouncement} disabled={busy}>
                {busy ? 'Broadcasting...' : 'Broadcast Announcement'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}