import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePortal } from '@/lib/portal';
import { useRouter } from '@/lib/router';
import { Card, LoadingState, StatusBadge, Button, ConfirmDialog, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ArrowLeft, FileText, CheckCircle2, Download, Package, Activity } from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'overview' | 'milestones' | 'deliverables' | 'files';

export function PortalProjectDetail({ projectId }: { projectId: string }) {
  const { activeMembership } = usePortal();
  const { navigate } = useRouter();
  const [project, setProject] = useState<any>(null);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [deliverables, setDeliverables] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const [confirmApprove, setConfirmApprove] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [actioning, setActioning] = useState(false);

  const load = useCallback(async () => {
    if (!activeMembership || !projectId) return;
    setLoading(true);

    const [pRes, mRes, dRes, fRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).eq('client_id', activeMembership.client_id).maybeSingle(),
      supabase.from('project_milestones').select('*').eq('project_id', projectId).order('sequence', { ascending: true }),
      supabase.from('project_deliverables').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_files').select('*').eq('project_id', projectId).eq('is_archived', false).order('created_at', { ascending: false })
    ]);

    if (!pRes.data) {
      toast.error('Project not found.');
      navigate('/portal/projects');
      return;
    }

    setProject(pRes.data);
    setMilestones(mRes.data || []);
    setDeliverables(dRes.data || []);
    setFiles(fRes.data || []);
    
    setLoading(false);
  }, [activeMembership, projectId, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleDecision = async (deliverableId: string, decision: 'approved' | 'rejected') => {
    setActioning(true);
    try {
      const { error } = await supabase.rpc('portal_decide_deliverable', {
        p_deliverable_id: deliverableId,
        p_decision: decision
      });

      if (error) throw error;
      
      toast.success(`Deliverable ${decision}`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
    setActioning(false);
    setConfirmApprove(null);
    setConfirmReject(null);
  };

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('project-files').getPublicUrl(path);
    return data.publicUrl;
  };

  if (loading || !project) return <LoadingState />;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'milestones', label: 'Milestones', icon: CheckCircle2 },
    { id: 'deliverables', label: 'Deliverables', icon: Package },
    { id: 'files', label: 'Files', icon: FileText },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/portal/projects')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{project.title}</h1>
            <StatusBadge status={project.status} tone={project.status === 'completed' ? 'success' : project.status === 'active' || project.status === 'in_progress' ? 'info' : 'neutral'} />
          </div>
          <p className="mt-1 text-slate-500 font-mono text-sm">{project.project_number}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? 'border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Project Summary</h3>
                <div className="text-slate-600 whitespace-pre-wrap text-sm leading-relaxed">
                  {project.client_summary || 'No summary available.'}
                </div>
              </Card>
            </div>
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Progress</h3>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xl font-bold text-slate-900">{project.progress}%</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-indigo-500" style={{ width: `${project.progress}%` }} />
                </div>
              </Card>
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Timeline</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Start Date</span>
                    <span className="font-medium text-slate-900">{formatDate(project.start_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Due Date</span>
                    <span className="font-medium text-slate-900">{formatDate(project.target_completion_date)}</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab === 'milestones' && (
          <div className="space-y-4">
            {milestones.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="h-10 w-10" />} title="No milestones" description="Milestones have not been defined yet." />
            ) : (
              milestones.map(ms => (
                <Card key={ms.id} className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">M{ms.milestone_number}</span>
                        <h4 className="font-medium text-slate-900">{ms.name}</h4>
                        <StatusBadge status={ms.status} tone={ms.status === 'completed' ? 'success' : ms.status === 'in_progress' ? 'brand' : 'neutral'} />
                      </div>
                      {ms.description && <p className="mt-1 text-sm text-slate-600">{ms.description}</p>}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-900">{ms.progress}%</div>
                      <div className="text-xs text-slate-500 mt-1">Due {formatDate(ms.due_date)}</div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === 'deliverables' && (
          <div className="space-y-4">
            {deliverables.length === 0 ? (
              <EmptyState icon={<Package className="h-10 w-10" />} title="No deliverables" description="Deliverables have not been uploaded yet." />
            ) : (
              deliverables.map(d => (
                <Card key={d.id} className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-slate-900">{d.title}</h4>
                      {d.description && <p className="mt-1 text-sm text-slate-600">{d.description}</p>}
                      <div className="flex gap-2 mt-3">
                        <StatusBadge status={d.status} tone={d.status === 'approved' || d.status === 'delivered' ? 'success' : d.status === 'sent_for_approval' || d.status === 'ready_for_client' ? 'warning' : 'neutral'} />
                        {d.client_approval_status === 'pending' && <StatusBadge status="Pending Your Approval" tone="warning" />}
                      </div>
                    </div>
                    <div className="text-right">
                      {d.client_approval_status === 'pending' && (
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setConfirmReject(d.id)}>Reject</Button>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setConfirmApprove(d.id)}>Approve</Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === 'files' && (
          <div className="space-y-4">
            {files.length === 0 ? (
              <EmptyState icon={<FileText className="h-10 w-10" />} title="No files" description="Files have not been shared yet." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {files.map(f => (
                  <Card key={f.id} className="p-4 flex flex-col">
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-900 break-all line-clamp-2" title={f.file_name}>{f.file_name}</h4>
                          <p className="text-xs text-slate-500 mt-1 uppercase">{f.category.replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <a href={getPublicUrl(f.storage_path)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 w-full py-1">
                        <Download className="w-4 h-4" /> Download
                      </a>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmApprove}
        title="Approve Deliverable"
        message="Are you sure you want to approve this deliverable? This confirms that the work meets your expectations."
        confirmLabel="Approve"
        onConfirm={() => confirmApprove && handleDecision(confirmApprove, 'approved')}
        onClose={() => setConfirmApprove(null)}
      />

      <ConfirmDialog
        open={!!confirmReject}
        title="Reject Deliverable"
        message="Are you sure you want to reject this deliverable? Please reach out to the team to provide your feedback."
        confirmLabel="Reject"
        danger={true}
        onConfirm={() => confirmReject && handleDecision(confirmReject, 'rejected')}
        onClose={() => setConfirmReject(null)}
      />
    </div>
  );
}
