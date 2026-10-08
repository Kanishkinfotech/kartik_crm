import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Mail,
  MessageCircle,
  FileText,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCw,
  Trash2,
  AlertCircle,
  Inbox,
  Send,
  Webhook,
  LayoutList,
  Eye,
  Clock,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { formatDateTime, classNames } from '@/lib/format';
import type {
  CommunicationRecord,
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  CommunicationTemplate,
  WebhookEvent,
  Client,
} from '@/lib/types';
import {
  Button,
  Card,
  PageHeader,
  Field,
  TextInput,
  TextArea,
  Select,
  Modal,
  ConfirmDialog,
  StatusBadge,
  EmptyState,
  LoadingState,
  ErrorState,
  Toast,
  type BadgeTone,
} from '@/components/ui';

// ─── Constants ────────────────────────────────────────────────────────

type TabId =
  | 'all'
  | 'email'
  | 'whatsapp'
  | 'incoming'
  | 'outgoing'
  | 'failed'
  | 'templates'
  | 'webhooks';

const TABS: { id: TabId; label: string; icon: typeof Mail }[] = [
  { id: 'all', label: 'All', icon: LayoutList },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'incoming', label: 'Incoming', icon: Inbox },
  { id: 'outgoing', label: 'Outgoing', icon: Send },
  { id: 'failed', label: 'Failed', icon: AlertCircle },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'webhooks', label: 'Webhook Logs', icon: Webhook },
];

const RECORD_TABS: TabId[] = ['all', 'email', 'whatsapp', 'incoming', 'outgoing', 'failed'];

const STATUS_TONES: Record<CommunicationStatus, BadgeTone> = {
  sent: 'success',
  delivered: 'success',
  read: 'success',
  received: 'success',
  failed: 'danger',
  bounced: 'danger',
  queued: 'info',
  sending: 'info',
  draft: 'neutral',
  cancelled: 'neutral',
};

const ALL_STATUSES: CommunicationStatus[] = [
  'draft',
  'queued',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'bounced',
  'cancelled',
  'received',
];

const FAILED_STATUSES: CommunicationStatus[] = ['failed', 'bounced'];

const TEMPLATE_CATEGORIES = [
  'quotation_sent',
  'quotation_followup',
  'invoice_sent',
  'payment_link_sent',
  'payment_due',
  'payment_received',
  'receipt_sent',
  'project_update',
  'work_report_sent',
  'custom',
];

const TEMPLATE_CHANNEL_OPTIONS: { value: 'email' | 'whatsapp' | 'combined'; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'combined', label: 'Combined (Email + WhatsApp)' },
];

const WEBHOOK_STATUS_TONES: Record<string, BadgeTone> = {
  processed: 'success',
  received: 'info',
  processing: 'info',
  duplicate: 'neutral',
  ignored: 'neutral',
  failed: 'danger',
  manual_review: 'warning',
};

interface ToastState {
  message: string;
  tone: 'info' | 'success' | 'error';
}

// ─── Helpers ──────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function clientDisplayName(c: Pick<Client, 'contact_person' | 'business_name'> | null | undefined): string {
  if (!c) return '—';
  return c.business_name?.trim() || c.contact_person?.trim() || 'Unknown client';
}

function recordDisplayDate(r: CommunicationRecord): string | null {
  if (r.direction === 'incoming') return r.received_at ?? r.created_at;
  return r.sent_at ?? r.delivered_at ?? r.created_at;
}

function ChannelIcon({ channel, className }: { channel: CommunicationChannel; className?: string }) {
  if (channel === 'email') return <Mail className={className} />;
  if (channel === 'whatsapp') return <MessageCircle className={className} />;
  return <FileText className={className} />;
}

function DirectionArrow({ direction, className }: { direction: CommunicationDirection; className?: string }) {
  return direction === 'outgoing' ? (
    <ArrowUpRight className={className} />
  ) : (
    <ArrowDownLeft className={className} />
  );
}

// Linked entity descriptors for the detail modal
const LINKED_ENTITY_FIELDS: { key: keyof CommunicationRecord; label: string }[] = [
  { key: 'linked_quotation_id', label: 'Quotation' },
  { key: 'linked_invoice_id', label: 'Invoice' },
  { key: 'linked_payment_id', label: 'Payment' },
  { key: 'linked_project_id', label: 'Project' },
  { key: 'linked_task_id', label: 'Task' },
  { key: 'linked_work_report_id', label: 'Work Report' },
];

