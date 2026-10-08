import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { addAuditLog } from '@/lib/data';
import { formatCurrency, formatDate, formatDateTime, classNames } from '@/lib/format';
import type {
  PaymentReconciliationRecord,
  ReconciliationIssueType,
  ReconciliationStatus,
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
  StatusBadge,
  EmptyState,
  LoadingState,
  ErrorState,
  type BadgeTone,
} from '@/components/ui';

// ─── Types ───────────────────────────────────────────────────────────────────

interface JoinedInvoice {
  id: string;
  invoice_number: string;
  total: number;
  balance_due: number;
  currency: string;
  status: string;
}

interface JoinedClient {
  id: string;
  contact_person: string;
  business_name: string | null;
  primary_email: string | null;
  primary_phone: string;
}

interface JoinedPaymentLink {
  id: string;
  short_url: string | null;
  original_amount: number;
  amount_paid: number;
  amount_outstanding: number;
  currency: string;
  status: string;
}

interface JoinedWebhookEvent {
  id: string;
  event_type: string | null;
  raw_payload: Record<string, unknown> | null;
  received_at: string;
  signature_valid: boolean;
  processing_status: string;
  external_event_id: string;
}

interface ReconciliationRow extends PaymentReconciliationRecord {
  webhook_event: JoinedWebhookEvent | null;
  payment_link: JoinedPaymentLink | null;
  invoice: JoinedInvoice | null;
  client: JoinedClient | null;
}

type StatusFilter = 'all' | ReconciliationStatus;
type IssueTypeFilter = 'all' | ReconciliationIssueType;
type ResolutionAction = 'link_to_invoice' | 'ignore_with_reason' | 'escalate';

interface InvoiceOption {
  id: string;
  invoice_number: string;
  total: number;
  balance: number;
  status: string;
}

// ─── Label / tone maps ───────────────────────────────────────────────────────

const ISSUE_TYPE_LABELS: Record<ReconciliationIssueType, string> = {
  unmatched: 'Unmatched',
  amount_mismatch: 'Amount Mismatch',
  currency_mismatch: 'Currency Mismatch',
  invoice_already_paid: 'Invoice Already Paid',
  missing_invoice: 'Missing Invoice',
  duplicate_payment: 'Duplicate Payment',
  webhook_verification_failure: 'Webhook Verification Failure',
};

const ISSUE_TYPE_TONES: Record<ReconciliationIssueType, BadgeTone> = {
  unmatched: 'warning',
  amount_mismatch: 'warning',
  currency_mismatch: 'warning',
  invoice_already_paid: 'info',
  missing_invoice: 'warning',
  duplicate_payment: 'danger',
  webhook_verification_failure: 'danger',
};

const STATUS_TONES: Record<ReconciliationStatus, BadgeTone> = {
  pending: 'warning',
  resolved: 'success',
  ignored: 'neutral',
  escalated: 'danger',
};

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'escalated', label: 'Escalated' },
];

const ISSUE_TYPE_FILTERS: { value: IssueTypeFilter; label: string }[] = [
  { value: 'all', label: 'All Issue Types' },
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'amount_mismatch', label: 'Amount Mismatch' },
  { value: 'currency_mismatch', label: 'Currency Mismatch' },
  { value: 'invoice_already_paid', label: 'Invoice Already Paid' },
  { value: 'missing_invoice', label: 'Missing Invoice' },
  { value: 'duplicate_payment', label: 'Duplicate Payment' },
  { value: 'webhook_verification_failure', label: 'Webhook Verification Failure' },
];

