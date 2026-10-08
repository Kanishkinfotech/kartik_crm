import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { addTimelineEvent, addAuditLog } from '@/lib/data';
import type { Client, ClientTimelineEvent, Quotation, Invoice, Payment, ClientStatus, Project } from '@/lib/types';
import { Button, Card, ErrorState, LoadingState, StatusBadge, type BadgeTone, Field, TextArea, ConfirmDialog, EmptyState, Modal } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { ArrowLeft, Mail, Phone, MessageCircle, Globe, MapPin, Building2, FileText, Receipt, CreditCard, Activity, StickyNote, Tag, Bot, Sparkles, FolderKanban, ExternalLink } from 'lucide-react';
import { generateAIContent } from '@/lib/ai';
import { formatCurrency, formatDate, formatDateTime, classNames } from '@/lib/format';
import { PortalAccessTab } from '@/components/PortalAccessTab';

const STATUS_TONE: Record<ClientStatus, BadgeTone> = {
  prospect: 'info', active: 'success', inactive: 'neutral', on_hold: 'warning',
  completed: 'brand', lost: 'neutral', blacklisted: 'danger',
};

const TABS = ['Overview', 'Projects', 'Quotations', 'Invoices', 'Payments', 'Activity Timeline', 'Portal Access', 'Notes'] as const;
type Tab = (typeof TABS)[number];