// ─── Main component ───────────────────────────────────────────────────

export function CommunicationCentre() {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const wsId = activeWorkspace?.id;

  const [activeTab, setActiveTab] = useState<TabId>('all');

  // Communication records
  const [records, setRecords] = useState<CommunicationRecord[]>([]);
  const [clients, setClients] = useState<Pick<Client, 'id' | 'contact_person' | 'business_name'>[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  // Filters (records tabs only)
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CommunicationStatus>('all');

  // Detail modal
  const [selectedRecord, setSelectedRecord] = useState<CommunicationRecord | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<CommunicationTemplate | null>(null);

  // Webhooks
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(true);
  const [webhooksError, setWebhooksError] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);

  const canManageTemplates = can(role, 'communication.send');
  const canRetry = can(role, 'communication.send');

  // ── Load clients (once per workspace) ──
  useEffect(() => {
    if (!wsId) return;
    supabase
      .from('clients')
      .select('id, contact_person, business_name')
      .eq('workspace_id', wsId)
      .eq('is_deleted', false)
      .order('contact_person')
      .then(({ data, error: e }) => {
        if (!e && data) setClients(data as Pick<Client, 'id' | 'contact_person' | 'business_name'>[]);
      });
  }, [wsId]);

  const clientMap = useMemo(() => {
    const m = new Map<string, Pick<Client, 'contact_person' | 'business_name'>>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  // ── Load communication records (depends on active record tab) ──
  const loadRecords = useCallback(async () => {
    if (!wsId) return;
    setLoadingRecords(true);
    setRecordsError(null);
    try {
      let query = supabase
        .from('communication_records')
        .select('*')
        .eq('workspace_id', wsId);

      if (activeTab === 'email') {
        query = query.eq('channel', 'email');
      } else if (activeTab === 'whatsapp') {
        query = query.eq('channel', 'whatsapp');
      } else if (activeTab === 'incoming') {
        query = query.eq('direction', 'incoming');
      } else if (activeTab === 'outgoing') {
        query = query.eq('direction', 'outgoing');
      } else if (activeTab === 'failed') {
        query = query.in('status', FAILED_STATUSES);
      }

      const { data, error: err } = await query.order('created_at', { ascending: false }).limit(200);
      if (err) throw err;
      setRecords((data ?? []) as CommunicationRecord[]);
    } catch (e) {
      setRecordsError(e instanceof Error ? e.message : 'Failed to load communication records');
    } finally {
      setLoadingRecords(false);
    }
  }, [wsId, activeTab]);

  useEffect(() => {
    if (!wsId || !RECORD_TABS.includes(activeTab)) return;
    loadRecords();
  }, [wsId, activeTab, loadRecords]);

  // ── Load templates ──
  const loadTemplates = useCallback(async () => {
    if (!wsId) return;
    setLoadingTemplates(true);
    setTemplatesError(null);
    try {
      const { data, error: err } = await supabase
        .from('communication_templates')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });
      if (err) throw err;
      setTemplates((data ?? []) as CommunicationTemplate[]);
    } catch (e) {
      setTemplatesError(e instanceof Error ? e.message : 'Failed to load templates');
    } finally {
      setLoadingTemplates(false);
    }
  }, [wsId]);

  useEffect(() => {
    if (!wsId || activeTab !== 'templates') return;
    loadTemplates();
  }, [wsId, activeTab, loadTemplates]);

  // ── Load webhooks ──
  const loadWebhooks = useCallback(async () => {
    if (!wsId) return;
    setLoadingWebhooks(true);
    setWebhooksError(null);
    try {
      const { data, error: err } = await supabase
        .from('webhook_events')
        .select('*')
        .eq('workspace_id', wsId)
        .order('received_at', { ascending: false })
        .limit(200);
      if (err) throw err;
      setWebhooks((data ?? []) as WebhookEvent[]);
    } catch (e) {
      setWebhooksError(e instanceof Error ? e.message : 'Failed to load webhook events');
    } finally {
      setLoadingWebhooks(false);
    }
  }, [wsId]);

  useEffect(() => {
    if (!wsId || activeTab !== 'webhooks') return;
    loadWebhooks();
  }, [wsId, activeTab, loadWebhooks]);

  // ── Filtered records (client-side search + client + status) ──
  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((r) => {
      if (clientFilter !== 'all' && r.client_id !== clientFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (term) {
        const subject = (r.subject ?? '').toLowerCase();
        const body = (r.message_body ?? '').toLowerCase();
        if (!subject.includes(term) && !body.includes(term)) return false;
      }
      return true;
    });
  }, [records, search, clientFilter, statusFilter]);

  // ── Retry a failed message via edge function ──
  const retryRecord = useCallback(
    async (record: CommunicationRecord) => {
      setRetrying(true);
      try {
        const { error: invokeError } = await supabase.functions.invoke('retry-communication', {
          body: { recordId: record.id },
        });
        if (invokeError) throw invokeError;
        setToast({ message: 'Retry triggered — message re-queued for sending', tone: 'success' });
        // Refresh the record status
        const { data: updated, error: fetchErr } = await supabase
          .from('communication_records')
          .select('*')
          .eq('id', record.id)
          .single();
        if (!fetchErr && updated) {
          const u = updated as CommunicationRecord;
          setSelectedRecord(u);
          setRecords((prev) => prev.map((r) => (r.id === u.id ? u : r)));
        } else {
          await loadRecords();
        }
      } catch (e) {
        setToast({
          message: e instanceof Error ? e.message : 'Failed to retry message',
          tone: 'error',
        });
      } finally {
        setRetrying(false);
      }
    },
    [loadRecords],
  );

  const isRecordTab = RECORD_TABS.includes(activeTab);

  // ── Render ──
  if (!wsId) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communication Centre"
        description="Track every email and WhatsApp message sent and received across your workspace"
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={classNames(
                'inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Record filters — only on communication tabs */}
      {isRecordTab && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Search</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <TextInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by subject or message body…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Client</label>
              <Select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
              >
                <option value="all">All clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clientDisplayName(c)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | CommunicationStatus)}
              >
                <option value="all">All statuses</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
            </div>
            {(search || clientFilter !== 'all' || statusFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setClientFilter('all');
                  setStatusFilter('all');
                }}
              >
                <Filter className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
            <div className="ml-auto text-xs text-slate-500">
              {filteredRecords.length} message(s)
            </div>
          </div>
        </Card>
      )}

      {/* ── Communication records ── */}
      {isRecordTab &&
        (loadingRecords ? (
          <LoadingState label="Loading messages…" />
        ) : recordsError ? (
          <ErrorState message={recordsError} onRetry={loadRecords} />
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={<Mail className="h-10 w-10" />}
            title={records.length === 0 ? 'No messages yet' : 'No messages match your filters'}
            description={
              records.length === 0
                ? 'Communication records will appear here once you start sending emails or WhatsApp messages.'
                : 'Try adjusting or clearing the filters above.'
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Direction</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRecords.map((r) => {
                    const failed = FAILED_STATUSES.includes(r.status);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedRecord(r)}
                        className="cursor-pointer transition-colors hover:bg-slate-50"
                      >
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center gap-2 text-slate-600">
                            <ChannelIcon channel={r.channel} className="h-4 w-4" />
                            <span className="text-sm capitalize">{r.channel}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {r.subject || <span className="text-slate-400">(no subject)</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                          {r.client_id ? clientDisplayName(clientMap.get(r.client_id) ?? null) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <DirectionArrow
                              direction={r.direction}
                              className={classNames(
                                'h-4 w-4',
                                r.direction === 'outgoing' ? 'text-sky-500' : 'text-emerald-500',
                              )}
                            />
                            <span className="text-xs capitalize">{r.direction}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusBadge status={statusLabel(r.status)} tone={STATUS_TONES[r.status]} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                          {formatDateTime(recordDisplayDate(r))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {failed && canRetry ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                retryRecord(r);
                              }}
                              disabled={retrying}
                            >
                              <RotateCw className="h-3.5 w-3.5" />
                              Retry
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}

      {/* ── Templates tab ── */}
      {activeTab === 'templates' && (
        <TemplatesSection
          wsId={wsId}
          userId={user?.id ?? null}
          templates={templates}
          loading={loadingTemplates}
          error={templatesError}
          canManage={canManageTemplates}
          onReload={loadTemplates}
          showCreateModal={showTemplateModal}
          onOpenCreateModal={() => setShowTemplateModal(true)}
          onCloseCreateModal={() => setShowTemplateModal(false)}
          onAskDelete={setTemplateToDelete}
          onToast={setToast}
        />
      )}

      {/* ── Webhook logs tab ── */}
      {activeTab === 'webhooks' && (
        <WebhookLogsSection
          webhooks={webhooks}
          loading={loadingWebhooks}
          error={webhooksError}
          onReload={loadWebhooks}
        />
      )}

      {/* ── Detail modal ── */}
      {selectedRecord && (
        <RecordDetailModal
          record={selectedRecord}
          clientName={
            selectedRecord.client_id ? clientDisplayName(clientMap.get(selectedRecord.client_id) ?? null) : null
          }
          onClose={() => setSelectedRecord(null)}
          canRetry={canRetry}
          retrying={retrying}
          onRetry={() => retryRecord(selectedRecord)}
        />
      )}

      {/* ── Template delete confirm ── */}
      {templateToDelete && (
        <ConfirmDialog
          open
          onClose={() => setTemplateToDelete(null)}
          onConfirm={async () => {
            try {
              const { error: err } = await supabase
                .from('communication_templates')
                .delete()
                .eq('id', templateToDelete.id)
                .eq('workspace_id', wsId);
              if (err) throw err;
              setToast({ message: 'Template deleted', tone: 'success' });
              loadTemplates();
            } catch (e) {
              setToast({
                message: e instanceof Error ? e.message : 'Failed to delete template',
                tone: 'error',
              });
            }
          }}
          title="Delete template"
          message={`Delete “${templateToDelete.template_name}”? This cannot be undone.`}
          confirmLabel="Delete"
          danger
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </div>
  );
}

// ─── Record detail modal ──────────────────────────────────────────────

function RecordDetailModal({
  record,
  clientName,
  onClose,
  canRetry,
  retrying,
  onRetry,
}: {
  record: CommunicationRecord;
  clientName: string | null;
  onClose: () => void;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const failed = FAILED_STATUSES.includes(record.status);

  // Build a status timeline from available timestamps
  const timeline: { label: string; at: string }[] = [];
  if (record.created_at) timeline.push({ label: 'Created', at: record.created_at });
  if (record.sent_at) timeline.push({ label: 'Sent', at: record.sent_at });
  if (record.delivered_at) timeline.push({ label: 'Delivered', at: record.delivered_at });
  if (record.read_at) timeline.push({ label: 'Read', at: record.read_at });
  if (record.received_at) timeline.push({ label: 'Received', at: record.received_at });
  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const linkedEntities = LINKED_ENTITY_FIELDS.filter((f) => record[f.key]);

  return (
    <Modal open onClose={onClose} title="Message details" size="lg">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <ChannelIcon channel={record.channel} className="h-4 w-4" />
              <span className="capitalize">{record.channel}</span>
              <span className="text-slate-300">·</span>
              <DirectionArrow
                direction={record.direction}
                className={classNames(
                  'inline h-4 w-4',
                  record.direction === 'outgoing' ? 'text-sky-500' : 'text-emerald-500',
                )}
              />
              <span className="capitalize">{record.direction}</span>
            </div>
            <h3 className="mt-1 text-base font-semibold text-slate-900">
              {record.subject || '(no subject)'}
            </h3>
          </div>
          <StatusBadge status={statusLabel(record.status)} tone={STATUS_TONES[record.status]} />
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-3">
          <MetaItem label="Client" value={clientName ?? '—'} />
          <MetaItem label="Status" value={statusLabel(record.status)} />
          <MetaItem label="External ID" value={record.external_message_id ?? '—'} />
          {record.failure_code && <MetaItem label="Failure code" value={record.failure_code} />}
          {record.failure_message && (
            <MetaItem label="Failure message" value={record.failure_message} />
          )}
        </div>

        {/* Failure notice */}
        {failed && record.failure_message && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">This message failed to send.</p>
              <p className="mt-0.5 text-rose-600">{record.failure_message}</p>
            </div>
          </div>
        )}

        {/* Message body */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Message body</h4>
          {record.safe_html ? (
            <div
              className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-white p-4"
              dangerouslySetInnerHTML={{ __html: record.safe_html }}
            />
          ) : record.message_body ? (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
              {record.message_body}
            </pre>
          ) : (
            <p className="text-sm text-slate-400">No message body recorded.</p>
          )}
        </div>

        {/* Linked entities */}
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Linked entities</h4>
          {linkedEntities.length === 0 ? (
            <p className="text-sm text-slate-400">No entities linked to this message.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {linkedEntities.map((f) => (
                <span
                  key={f.key}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
                >
                  <span className="font-medium text-slate-700">{f.label}</span>
                  <span className="font-mono text-slate-400">
                    {String(record[f.key]).slice(0, 8)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Status timeline */}
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status timeline</h4>
          <ol className="relative space-y-4 border-l border-slate-200 pl-5">
            {timeline.map((t, i) => {
              const isLast = i === timeline.length - 1;
              return (
                <li key={t.label} className="relative">
                  <span
                    className={classNames(
                      'absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white',
                      isLast ? 'bg-emerald-500' : 'bg-slate-300',
                    )}
                  >
                    {isLast ? (
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    ) : (
                      <Clock className="h-3 w-3 text-white" />
                    )}
                  </span>
                  <p className="text-sm font-medium text-slate-800">{t.label}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(t.at)}</p>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Actions */}
        {failed && canRetry && (
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={onRetry} disabled={retrying}>
              <RotateCw className="h-4 w-4" />
              {retrying ? 'Retrying…' : 'Retry send'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-700">{value}</dd>
    </div>
  );
}

// ─── Templates section ────────────────────────────────────────────────

interface TemplateFormState {
  template_name: string;
  category: string;
  channel: 'email' | 'whatsapp' | 'combined';
  subject: string;
  html_body: string;
  plain_text_body: string;
  variables: string;
}

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  template_name: '',
  category: 'custom',
  channel: 'email',
  subject: '',
  html_body: '',
  plain_text_body: '',
  variables: '',
};

function TemplatesSection({
  wsId,
  userId,
  templates,
  loading,
  error,
  canManage,
  onReload,
  showCreateModal,
  onOpenCreateModal,
  onCloseCreateModal,
  onAskDelete,
  onToast,
}: {
  wsId: string;
  userId: string | null;
  templates: CommunicationTemplate[];
  loading: boolean;
  error: string | null;
  canManage: boolean;
  onReload: () => void;
  showCreateModal: boolean;
  onOpenCreateModal: () => void;
  onCloseCreateModal: () => void;
  onAskDelete: (t: CommunicationTemplate) => void;
  onToast: (t: ToastState) => void;
}) {
  const [form, setForm] = useState<TemplateFormState>(EMPTY_TEMPLATE_FORM);
  const [saving, setSaving] = useState(false);

  const set = useCallback(<K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const resetForm = useCallback(() => setForm(EMPTY_TEMPLATE_FORM), []);

  const handleCreate = useCallback(async () => {
    if (!form.template_name.trim()) {
      onToast({ message: 'Template name is required', tone: 'error' });
      return;
    }
    setSaving(true);
    try {
      const variables = form.variables
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

      const { error: err } = await supabase.from('communication_templates').insert({
        workspace_id: wsId,
        template_name: form.template_name.trim(),
        category: form.category,
        channel: form.channel,
        subject: form.subject.trim() || null,
        html_body: form.html_body || null,
        plain_text_body: form.plain_text_body || null,
        variables,
        language: 'en',
        is_active: true,
        created_by: userId,
        updated_by: userId,
      });
      if (err) throw err;
      onToast({ message: 'Template created', tone: 'success' });
      resetForm();
      onCloseCreateModal();
      onReload();
    } catch (e) {
      onToast({ message: e instanceof Error ? e.message : 'Failed to create template', tone: 'error' });
    } finally {
      setSaving(false);
    }
  }, [form, wsId, userId, onToast, resetForm, onCloseCreateModal, onReload]);

  const toggleActive = useCallback(
    async (t: CommunicationTemplate) => {
      try {
        const { error: err } = await supabase
          .from('communication_templates')
          .update({ is_active: !t.is_active, updated_by: userId })
          .eq('id', t.id)
          .eq('workspace_id', wsId);
        if (err) throw err;
        onReload();
      } catch (e) {
        onToast({ message: e instanceof Error ? e.message : 'Failed to update template', tone: 'error' });
      }
    },
    [wsId, userId, onReload, onToast],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Message templates</h2>
          <p className="text-sm text-slate-500">Reusable templates for quotations, invoices, payments and updates.</p>
        </div>
        {canManage && (
          <Button onClick={onOpenCreateModal}>
            <Plus className="h-4 w-4" />
            New template
          </Button>
        )}
      </div>

      {loading ? (
        <LoadingState label="Loading templates…" />
      ) : error ? (
        <ErrorState message={error} onRetry={onReload} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="No templates yet"
          description="Create reusable message templates to speed up your communication."
          action={
            canManage && (
              <Button onClick={onOpenCreateModal}>
                <Plus className="h-4 w-4" />
                New template
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-900">{t.template_name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      <ChannelIcon
                        channel={t.channel === 'combined' ? 'email' : (t.channel as CommunicationChannel)}
                        className="h-3 w-3"
                      />
                      <span className="capitalize">{t.channel}</span>
                    </span>
                    <span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      {statusLabel(t.category)}
                    </span>
                  </div>
                </div>
                <StatusBadge status={t.is_active ? 'active' : 'inactive'} tone={t.is_active ? 'success' : 'neutral'} />
              </div>

              {t.subject && (
                <p className="mt-3 text-xs font-medium text-slate-500">Subject: {t.subject}</p>
              )}
              <p className="mt-1 line-clamp-3 flex-1 text-sm text-slate-600">
                {t.plain_text_body || t.subject || '—'}
              </p>

              {t.variables && t.variables.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {t.variables.map((v) => (
                    <span
                      key={v}
                      className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}

              {canManage && (
                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(t)}>
                    {t.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-400 hover:text-rose-600"
                    onClick={() => onAskDelete(t)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create template modal */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          resetForm();
          onCloseCreateModal();
        }}
        title="New message template"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Template name" required>
              <TextInput
                value={form.template_name}
                onChange={(e) => set('template_name', e.target.value)}
                placeholder="e.g. Quotation sent follow-up"
              />
            </Field>
            <Field label="Category" required>
              <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {statusLabel(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Channel" required>
              <Select
                value={form.channel}
                onChange={(e) => set('channel', e.target.value as TemplateFormState['channel'])}
              >
                {TEMPLATE_CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Variables" hint="Comma-separated, e.g. client_name, invoice_number, amount">
              <TextInput
                value={form.variables}
                onChange={(e) => set('variables', e.target.value)}
                placeholder="client_name, invoice_number"
              />
            </Field>
          </div>

          <Field label="Subject">
            <TextInput
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              placeholder="Email subject line"
            />
          </Field>

          <Field label="HTML body" hint="Use {{variable}} placeholders that match the variables above.">
            <TextArea
              value={form.html_body}
              onChange={(e) => set('html_body', e.target.value)}
              rows={6}
              placeholder="<p>Hello {{client_name}}, …</p>"
              className="font-mono text-xs"
            />
          </Field>

          <Field label="Plain text body">
            <TextArea
              value={form.plain_text_body}
              onChange={(e) => set('plain_text_body', e.target.value)}
              rows={4}
              placeholder="Hello {{client_name}}, …"
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                onCloseCreateModal();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              <Plus className="h-4 w-4" />
              {saving ? 'Creating…' : 'Create template'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Webhook logs section ─────────────────────────────────────────────

function WebhookLogsSection({
  webhooks,
  loading,
  error,
  onReload,
}: {
  webhooks: WebhookEvent[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Webhook events</h2>
        <p className="text-sm text-slate-500">
          Incoming webhooks from Razorpay and WhatsApp, with signature verification and processing status.
        </p>
      </div>

      {loading ? (
        <LoadingState label="Loading webhook logs…" />
      ) : error ? (
        <ErrorState message={error} onRetry={onReload} />
      ) : webhooks.length === 0 ? (
        <EmptyState
          icon={<Webhook className="h-10 w-10" />}
          title="No webhook events"
          description="Webhook events from payment and messaging providers will appear here."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Event type</th>
                  <th className="px-4 py-3">Processing status</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Signature</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {webhooks.map((w) => (
                  <tr key={w.id} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-sm capitalize text-slate-700">
                        {w.provider === 'whatsapp' ? (
                          <MessageCircle className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Webhook className="h-4 w-4 text-blue-500" />
                        )}
                        {w.provider}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-600">
                      {w.event_type ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge
                        status={statusLabel(w.processing_status)}
                        tone={WEBHOOK_STATUS_TONES[w.processing_status] ?? 'neutral'}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDateTime(w.received_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {w.signature_valid ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Valid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Invalid
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default CommunicationCentre;