const RESOLUTION_ACTION_LABELS: Record<ResolutionAction, string> = {
  link_to_invoice: 'Link to Invoice',
  ignore_with_reason: 'Ignore with Reason',
  escalate: 'Escalate',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clientDisplayName(c: JoinedClient | null): string {
  if (!c) return '—';
  if (c.business_name) return c.business_name;
  return c.contact_person || 'Unknown';
}

function maskPaymentId(id: string | null): string {
  if (!id) return '—';
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PaymentReconciliationPage() {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();

  const canView = can(role, 'payment_reconciliation.view');
  const canResolve = can(role, 'payment_reconciliation.resolve');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReconciliationRow[]>([]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [issueTypeFilter, setIssueTypeFilter] = useState<IssueTypeFilter>('all');
  const [search, setSearch] = useState('');

  const [selectedRow, setSelectedRow] = useState<ReconciliationRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [resolutionAction, setResolutionAction] = useState<ResolutionAction>('link_to_invoice');
  const [internalNotes, setInternalNotes] = useState('');
  const [ignoreReason, setIgnoreReason] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Invoice selector state
  const [invoiceSelectorOpen, setInvoiceSelectorOpen] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const wsId = activeWorkspace?.id ?? null;

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchRecords = useCallback(async () => {
    if (!wsId) return;
    setLoading(true);
    setError(null);

    let query = supabase
      .from('payment_reconciliation_records')
      .select(
        `
        *,
        webhook_event:webhook_events(
          id, event_type, raw_payload, received_at, signature_valid, processing_status, external_event_id
        ),
        payment_link:payment_links(
          id, short_url, original_amount, amount_paid, amount_outstanding, currency, status
        ),
        invoice:invoices(
          id, invoice_number, total, balance_due, currency, status
        ),
        client:clients(
          id, contact_person, business_name, primary_email, primary_phone
        )
      `,
      )
      .eq('workspace_id', wsId)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    if (issueTypeFilter !== 'all') {
      query = query.eq('issue_type', issueTypeFilter);
    }

    const { data, error: err } = await query;

    if (err) {
      setError(describeDbError(err));
      setRows([]);
    } else {
      let result = (data ?? []) as ReconciliationRow[];

      // Client-side search across razorpay_payment_id, invoice_number, client name
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        result = result.filter(
          (r) =>
            r.razorpay_payment_id?.toLowerCase().includes(q) ||
            r.invoice?.invoice_number?.toLowerCase().includes(q) ||
            clientDisplayName(r.client).toLowerCase().includes(q),
        );
      }

      setRows(result);
    }

    setLoading(false);
  }, [wsId, statusFilter, issueTypeFilter, search]);

  useEffect(() => {
    if (wsId && canView) {
      fetchRecords();
    } else if (!canView) {
      setLoading(false);
    }
  }, [wsId, canView, fetchRecords]);

  // ─── Fetch invoices for selector ───────────────────────────────────────────

  const fetchInvoices = useCallback(async () => {
    if (!wsId) return;
    setInvoicesLoading(true);
    const { data, error: err } = await supabase
      .from('invoices')
      .select('id, invoice_number, total, balance, status')
      .eq('workspace_id', wsId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (err) {
      setInvoices([]);
    } else {
      setInvoices((data ?? []) as InvoiceOption[]);
    }
    setInvoicesLoading(false);
  }, [wsId]);

  // ─── Summary counts ────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const counts: Record<ReconciliationStatus, number> = {
      pending: 0,
      resolved: 0,
      ignored: 0,
      escalated: 0,
    };
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  // ─── Open detail modal ─────────────────────────────────────────────────────

  const openDetail = (row: ReconciliationRow) => {
    setSelectedRow(row);
    setResolutionAction('link_to_invoice');
    setInternalNotes(row.internal_notes ?? '');
    setIgnoreReason('');
    setResolveError(null);
    setSelectedInvoiceId(row.invoice_id ?? null);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedRow(null);
    setResolveError(null);
  };

  // ─── Open invoice selector ─────────────────────────────────────────────────

  const openInvoiceSelector = () => {
    setInvoiceSelectorOpen(true);
    setInvoiceSearch('');
    setSelectedInvoiceId(selectedRow?.invoice_id ?? null);
    fetchInvoices();
  };

  // ─── Submit resolution ─────────────────────────────────────────────────────

  const submitResolution = async () => {
    if (!selectedRow || !wsId || !canResolve) return;
    setResolving(true);
    setResolveError(null);

    try {
      const row = selectedRow;
      let newStatus: ReconciliationStatus;
      let resolutionValue: string | null = null;
      let changeSummary: string;

      if (resolutionAction === 'link_to_invoice') {
        if (!selectedInvoiceId) {
          setResolveError('Please select an invoice to link.');
          setResolving(false);
          return;
        }
        const inv = invoices.find((i) => i.id === selectedInvoiceId);
        const invNumber = inv?.invoice_number ?? 'UNKNOWN';
        newStatus = 'resolved';
        resolutionValue = `linked_to_invoice:${invNumber}`;
        changeSummary = `Reconciliation resolved by linking to invoice ${invNumber}`;
      } else if (resolutionAction === 'ignore_with_reason') {
        if (!ignoreReason.trim()) {
          setResolveError('A reason is required to ignore a reconciliation record.');
          setResolving(false);
          return;
        }
        newStatus = 'ignored';
        resolutionValue = `ignored:${ignoreReason.trim().slice(0, 200)}`;
        changeSummary = `Reconciliation ignored with reason: ${ignoreReason.trim().slice(0, 100)}`;
      } else {
        newStatus = 'escalated';
        resolutionValue = 'escalated';
        changeSummary = 'Reconciliation escalated for manual review';
      }

      const before = {
        status: row.status,
        resolution: row.resolution,
        invoice_id: row.invoice_id,
        internal_notes: row.internal_notes,
      };

      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        resolution: resolutionValue,
        resolved_by: user?.id ?? null,
        resolved_at: new Date().toISOString(),
        internal_notes: internalNotes.trim() || null,
      };

      if (resolutionAction === 'link_to_invoice' && selectedInvoiceId) {
        updatePayload.invoice_id = selectedInvoiceId;
      }

      const { error: updateErr } = await supabase
        .from('payment_reconciliation_records')
        .update(updatePayload)
        .eq('id', row.id);

      if (updateErr) {
        setResolveError(updateErr.message);
        setResolving(false);
        return;
      }

      const after = {
        status: newStatus,
        resolution: resolutionValue,
        invoice_id:
          resolutionAction === 'link_to_invoice' ? selectedInvoiceId : row.invoice_id,
        internal_notes: internalNotes.trim() || null,
      };

      await addAuditLog(wsId, user?.id ?? null, 'payment_reconciliation', row.id, 'resolve', {
        changeSummary,
        before,
        after,
      });

      setToast({
        message: `Record ${newStatus === 'resolved' ? 'resolved' : newStatus === 'ignored' ? 'ignored' : 'escalated'} successfully`,
        tone: 'success',
      });

      closeDetail();
      setInvoiceSelectorOpen(false);
      fetchRecords();
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : 'An unexpected error occurred');
    } finally {
      setResolving(false);
    }
  };

  // ─── Permission gate ───────────────────────────────────────────────────────

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payment Reconciliation" description="Review and resolve payment webhook discrepancies" />
        <ErrorState
          message="You don't have permission to view payment reconciliation records. Contact your workspace administrator if you need access."
        />
      </div>
    );
  }

  if (!wsId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payment Reconciliation" description="Review and resolve payment webhook discrepancies" />
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10" />}
          title="No active workspace"
          description="Select a workspace to view reconciliation records."
        />
      </div>
    );
  }

  // ─── Summary cards ─────────────────────────────────────────────────────────

  const summaryCards = [
    {
      label: 'Pending',
      value: summary.pending,
      tone: 'warning' as const,
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      label: 'Resolved',
      value: summary.resolved,
      tone: 'success' as const,
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      label: 'Ignored',
      value: summary.ignored,
      tone: 'neutral' as const,
      icon: <Ban className="h-4 w-4" />,
    },
    {
      label: 'Escalated',
      value: summary.escalated,
      tone: 'danger' as const,
      icon: <ShieldAlert className="h-4 w-4" />,
    },
  ];

  // ─── Filtered invoices for selector ────────────────────────────────────────

  const filteredInvoices = useMemo(() => {
    if (!invoiceSearch.trim()) return invoices;
    const q = invoiceSearch.trim().toLowerCase();
    return invoices.filter((i) => i.invoice_number.toLowerCase().includes(q));
  }, [invoices, invoiceSearch]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Reconciliation"
        description="Review and resolve payment webhook discrepancies"
        actions={
          <Button variant="outline" size="md" onClick={fetchRecords} disabled={loading}>
            <RefreshCw className={classNames('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{card.value}</p>
              </div>
              <div
                className={classNames(
                  'flex h-9 w-9 items-center justify-center rounded-lg',
                  card.tone === 'warning' && 'bg-amber-50 text-amber-600',
                  card.tone === 'success' && 'bg-emerald-50 text-emerald-600',
                  card.tone === 'neutral' && 'bg-slate-100 text-slate-500',
                  card.tone === 'danger' && 'bg-rose-50 text-rose-600',
                )}
              >
                {card.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <TextInput
                  placeholder="Payment ID, invoice no, client name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </Field>
          </div>
          <div className="sm:w-48">
            <Field label="Status">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="sm:w-56">
            <Field label="Issue Type">
              <Select value={issueTypeFilter} onChange={(e) => setIssueTypeFilter(e.target.value as IssueTypeFilter)}>
                {ISSUE_TYPE_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label="Loading reconciliation records…" />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchRecords} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-10 w-10" />}
            title="No reconciliation records"
            description="All payment webhook events have been matched successfully, or no records match the current filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Issue Type</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Client</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Expected</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Actual</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Razorpay Payment ID</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const currency = row.currency ?? row.invoice?.currency ?? 'INR';
                  const mismatch =
                    row.expected_amount != null &&
                    row.actual_amount != null &&
                    row.expected_amount !== row.actual_amount;
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                      onClick={() => openDetail(row)}
                    >
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={ISSUE_TYPE_LABELS[row.issue_type]}
                          tone={ISSUE_TYPE_TONES[row.issue_type]}
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.invoice?.invoice_number ? (
                          <span className="inline-flex items-center gap-1 font-medium">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            {row.invoice.invoice_number}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{clientDisplayName(row.client)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.expected_amount != null ? formatCurrency(row.expected_amount, currency) : '—'}
                      </td>
                      <td
                        className={classNames(
                          'px-4 py-3 font-medium',
                          mismatch ? 'text-rose-600' : 'text-slate-700',
                        )}
                      >
                        {row.actual_amount != null ? formatCurrency(row.actual_amount, currency) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {maskPaymentId(row.razorpay_payment_id)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={row.status}
                          tone={STATUS_TONES[row.status]}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(row);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ─── Detail Modal ──────────────────────────────────────────────────── */}
      <Modal
        open={detailOpen}
        onClose={closeDetail}
        title="Reconciliation Detail"
        size="xl"
      >
        {selectedRow && (
          <div className="space-y-5">
            {/* Header badges */}
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge
                status={ISSUE_TYPE_LABELS[selectedRow.issue_type]}
                tone={ISSUE_TYPE_TONES[selectedRow.issue_type]}
              />
              <StatusBadge
                status={selectedRow.status}
                tone={STATUS_TONES[selectedRow.status]}
              />
              {selectedRow.razorpay_payment_id && (
                <span className="font-mono text-xs text-slate-500">
                  {selectedRow.razorpay_payment_id}
                </span>
              )}
            </div>

            {/* Amount comparison */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">Expected Amount</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {selectedRow.expected_amount != null
                    ? formatCurrency(selectedRow.expected_amount, selectedRow.currency ?? 'INR')
                    : '—'}
                </p>
                {selectedRow.currency && (
                  <p className="mt-0.5 text-xs text-slate-400">{selectedRow.currency}</p>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">Actual Amount</p>
                <p
                  className={classNames(
                    'mt-1 text-lg font-semibold',
                    selectedRow.expected_amount != null &&
                      selectedRow.actual_amount != null &&
                      selectedRow.expected_amount !== selectedRow.actual_amount
                      ? 'text-rose-600'
                      : 'text-slate-900',
                  )}
                >
                  {selectedRow.actual_amount != null
                    ? formatCurrency(selectedRow.actual_amount, selectedRow.currency ?? 'INR')
                    : '—'}
                </p>
                {selectedRow.currency && (
                  <p className="mt-0.5 text-xs text-slate-400">{selectedRow.currency}</p>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">Difference</p>
                <p
                  className={classNames(
                    'mt-1 text-lg font-semibold',
                    selectedRow.expected_amount != null &&
                      selectedRow.actual_amount != null &&
                      selectedRow.expected_amount !== selectedRow.actual_amount
                      ? 'text-rose-600'
                      : 'text-emerald-600',
                  )}
                >
                  {selectedRow.expected_amount != null && selectedRow.actual_amount != null
                    ? formatCurrency(selectedRow.actual_amount - selectedRow.expected_amount, selectedRow.currency ?? 'INR')
                    : '—'}
                </p>
              </div>
            </div>

            {/* Invoice & Client details */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Invoice */}
              <Card className="p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <FileText className="h-4 w-4 text-slate-400" />
                  Invoice
                </div>
                {selectedRow.invoice ? (
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Number</dt>
                      <dd className="font-medium text-slate-900">{selectedRow.invoice.invoice_number}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Total</dt>
                      <dd className="text-slate-900">
                        {formatCurrency(selectedRow.invoice.total, selectedRow.invoice.currency ?? 'INR')}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Balance Due</dt>
                      <dd className="text-slate-900">
                        {formatCurrency(selectedRow.invoice.balance_due, selectedRow.invoice.currency ?? 'INR')}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Status</dt>
                      <dd>
                        <StatusBadge status={selectedRow.invoice.status} tone="neutral" />
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-slate-400">No invoice linked to this record.</p>
                )}
              </Card>

              {/* Client */}
              <Card className="p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <TrendingUp className="h-4 w-4 text-slate-400" />
                  Client
                </div>
                {selectedRow.client ? (
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Name</dt>
                      <dd className="font-medium text-slate-900">{clientDisplayName(selectedRow.client)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Contact</dt>
                      <dd className="text-slate-900">{selectedRow.client.contact_person}</dd>
                    </div>
                    {selectedRow.client.primary_email && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Email</dt>
                        <dd className="text-slate-900">{selectedRow.client.primary_email}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Phone</dt>
                      <dd className="text-slate-900">{selectedRow.client.primary_phone}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-slate-400">No client linked to this record.</p>
                )}
              </Card>
            </div>

            {/* Payment link info */}
            {selectedRow.payment_link && (
              <Card className="p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <ArrowRightLeft className="h-4 w-4 text-slate-400" />
                  Payment Link
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-slate-500">Original</dt>
                    <dd className="font-medium text-slate-900">
                      {formatCurrency(selectedRow.payment_link.original_amount, selectedRow.payment_link.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Paid</dt>
                    <dd className="font-medium text-slate-900">
                      {formatCurrency(selectedRow.payment_link.amount_paid, selectedRow.payment_link.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Outstanding</dt>
                    <dd className="font-medium text-slate-900">
                      {formatCurrency(selectedRow.payment_link.amount_outstanding, selectedRow.payment_link.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Status</dt>
                    <dd>
                      <StatusBadge status={selectedRow.payment_link.status} tone="neutral" />
                    </dd>
                  </div>
                </dl>
                {selectedRow.payment_link.short_url && (
                  <a
                    href={selectedRow.payment_link.short_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block truncate text-xs text-blue-600 hover:underline"
                  >
                    {selectedRow.payment_link.short_url}
                  </a>
                )}
              </Card>
            )}

            {/* Webhook event payload */}
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <AlertTriangle className="h-4 w-4 text-slate-400" />
                Webhook Event Payload
              </div>
              {selectedRow.webhook_event ? (
                <>
                  <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>
                      Event:{' '}
                      <span className="font-medium text-slate-700">
                        {selectedRow.webhook_event.event_type ?? '—'}
                      </span>
                    </span>
                    <span>
                      Received: {formatDateTime(selectedRow.webhook_event.received_at)}
                    </span>
                    <span>
                      Signature:{' '}
                      <span
                        className={classNames(
                          'font-medium',
                          selectedRow.webhook_event.signature_valid
                            ? 'text-emerald-600'
                            : 'text-rose-600',
                        )}
                      >
                        {selectedRow.webhook_event.signature_valid ? 'Valid' : 'Invalid'}
                      </span>
                    </span>
                    <span>
                      Processing:{' '}
                      <span className="font-medium text-slate-700">
                        {selectedRow.webhook_event.processing_status}
                      </span>
                    </span>
                  </div>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
                    {JSON.stringify(selectedRow.webhook_event.raw_payload ?? {}, null, 2)}
                  </pre>
                </>
              ) : (
                <p className="text-sm text-slate-400">No webhook event associated with this record.</p>
              )}
            </Card>

            {/* Existing resolution info */}
            {selectedRow.resolution && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="text-xs font-medium text-slate-500">Current Resolution</p>
                <p className="mt-1 font-mono text-slate-700">{selectedRow.resolution}</p>
                {selectedRow.resolved_at && (
                  <p className="mt-1 text-xs text-slate-400">
                    Resolved on {formatDateTime(selectedRow.resolved_at)}
                  </p>
                )}
              </div>
            )}

            {/* Resolution form */}
            {canResolve ? (
              <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
                <h3 className="text-sm font-semibold text-slate-800">Resolution</h3>

                <Field label="Action">
                  <Select
                    value={resolutionAction}
                    onChange={(e) => {
                      setResolutionAction(e.target.value as ResolutionAction);
                      setResolveError(null);
                    }}
                  >
                    {Object.entries(RESOLUTION_ACTION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>

                {/* Link to invoice — show selected invoice + selector button */}
                {resolutionAction === 'link_to_invoice' && (
                  <div className="space-y-2">
                    {selectedInvoiceId ? (
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-slate-400" />
                          <span className="font-medium text-slate-900">
                            {invoices.find((i) => i.id === selectedInvoiceId)?.invoice_number ??
                              selectedRow.invoice?.invoice_number ??
                              'Selected invoice'}
                          </span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={openInvoiceSelector}>
                          Change
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="md" onClick={openInvoiceSelector}>
                        <FileText className="h-4 w-4" />
                        Select Invoice
                      </Button>
                    )}
                  </div>
                )}

                {/* Ignore with reason — requires reason text */}
                {resolutionAction === 'ignore_with_reason' && (
                  <Field label="Reason" required error={undefined}>
                    <TextArea
                      placeholder="Explain why this reconciliation record is being ignored…"
                      value={ignoreReason}
                      onChange={(e) => setIgnoreReason(e.target.value)}
                      rows={3}
                    />
                  </Field>
                )}

                {/* Escalate — info only */}
                {resolutionAction === 'escalate' && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Escalating flags this record for manual investigation by an administrator. The record
                      status will be set to <strong>escalated</strong>.
                    </span>
                  </div>
                )}

                {/* Internal notes (shared) */}
                <Field label="Internal Notes" hint="Visible to your team only — not shared with the client.">
                  <TextArea
                    placeholder="Add any internal context about this resolution…"
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={3}
                  />
                </Field>

                {resolveError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {resolveError}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={closeDetail} disabled={resolving}>
                    Cancel
                  </Button>
                  <Button
                    variant={
                      resolutionAction === 'escalate'
                        ? 'danger'
                        : resolutionAction === 'ignore_with_reason'
                          ? 'warning'
                          : 'success'
                    }
                    onClick={submitResolution}
                    disabled={resolving}
                  >
                    {resolving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : resolutionAction === 'link_to_invoice' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : resolutionAction === 'ignore_with_reason' ? (
                      <Ban className="h-4 w-4" />
                    ) : (
                      <ShieldAlert className="h-4 w-4" />
                    )}
                    {RESOLUTION_ACTION_LABELS[resolutionAction]}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                <span>You have view-only access. Contact an administrator if you need to resolve reconciliation records.</span>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ─── Invoice Selector Modal ───────────────────────────────────────── */}
      <Modal
        open={invoiceSelectorOpen}
        onClose={() => setInvoiceSelectorOpen(false)}
        title="Select Invoice to Link"
        size="lg"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <TextInput
              placeholder="Search by invoice number…"
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {invoicesLoading ? (
            <LoadingState label="Loading invoices…" />
          ) : filteredInvoices.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-10 w-10" />}
              title="No invoices found"
              description="No non-cancelled invoices match your search."
            />
          ) : (
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {filteredInvoices.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => {
                    setSelectedInvoiceId(inv.id);
                    setInvoiceSelectorOpen(false);
                  }}
                  className={classNames(
                    'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors',
                    selectedInvoiceId === inv.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{inv.invoice_number}</p>
                      <p className="text-xs text-slate-500">
                        Total: {formatCurrency(inv.total)} · Balance: {formatCurrency(inv.balance)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={inv.status} tone="neutral" />
                    {selectedInvoiceId === inv.id && (
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="outline" onClick={() => setInvoiceSelectorOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={classNames(
            'fixed bottom-4 right-4 z-[60] rounded-lg px-4 py-3 text-sm text-white shadow-lg',
            toast.tone === 'success' ? 'bg-emerald-600' : 'bg-rose-600',
          )}
        >
          {toast.message}
          <button
            className="ml-3 text-white/70 hover:text-white"
            onClick={() => setToast(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