export function ClientDetail({ clientId }: { clientId: string }) {
  const { activeWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  const { user } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [timeline, setTimeline] = useState<ClientTimelineEvent[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [metrics, setMetrics] = useState({ totalQuoted: 0, approvedQuoted: 0, totalInvoiced: 0, totalCollected: 0, outstanding: 0, overdue: 0, activeProjects: 0 });
  const [tab, setTab] = useState<Tab>('Overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ title: string; content: string } | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError(null);

    let c: Client | null = null;
    try {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .eq('workspace_id', activeWorkspace.id)
        .eq('is_deleted', false)
        .maybeSingle();

      if (data) c = data as Client;
    } catch {
      // Fallback
    }

    if (!c) {
      const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(`k1_clients_${activeWorkspace.id}`) : null;
      if (cached) {
        const cachedList: Client[] = JSON.parse(cached);
        c = cachedList.find((item) => item.id === clientId) || null;
      }
    }

    if (!c) { setError('Client not found.'); setLoading(false); return; }
    setClient(c as Client);

    const [tl, qs, inv, pays, projs] = await Promise.all([
      supabase.from('client_timeline').select('*').eq('workspace_id', activeWorkspace.id).eq('client_id', clientId).order('event_date', { ascending: false }),
      supabase.from('quotations').select('*').eq('workspace_id', activeWorkspace.id).eq('client_id', clientId).eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').eq('workspace_id', activeWorkspace.id).eq('client_id', clientId).eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('workspace_id', activeWorkspace.id).eq('client_id', clientId).order('payment_date', { ascending: false }),
      supabase.from('projects').select('*').eq('workspace_id', activeWorkspace.id).eq('client_id', clientId).is('archived_at', null).order('created_at', { ascending: false }),
    ]);

    setTimeline((tl.data ?? []) as ClientTimelineEvent[]);
    setQuotations((qs.data ?? []) as Quotation[]);
    setInvoices((inv.data ?? []) as Invoice[]);
    setPayments((pays.data ?? []) as Payment[]);
    setProjects((projs.data ?? []) as Project[]);

    const totalQuoted = (qs.data ?? []).reduce((s, q: Quotation) => s + Number(q.total), 0);
    const approvedQuoted = (qs.data ?? []).filter((q: Quotation) => q.status === 'approved' || q.status === 'converted').reduce((s, q: Quotation) => s + Number(q.total), 0);
    const totalInvoiced = (inv.data ?? []).filter((i: Invoice) => i.invoice_type !== 'credit_note').reduce((s, i: Invoice) => s + Number(i.total), 0);
    const totalCollected = (inv.data ?? []).reduce((s, i: Invoice) => s + Number(i.amount_paid), 0);
    const outstanding = (inv.data ?? []).reduce((s, i: Invoice) => s + Number(i.balance_due), 0);
    const overdue = (inv.data ?? []).filter((i: Invoice) => i.status === 'overdue').reduce((s, i: Invoice) => s + Number(i.balance_due), 0);
    const activeProjects = (projs.data ?? []).filter((p: Project) => ['in_progress', 'planning', 'waiting_client', 'internal_review', 'client_review'].includes(p.status)).length;
    setMetrics({ totalQuoted, approvedQuoted, totalInvoiced, totalCollected, outstanding, overdue, activeProjects });

    setLoading(false);
  }, [activeWorkspace, clientId]);

  useEffect(() => { load(); }, [load]);

  const saveNote = async () => {
    if (!activeWorkspace || !client || !noteText.trim()) return;
    setSavingNote(true);
    await addTimelineEvent(activeWorkspace.id, client.id, 'note_added', {
      title: 'Note added',
      description: noteText.trim(),
      actorId: user?.id ?? null,
    });
    await addAuditLog(activeWorkspace.id, user?.id ?? null, 'client', client.id, 'note', { changeSummary: 'Added internal note' });
    setNoteText('');
    setSavingNote(false);
    load();
  };

  const runAI = async (action: 'summary' | 'suggest') => {
    if (!activeWorkspace || !client) return;
    setAiLoading(true);
    try {
      const context = JSON.stringify({
        client: { ...client, id: undefined, workspace_id: undefined },
        metrics,
        recent_timeline: timeline.slice(0, 5),
      });
      const response = await generateAIContent({
        workspace_id: activeWorkspace.id,
        feature_name: `client_${action}`,
        module_name: "clients",
        userInstruction: action === 'summary' 
          ? "Summarise this client's profile, financial standing, and recent activity in 3-4 bullet points."
          : "Suggest the next best action for this client based on their recent activity and outstanding balances. Be concise.",
        context,
        systemInstruction: "You are a CRM assistant helping an account manager. Provide a concise, professional summary or suggested action based on the client data.",
      });
      if (response.success && response.content) {
        setAiResult({ title: action === 'summary' ? 'AI Client Summary' : 'AI Suggested Action', content: response.content });
      } else {
        throw new Error(response.error || "Failed to generate");
      }
    } catch (err: any) {
      alert(err.message);
    }
    setAiLoading(false);
  };

  if (loading) return <LoadingState label="Loading client…" />;
  if (error || !client) return <ErrorState message={error ?? 'Client not found'} onRetry={() => navigate('/clients')} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/clients')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">{client.contact_person || client.business_name}</h1>
              <StatusBadge status={client.status} tone={STATUS_TONE[client.status]} />
            </div>
            <p className="mt-0.5 text-sm text-slate-500">{client.client_number} {client.business_name && client.business_name !== client.contact_person ? `· ${client.business_name}` : ''}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => runAI('summary')} disabled={aiLoading} className="text-indigo-600 border-indigo-200 hover:bg-indigo-50">
              <Bot className="h-4 w-4 mr-1.5" /> {aiLoading ? 'Thinking…' : 'Summary'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => runAI('suggest')} disabled={aiLoading} className="text-indigo-600 border-indigo-200 hover:bg-indigo-50">
              <Sparkles className="h-4 w-4 mr-1.5" /> Suggest Action
            </Button>
          </div>
        </div>
      </div>

      {/* Contact cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={<Phone className="h-4 w-4" />}
          label="Phone"
          value={client.primary_phone}
          href={client.primary_phone ? `tel:${client.primary_phone}` : undefined}
        />
        <InfoCard
          icon={<MessageCircle className="h-4 w-4" />}
          label="WhatsApp"
          value={client.whatsapp_number ?? '—'}
          href={client.whatsapp_number ? `https://wa.me/${client.whatsapp_number.replace(/[^0-9]/g, '')}` : undefined}
        />
        <InfoCard
          icon={<Mail className="h-4 w-4" />}
          label="Email"
          value={client.primary_email ?? '—'}
          href={client.primary_email ? `mailto:${client.primary_email}` : undefined}
        />
        <InfoCard
          icon={<Globe className="h-4 w-4" />}
          label="Website"
          value={client.website ?? '—'}
          href={client.website ? (client.website.startsWith('http://') || client.website.startsWith('https://') ? client.website : `https://${client.website}`) : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={classNames(
                'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'Overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Active projects" value={metrics.activeProjects.toString()} />
            <MetricCard label="Total quoted" value={formatCurrency(metrics.totalQuoted, client.default_currency)} />
            <MetricCard label="Approved value" value={formatCurrency(metrics.approvedQuoted, client.default_currency)} />
            <MetricCard label="Total invoiced" value={formatCurrency(metrics.totalInvoiced, client.default_currency)} />
            <MetricCard label="Total collected" value={formatCurrency(metrics.totalCollected, client.default_currency)} tone="success" />
            <MetricCard label="Outstanding" value={formatCurrency(metrics.outstanding, client.default_currency)} tone="warning" />
            <MetricCard label="Overdue" value={formatCurrency(metrics.overdue, client.default_currency)} tone="danger" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><MapPin className="h-4 w-4 text-slate-400" /> Addresses</h3>
              <div className="space-y-3 text-sm">
                <div><span className="text-slate-400">Billing:</span><p className="text-slate-700">{client.billing_address || '—'}</p><p className="text-slate-500">{[client.city, client.state, client.pincode].filter(Boolean).join(', ')}</p></div>
                <div><span className="text-slate-400">Shipping Address details:</span><p className="text-slate-700">{client.shipping_address || '—'}</p></div>
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Building2 className="h-4 w-4 text-slate-400" /> Tax & Business</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Detail label="GST registered" value={client.gst_registered ? 'Yes' : 'No'} />
                <Detail label="GSTIN" value={client.gstin ?? '—'} />
                <Detail label="PAN" value={client.pan ?? '—'} />
                <Detail label="Tax treatment" value={client.tax_treatment ?? '—'} />
                <Detail label="Industry" value={client.industry ?? '—'} />
                <Detail label="Lead source" value={client.lead_source ?? '—'} />
                <Detail label="Payment terms" value={client.payment_terms ?? '—'} />
                <Detail label="Currency" value={client.default_currency} />
              </div>
              {client.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {client.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"><Tag className="h-3 w-3" />{t}</span>)}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'Projects' && (
        <Card className="p-4">
          {projects.length === 0 ? <EmptyState icon={<FolderKanban className="h-8 w-8" />} title="No projects" description="Create a project manually or convert an approved quotation." /> : (
            <DataTable
              columns={[
                { key: 'project_number', header: 'Number', render: (p) => <span className="font-mono text-slate-500">{p.project_number}</span> },
                { key: 'title', header: 'Title', render: (p) => <span className="font-medium text-slate-900">{p.title}</span> },
                { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                { key: 'health', header: 'Health', render: (p) => <StatusBadge status={p.health} /> },
                { key: 'progress', header: 'Progress', render: (p) => <div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${p.progress}%` }} /></div><span className="text-xs text-slate-500">{p.progress}%</span></div> },
                { key: 'target_completion_date', header: 'Due', render: (p) => p.target_completion_date ? formatDate(p.target_completion_date) : '—' },
              ]}
              rows={projects}
              rowKey={(p) => p.id}
              onRowClick={(p) => navigate(`/projects/${p.id}`)}
              searchKeys={(p) => `${p.project_number} ${p.title} ${p.status}`}
              empty="No projects match your search."
            />
          )}
        </Card>
      )}

      {tab === 'Quotations' && (
        <Card className="p-4">
          {quotations.length === 0 ? <EmptyState icon={<FileText className="h-8 w-8" />} title="No quotations" description="Create a quotation for this client." /> : (
            <DataTable
              columns={qColumns()}
              rows={quotations}
              rowKey={(q) => q.id}
              onRowClick={(q) => navigate(`/quotations/${q.id}`)}
              searchKeys={(q) => `${q.quotation_number} ${q.subject ?? ''} ${q.status}`}
              empty="No quotations match your search."
            />
          )}
        </Card>
      )}

      {tab === 'Invoices' && (
        <Card className="p-4">
          {invoices.length === 0 ? <EmptyState icon={<Receipt className="h-8 w-8" />} title="No invoices" /> : (
            <DataTable
              columns={invColumns()}
              rows={invoices}
              rowKey={(i) => i.id}
              onRowClick={(i) => navigate(`/invoices/${i.id}`)}
              searchKeys={(i) => `${i.invoice_number} ${i.status} ${i.invoice_type}`}
              empty="No invoices match your search."
            />
          )}
        </Card>
      )}

      {tab === 'Payments' && (
        <Card className="p-4">
          {payments.length === 0 ? <EmptyState icon={<CreditCard className="h-8 w-8" />} title="No payments" /> : (
            <DataTable
              columns={payColumns()}
              rows={payments}
              rowKey={(p) => p.id}
              onRowClick={(p) => navigate(`/payments/${p.id}`)}
              searchKeys={(p) => `${p.payment_number} ${p.payment_mode} ${p.verification_status}`}
              empty="No payments match your search."
            />
          )}
        </Card>
      )}

      {tab === 'Activity Timeline' && (
        <Card className="p-4">
          {timeline.length === 0 ? <EmptyState icon={<Activity className="h-8 w-8" />} title="No activity yet" /> : (
            <ol className="relative space-y-4 border-l border-slate-200 pl-6">
              {timeline.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-blue-600 bg-white" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">{e.title ?? e.event_type.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-slate-400">{formatDateTime(e.event_date)}</span>
                  </div>
                  {e.description && <p className="mt-0.5 text-sm text-slate-500">{e.description}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {tab === 'Portal Access' && (
        <PortalAccessTab clientId={clientId} />
      )}

      {tab === 'Notes' && (
        <Card className="p-5">
          <Field label="Add internal note">
            <TextArea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Internal note — not visible to the client…" />
          </Field>
          <div className="mt-3 flex justify-end">
            <Button onClick={saveNote} disabled={savingNote || !noteText.trim()}>{savingNote ? 'Saving…' : 'Add note'}</Button>
          </div>
          <div className="mt-6 space-y-3">
            {timeline.filter((e) => e.event_type === 'note_added').map((e) => (
              <div key={e.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><StickyNote className="h-3.5 w-3.5" /> Note</span>
                  <span className="text-xs text-slate-400">{formatDateTime(e.event_date)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{e.description}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {aiResult && (
        <Modal open={true} onClose={() => setAiResult(null)} title={aiResult.title} size="md">
          <div className="space-y-4">
            <div className="rounded-lg bg-indigo-50/50 p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border border-indigo-100">
              {aiResult.content}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setAiResult(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );

  function qColumns(): Column<Quotation>[] {
    return [
      { key: 'num', header: 'Number', sortValue: (q) => q.quotation_number, render: (q) => <span className="font-mono text-xs text-slate-600">{q.quotation_number}</span> },
      { key: 'subject', header: 'Subject', render: (q) => <span className="text-slate-700">{q.subject ?? '—'}</span> },
      { key: 'date', header: 'Date', sortValue: (q) => q.quotation_date, render: (q) => <span className="text-slate-500">{formatDate(q.quotation_date)}</span> },
      { key: 'total', header: 'Total', sortValue: (q) => Number(q.total), render: (q) => <span className="font-medium text-slate-700">{formatCurrency(Number(q.total), q.currency)}</span> },
      { key: 'status', header: 'Status', sortValue: (q) => q.status, render: (q) => <StatusBadge status={q.status} tone={q.status === 'approved' || q.status === 'converted' ? 'success' : q.status === 'rejected' || q.status === 'expired' ? 'danger' : 'info'} /> },
    ];
  }
  function invColumns(): Column<Invoice>[] {
    return [
      { key: 'num', header: 'Number', sortValue: (i) => i.invoice_number, render: (i) => <span className="font-mono text-xs text-slate-600">{i.invoice_number}</span> },
      { key: 'type', header: 'Type', sortValue: (i) => i.invoice_type, render: (i) => <span className="text-slate-600 capitalize">{i.invoice_type.replace(/_/g, ' ')}</span> },
      { key: 'date', header: 'Date', sortValue: (i) => i.invoice_date, render: (i) => <span className="text-slate-500">{formatDate(i.invoice_date)}</span> },
      { key: 'total', header: 'Total', sortValue: (i) => Number(i.total), render: (i) => <span className="font-medium text-slate-700">{formatCurrency(Number(i.total), i.currency)}</span> },
      { key: 'bal', header: 'Balance', sortValue: (i) => Number(i.balance_due), render: (i) => <span className={Number(i.balance_due) > 0 ? 'text-amber-600' : 'text-emerald-600'}>{formatCurrency(Number(i.balance_due), i.currency)}</span> },
      { key: 'status', header: 'Status', sortValue: (i) => i.status, render: (i) => <StatusBadge status={i.status} tone={i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'danger' : i.status === 'partially_paid' ? 'warning' : 'neutral'} /> },
    ];
  }
  function payColumns(): Column<Payment>[] {
    return [
      { key: 'num', header: 'Number', sortValue: (p) => p.payment_number, render: (p) => <span className="font-mono text-xs text-slate-600">{p.payment_number}</span> },
      { key: 'date', header: 'Date', sortValue: (p) => p.payment_date, render: (p) => <span className="text-slate-500">{formatDate(p.payment_date)}</span> },
      { key: 'amount', header: 'Amount', sortValue: (p) => Number(p.amount), render: (p) => <span className="font-medium text-slate-700">{formatCurrency(Number(p.amount))}</span> },
      { key: 'mode', header: 'Mode', sortValue: (p) => p.payment_mode, render: (p) => <span className="text-slate-600 capitalize">{p.payment_mode.replace(/_/g, ' ')}</span> },
      { key: 'verify', header: 'Verification', sortValue: (p) => p.verification_status, render: (p) => <StatusBadge status={p.verification_status} tone={p.verification_status === 'verified' ? 'success' : p.verification_status === 'reversed' ? 'danger' : 'warning'} /> },
    ];
  }
}

function InfoCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  const isLink = Boolean(href && value && value !== '—');
  return (
    <Card className="flex items-start gap-3 p-4">
      <div className="rounded-lg bg-slate-100 p-2 text-slate-500">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-400">{label}</div>
        {isLink ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 max-w-full"
            title={`Open ${value}`}
          >
            <span className="truncate">{value}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-75" />
          </a>
        ) : (
          <div className="truncate text-sm font-medium text-slate-700">{value}</div>
        )}
      </div>
    </Card>
  );
}

function MetricCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const tones = { neutral: 'text-slate-900', success: 'text-emerald-700', warning: 'text-amber-700', danger: 'text-rose-700' };
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={classNames('mt-1 text-lg font-semibold', tones[tone])}>{value}</div>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-slate-700">{value}</div>
    </div>
  );
}
