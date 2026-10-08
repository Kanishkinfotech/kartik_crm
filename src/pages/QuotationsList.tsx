import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { addTimelineEvent, addAuditLog, nextEntityNumber } from '@/lib/data';
import type { Quotation, QuotationStatus, Client, Service, QuotationRevision, QuotationItem } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone, Modal, Field, TextInput, TextArea, Select, ConfirmDialog } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { LineItemsEditor, newLine, computeEditableTotals, type EditableLine } from '@/components/LineItemsEditor';
import { computeLine, computeDocTotals } from '@/lib/finance';
import { Plus, FileText, ArrowLeft, Save, Eye, GitCompare, CheckCircle2, XCircle, Send, Copy, FileDown, Link as LinkIcon, Clock, FolderKanban, Sparkles } from 'lucide-react';
import { formatCurrency, formatDate, classNames } from '@/lib/format';
import { printDocument } from '@/lib/pdfGenerator';
import { can } from '@/lib/permissions';
import { CreateProjectModal } from '@/pages/ProjectsList';
import { SendEmailModal } from '@/components/SendEmailModal';
import { SendWhatsAppModal } from '@/components/SendWhatsAppModal';
import { Mail, MessageCircle, Receipt } from 'lucide-react';
import { generateAIContent } from '@/lib/ai';
import { validateQuotationDates, getDefaultValidUntil } from '@/lib/quotationValidation';

const STATUS_TONE: Record<QuotationStatus, BadgeTone> = {
  draft: 'neutral', internal_review: 'info', sent: 'info', viewed: 'info',
  under_discussion: 'warning', revision_requested: 'warning', approved: 'success',
  rejected: 'danger', expired: 'danger', cancelled: 'neutral', converted: 'brand',
};

const STATUSES: QuotationStatus[] = ['draft', 'internal_review', 'sent', 'viewed', 'under_discussion', 'revision_requested', 'approved', 'rejected', 'expired', 'cancelled', 'converted'];

export function QuotationsList() {
  const { activeWorkspace, role } = useWorkspace();
  const { navigate } = useRouter();
  const [rows, setRows] = useState<(Quotation & { client_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('quotations')
      .select('*, clients!inner(business_name, contact_person)')
      .eq('workspace_id', activeWorkspace.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) { setError(describeDbError(error)); setLoading(false); return; }
    const mapped = (data ?? []).map((q: Quotation & { clients?: { business_name: string | null; contact_person: string } }) => ({
      ...q,
      client_name: q.clients?.business_name ?? q.clients?.contact_person ?? '—',
    }));
    setRows(mapped);
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const filtered = statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter);

  const columns: Column<(Quotation & { client_name?: string })>[] = [
    { key: 'num', header: 'Number', sortValue: (q) => q.quotation_number, render: (q) => <span className="font-mono text-xs text-slate-600">{q.quotation_number}</span> },
    { key: 'client', header: 'Client', sortValue: (q) => q.client_name ?? '', render: (q) => <span className="font-medium text-slate-900">{q.client_name}</span> },
    { key: 'subject', header: 'Subject', render: (q) => <span className="text-slate-600">{q.subject ?? '—'}</span> },
    { key: 'date', header: 'Date', sortValue: (q) => q.quotation_date, render: (q) => <span className="text-slate-500">{formatDate(q.quotation_date)}</span> },
    { key: 'valid', header: 'Valid until', sortValue: (q) => q.valid_until ?? '', render: (q) => <span className="text-slate-500">{formatDate(q.valid_until)}</span> },
    { key: 'total', header: 'Total', sortValue: (q) => Number(q.total), render: (q) => <span className="font-medium text-slate-700">{formatCurrency(Number(q.total), q.currency)}</span> },
    { key: 'ver', header: 'Ver', sortValue: (q) => q.version, render: (q) => <span className="text-slate-500">v{q.version}</span> },
    { key: 'status', header: 'Status', sortValue: (q) => q.status, render: (q) => <StatusBadge status={q.status} tone={STATUS_TONE[q.status]} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotations"
        description="Create, track and convert professional quotations."
        actions={can(role, 'quotations.create') && <Button onClick={() => navigate('/quotations/new')}><Plus className="h-4 w-4" /> New quotation</Button>}
      />

      {loading ? <LoadingState /> :
        error ? <ErrorState message={error} onRetry={load} /> :
        rows.length === 0 ? (
          <EmptyState icon={<FileText className="h-10 w-10" />} title="No quotations yet" description="Create your first quotation to start tracking client approvals." action={can(role, 'quotations.create') && <Button onClick={() => navigate('/quotations/new')}><Plus className="h-4 w-4" /> New quotation</Button>} />
        ) : (
          <Card className="p-4">
            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(q) => q.id}
              onRowClick={(q) => navigate(`/quotations/${q.id}`)}
              searchKeys={(q) => `${q.quotation_number} ${q.client_name} ${q.subject ?? ''} ${q.status}`}
              toolbar={
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
                  <option value="all">All statuses</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </Select>
              }
              empty="No quotations match your filters."
            />
          </Card>
        )
      }
    </div>
  );
}

export function QuotationEditor({ quotationId }: { quotationId: string | null }) {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const isNew = quotationId === null;

  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [existing, setExisting] = useState<Quotation | null>(null);
  const [revisions, setRevisions] = useState<QuotationRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  const [clientId, setClientId] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [quotationDate, setQuotationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState(() => getDefaultValidUntil(new Date().toISOString().slice(0, 10), 30));
  const [currency, setCurrency] = useState('INR');
  const [subject, setSubject] = useState('');
  const [introduction, setIntroduction] = useState('');
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [timeline, setTimeline] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('50% advance, 50% on delivery');
  const [terms, setTerms] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [lines, setLines] = useState<EditableLine[]>([newLine()]);
  const [docDiscount, setDocDiscount] = useState(0);
  const [isInterState, setIsInterState] = useState(false);
  const [status, setStatus] = useState<QuotationStatus>('draft');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showConvertProject, setShowConvertProject] = useState(false);
  const [showSendEmail, setShowSendEmail] = useState(false);
  const [showSendWhatsApp, setShowSendWhatsApp] = useState(false);

  useEffect(() => {
    if (!activeWorkspace) return;
    Promise.all([
      supabase.from('clients').select('*').eq('workspace_id', activeWorkspace.id).eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('services').select('*').eq('workspace_id', activeWorkspace.id).order('name'),
    ]).then(([c, s]) => {
      setClients((c.data ?? []) as Client[]);
      setServices((s.data ?? []) as Service[]);
    });
  }, [activeWorkspace]);

  const loadExisting = useCallback(async () => {
    if (!activeWorkspace || !quotationId) return;
    setLoading(true);
    const { data: q } = await supabase.from('quotations').select('*').eq('id', quotationId).eq('workspace_id', activeWorkspace.id).eq('is_deleted', false).maybeSingle();
    if (!q) { setError('Quotation not found.'); setLoading(false); return; }
    const qt = q as Quotation;
    setExisting(qt);
    setClientId(qt.client_id ?? '');
    setContactPerson(qt.contact_person ?? '');
    setQuotationDate(qt.quotation_date);
    // Ensure validUntil is on or after quotation_date
    const safeValidUntil = (qt.valid_until && qt.valid_until >= qt.quotation_date)
      ? qt.valid_until
      : getDefaultValidUntil(qt.quotation_date, 30);
    setValidUntil(safeValidUntil);
    setCurrency(qt.currency);
    setSubject(qt.subject ?? '');
    setIntroduction(qt.introduction ?? '');
    setScopeOfWork(qt.scope_of_work ?? '');
    setDeliverables(qt.deliverables ?? '');
    setTimeline(qt.timeline ?? '');
    setPaymentTerms(qt.payment_terms ?? '');
    setTerms(qt.terms_and_conditions ?? '');
    setExclusions(qt.exclusions ?? '');
    setNotes(qt.notes ?? '');
    setInternalNotes(qt.internal_notes ?? '');
    setStatus(qt.status);
    setRejectionReason(qt.rejection_reason ?? '');

    const { data: items } = await supabase.from('quotation_items').select('*').eq('quotation_id', quotationId).order('sort_order');
    const itemRows = (items ?? []) as QuotationItem[];
    setLines(itemRows.length > 0 ? itemRows.map((it) => ({ id: it.id ?? `db-${it.sort_order}`, service_id: it.service_id, description: it.description, hsn_sac: it.hsn_sac, quantity: Number(it.quantity), unit: it.unit, rate: Number(it.rate), discount_type: 'amount' as const, discount_amount: Number(it.discount_amount), discount_percent: 0, tax_percent: Number(it.tax_percent) })) : [newLine()]);

    const { data: revs } = await supabase.from('quotation_revisions').select('*').eq('quotation_id', quotationId).order('version', { ascending: false });
    setRevisions((revs ?? []) as QuotationRevision[]);

    if (qt.client_id) {
      const { data: cl } = await supabase.from('clients').select('state').eq('id', qt.client_id).maybeSingle();
      setIsInterState(Boolean(cl && (cl as { state: string | null }).state && (cl as { state: string | null }).state !== 'Karnataka'));
    }

    setLoading(false);
  }, [activeWorkspace, quotationId]);

  const handleQuotationDateChange = (newDate: string) => {
    setQuotationDate(newDate);
    // Automatically advance validUntil if it is missing or earlier than the new quotation date
    if (!validUntil || validUntil < newDate) {
      setValidUntil(getDefaultValidUntil(newDate, 30));
    }
  };

  const handleValidUntilChange = (newDate: string) => {
    setValidUntil(newDate);
  };

  useEffect(() => { if (isNew) setLoading(false); else loadExisting(); }, [isNew, loadExisting]);

  const draftWithAI = async (field: 'introduction' | 'scopeOfWork' | 'deliverables' | 'timeline' | 'terms') => {
    if (!activeWorkspace || !clientId) {
      alert("Please select a client first.");
      return;
    }
    setBusy(true);
    try {
      const fieldCurrent = { introduction, scopeOfWork, deliverables, timeline, terms }[field];
      const response = await generateAIContent({
        workspace_id: activeWorkspace.id,
        feature_name: `draft_quotation_${field}`,
        module_name: "quotations",
        userInstruction: `Draft the ${field} for a quotation. Subject: ${subject}. Current content: ${fieldCurrent}`,
        systemInstruction: "You are an assistant drafting a section of a business quotation. Provide concise, professional text suitable for the requested section. Do not include introductory conversational text.",
      });

      if (response.success && response.content) {
        if (field === 'introduction') setIntroduction(response.content);
        if (field === 'scopeOfWork') setScopeOfWork(response.content);
        if (field === 'deliverables') setDeliverables(response.content);
        if (field === 'timeline') setTimeline(response.content);
        if (field === 'terms') setTerms(response.content);
      } else {
        throw new Error(response.error || "Failed to generate draft");
      }
    } catch (err: any) {
      alert(err.message || "AI Draft failed");
    }
    setBusy(false);
  };

  const { totals } = computeEditableTotals(lines, isInterState, docDiscount);

  const save = async (asStatus?: QuotationStatus) => {
    if (!activeWorkspace) return;
    if (!clientId) { setError('Please select a client.'); return; }
    if (lines.length === 0 || lines.every((l) => !l.description.trim())) { setError('Add at least one line item.'); return; }

    const invalidLine = lines.find((l) => l.description.trim() && (Number(l.quantity) <= 0 || Number(l.rate) < 0));
    if (invalidLine) {
      setError('Line item quantity must be greater than 0 and rate cannot be negative.');
      return;
    }

    const descriptions = lines.map((l) => l.description.trim().toLowerCase()).filter(Boolean);
    const hasDupDesc = descriptions.some((d, idx) => descriptions.indexOf(d) !== idx);
    if (hasDupDesc) {
      setError('Duplicate line items detected. Please combine quantities or provide distinct descriptions.');
      return;
    }
    
    // Date Range Validation Rule: valid_until >= quotation_date
    const dateValidation = validateQuotationDates(quotationDate, validUntil);
    if (!dateValidation.valid) {
      setError(dateValidation.error || 'Valid until date must be on or after the quotation date.');
      return;
    }

    setBusy(true);
    setError(null);
    const targetStatus = asStatus ?? status;

    const itemRows = lines.filter((l) => l.description.trim()).map((l, i) => {
      const c = computeLine({ quantity: l.quantity, rate: l.rate, discount_type: l.discount_type, discount_amount: l.discount_amount, discount_percent: l.discount_percent, tax_percent: l.tax_percent, isInterState });
      return { service_id: l.service_id, description: l.description.trim(), hsn_sac: l.hsn_sac, quantity: l.quantity, unit: l.unit, rate: l.rate, discount_amount: l.discount_amount, tax_percent: l.tax_percent, line_total: c.lineTotal, sort_order: i };
    });
    const finalTotals = computeDocTotals(itemRows.map((l) => computeLine({ quantity: l.quantity, rate: l.rate, discount_type: 'amount', discount_amount: l.discount_amount, discount_percent: 0, tax_percent: l.tax_percent, isInterState })), docDiscount);

    const headerFields = {
      client_id: clientId, contact_person: contactPerson || null, quotation_date: quotationDate, valid_until: validUntil || null,
      currency, subject: subject || null, introduction: introduction || null, scope_of_work: scopeOfWork || null,
      deliverables: deliverables || null, timeline: timeline || null, payment_terms: paymentTerms || null,
      terms_and_conditions: terms || null, exclusions: exclusions || null, notes: notes || null, internal_notes: internalNotes || null,
      subtotal: finalTotals.subtotal, discount_amount: finalTotals.discountAmount, tax_amount: finalTotals.taxAmount,
      round_off: finalTotals.roundOff, total: finalTotals.total, status: targetStatus,
    };

    let qid = quotationId;
    if (isNew) {
      const qnum = await nextEntityNumber(activeWorkspace.id, 'quotations', 'QTN');
      const { data, error: insErr } = await supabase.from('quotations').insert({
        ...headerFields, workspace_id: activeWorkspace.id, quotation_number: qnum, version: 1, created_by: user?.id ?? null,
      }).select().single();
      if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }
      qid = (data as Quotation).id;
      setExisting(data as Quotation);
      await supabase.from('quotation_items').insert(itemRows.map((r) => ({ ...r, workspace_id: activeWorkspace.id, quotation_id: qid })));
      await supabase.from('quotation_revisions').insert({ workspace_id: activeWorkspace.id, quotation_id: qid, version: 1, status_snapshot: targetStatus, subtotal: finalTotals.subtotal, discount_amount: finalTotals.discountAmount, tax_amount: finalTotals.taxAmount, round_off: finalTotals.roundOff, total: finalTotals.total, items_snapshot: itemRows as unknown as never, header_snapshot: headerFields as unknown as never, created_by: user?.id ?? null });
      await addTimelineEvent(activeWorkspace.id, clientId, 'quotation_created', { title: 'Quotation created', description: `${qnum} for ${formatCurrency(finalTotals.total, currency)}`, actorId: user?.id ?? null, relatedEntityType: 'quotation', relatedEntityId: qid });
      await addAuditLog(activeWorkspace.id, user?.id ?? null, 'quotation', qid, 'create', { changeSummary: `Created quotation ${qnum}` });
    } else {
      const newVersion = (existing?.version ?? 1) + 1;
      const { error: updErr } = await supabase.from('quotations').update({ ...headerFields, version: newVersion, updated_at: new Date().toISOString() }).eq('id', qid).eq('workspace_id', activeWorkspace.id);
      if (updErr) { setError(describeDbError(updErr)); setBusy(false); return; }
      await supabase.from('quotation_items').delete().eq('quotation_id', qid);
      await supabase.from('quotation_items').insert(itemRows.map((r) => ({ ...r, workspace_id: activeWorkspace.id, quotation_id: qid })));
      await supabase.from('quotation_revisions').insert({ workspace_id: activeWorkspace.id, quotation_id: qid, version: newVersion, status_snapshot: targetStatus, subtotal: finalTotals.subtotal, discount_amount: finalTotals.discountAmount, tax_amount: finalTotals.taxAmount, round_off: finalTotals.roundOff, total: finalTotals.total, items_snapshot: itemRows as unknown as never, header_snapshot: headerFields as unknown as never, created_by: user?.id ?? null });
      await addAuditLog(activeWorkspace.id, user?.id ?? null, 'quotation', qid, 'update', { changeSummary: `Revised quotation to v${newVersion}` });
      if (clientId) await addTimelineEvent(activeWorkspace.id, clientId, 'quotation_revised', { title: `Quotation revised to v${newVersion}`, actorId: user?.id ?? null, relatedEntityType: 'quotation', relatedEntityId: qid });
    }
    setBusy(false);
    navigate(`/quotations/${qid}`);
  };

  const approve = async () => {
    if (!activeWorkspace || !existing) return;
    setBusy(true);
    await supabase.from('quotations').update({ status: 'approved', approved_by: user?.id ?? null, approval_date: new Date().toISOString() }).eq('id', existing.id).eq('workspace_id', activeWorkspace.id);
    await addAuditLog(activeWorkspace.id, user?.id ?? null, 'quotation', existing.id, 'approve', { changeSummary: 'Quotation approved' });
    if (existing.client_id) await addTimelineEvent(activeWorkspace.id, existing.client_id, 'quotation_approved', { title: 'Quotation approved', actorId: user?.id ?? null, relatedEntityType: 'quotation', relatedEntityId: existing.id });
    setBusy(false);
    loadExisting();
  };

  const reject = async () => {
    if (!activeWorkspace || !existing || !rejectionReason.trim()) return;
    setBusy(true);
    await supabase.from('quotations').update({ status: 'rejected', rejection_reason: rejectionReason.trim() }).eq('id', existing.id).eq('workspace_id', activeWorkspace.id);
    await addAuditLog(activeWorkspace.id, user?.id ?? null, 'quotation', existing.id, 'reject', { changeSummary: `Rejected: ${rejectionReason.trim()}` });
    if (existing.client_id) await addTimelineEvent(activeWorkspace.id, existing.client_id, 'quotation_rejected', { title: 'Quotation rejected', description: rejectionReason.trim(), actorId: user?.id ?? null, relatedEntityType: 'quotation', relatedEntityId: existing.id });
    setBusy(false);
    setShowReject(false);
    loadExisting();
  };

  const duplicate = async () => {
    if (!activeWorkspace || !existing) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const duplicateValidUntil = (existing.valid_until && existing.valid_until >= todayStr)
      ? existing.valid_until
      : getDefaultValidUntil(todayStr, 30);
    const qnum = await nextEntityNumber(activeWorkspace.id, 'quotations', 'QTN');
    const { data } = await supabase.from('quotations').insert({
      workspace_id: activeWorkspace.id, quotation_number: qnum, version: 1, status: 'draft',
      client_id: existing.client_id, contact_person: existing.contact_person, quotation_date: todayStr,
      valid_until: duplicateValidUntil, currency: existing.currency, subject: existing.subject, introduction: existing.introduction,
      scope_of_work: existing.scope_of_work, deliverables: existing.deliverables, timeline: existing.timeline,
      payment_terms: existing.payment_terms, terms_and_conditions: existing.terms_and_conditions, exclusions: existing.exclusions,
      notes: existing.notes, internal_notes: existing.internal_notes, subtotal: existing.subtotal, discount_amount: existing.discount_amount,
      tax_amount: existing.tax_amount, round_off: existing.round_off, total: existing.total, created_by: user?.id ?? null,
    }).select().single();
    if (data) {
      const { data: items } = await supabase.from('quotation_items').select('*').eq('quotation_id', existing.id);
      if (items && items.length) await supabase.from('quotation_items').insert((items as QuotationItem[]).map((it) => ({ workspace_id: activeWorkspace.id, quotation_id: (data as Quotation).id, service_id: it.service_id, description: it.description, hsn_sac: it.hsn_sac, quantity: it.quantity, unit: it.unit, rate: it.rate, discount_amount: it.discount_amount, tax_percent: it.tax_percent, line_total: it.line_total, sort_order: it.sort_order })));
      navigate(`/quotations/${(data as Quotation).id}`);
    }
  };

  const copyShareLink = () => {
    if (!existing) return;
    const url = `${window.location.origin}/#/share/quotation/${existing.share_token}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  if (loading) return <LoadingState label="Loading quotation…" />;

  const readOnly = Boolean(existing && (existing.status === 'approved' || existing.status === 'converted' || existing.status === 'rejected' || existing.status === 'cancelled'));

  const AILabel = ({ text, field }: { text: string, field: 'introduction' | 'scopeOfWork' | 'deliverables' | 'timeline' | 'terms' }) => (
    <div className="flex w-full items-center justify-between">
      <span>{text}</span>
      {!readOnly && (
        <button type="button" onClick={(e) => { e.preventDefault(); draftWithAI(field); }} className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded transition-colors disabled:opacity-50" disabled={busy}>
          <Sparkles className="h-3 w-3" /> Draft with AI
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/quotations')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">{isNew ? 'New quotation' : existing?.quotation_number}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{isNew ? 'Create a quotation for a client' : `Version ${existing?.version} · ${formatCurrency(Number(existing?.total), currency)}`}</p>
        </div>
        {existing && <StatusBadge status={existing.status} tone={STATUS_TONE[existing.status]} />}
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">Quotation details</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Client" required>
                <Select value={clientId} onChange={(e) => { setClientId(e.target.value); const c = clients.find((x) => x.id === e.target.value); if (c) { setContactPerson(c.contact_person); setIsInterState(!!c.state && c.state !== 'Karnataka'); } }} disabled={readOnly}>
                  <option value="">Select client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.business_name || c.contact_person}</option>)}
                </Select>
              </Field>
              <Field label="Contact person"><TextInput value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} disabled={readOnly} /></Field>
              <Field label="Quotation date" required>
                <TextInput 
                  type="date" 
                  value={quotationDate} 
                  onChange={(e) => handleQuotationDateChange(e.target.value)} 
                  disabled={readOnly} 
                />
              </Field>
              <Field 
                label="Valid until"
                error={validUntil && quotationDate && validUntil < quotationDate ? 'Valid until date must be on or after the quotation date.' : undefined}
                hint={validUntil && quotationDate && validUntil < quotationDate ? undefined : 'Must be on or after quotation date'}
              >
                <TextInput 
                  type="date" 
                  value={validUntil} 
                  min={quotationDate}
                  onChange={(e) => handleValidUntilChange(e.target.value)} 
                  disabled={readOnly} 
                />
              </Field>
              <Field label="Currency"><Select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={readOnly}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option></Select></Field>
              <Field label="Subject"><TextInput value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Website development proposal" disabled={readOnly} /></Field>
            </div>
            <div className="mt-4 space-y-4">
              <Field label={<AILabel text="Introduction" field="introduction" />}><TextArea value={introduction} onChange={(e) => setIntroduction(e.target.value)} disabled={readOnly} /></Field>
              <Field label={<AILabel text="Scope of work" field="scopeOfWork" />}><TextArea value={scopeOfWork} onChange={(e) => setScopeOfWork(e.target.value)} disabled={readOnly} /></Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={<AILabel text="Deliverables" field="deliverables" />}><TextArea value={deliverables} onChange={(e) => setDeliverables(e.target.value)} disabled={readOnly} /></Field>
                <Field label={<AILabel text="Timeline" field="timeline" />}><TextArea value={timeline} onChange={(e) => setTimeline(e.target.value)} disabled={readOnly} /></Field>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Line items</h3>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={isInterState} onChange={(e) => setIsInterState(e.target.checked)} disabled={readOnly} />
                Inter-state (apply IGST)
              </label>
            </div>
            <LineItemsEditor lines={lines} onChange={setLines} services={services} isInterState={isInterState} docDiscount={docDiscount} currency={currency} />
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">Terms & notes</h3>
            <div className="space-y-4">
              <Field label="Payment terms">
                <Select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} disabled={readOnly}>
                  <option value="">Select...</option>
                  <option value="Due on Receipt">Due on Receipt</option>
                  <option value="Advance">Advance</option>
                  <option value="Net 15">Net 15</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 45">Net 45</option>
                  <option value="Net 60">Net 60</option>
                  <option value="Net 90">Net 90</option>
                </Select>
              </Field>
              <Field label={<AILabel text="Terms & conditions" field="terms" />}><TextArea value={terms} onChange={(e) => setTerms(e.target.value)} disabled={readOnly} /></Field>
              <Field label="Exclusions"><TextArea value={exclusions} onChange={(e) => setExclusions(e.target.value)} disabled={readOnly} /></Field>
              <Field label="Notes (client-visible)"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} /></Field>
              <Field label="Internal notes"><TextArea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} disabled={readOnly} /></Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="text-slate-700">{formatCurrency(totals.subtotal, currency)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="text-slate-700">{formatCurrency(totals.discountAmount, currency)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="text-slate-700">{formatCurrency(totals.taxAmount, currency)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span>{formatCurrency(totals.total, currency)}</span></div>
            </div>
            <div className="mt-4 space-y-2">
              {!readOnly ? (
                <>
                  <Button className="w-full" onClick={() => save('draft')} disabled={busy}><Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save as draft'}</Button>
                  <Button variant="secondary" className="w-full" onClick={() => save('internal_review')} disabled={busy}>Save for review</Button>
                </>
              ) : (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">This quotation is {existing?.status}. Create a revision to edit.</div>
              )}
            </div>
          </Card>

          {existing && (
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-700">Actions</h3>
              <div className="space-y-2">
                {can(role, 'quotations.approve') && existing.status !== 'approved' && existing.status !== 'converted' && (
                  <Button variant="secondary" className="w-full" onClick={approve} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Mark approved</Button>
                )}
                {can(role, 'quotations.approve') && existing.status !== 'approved' && existing.status !== 'converted' && existing.status !== 'rejected' && (
                  <Button variant="outline" className="w-full" onClick={() => setShowReject(true)} disabled={busy}><XCircle className="h-4 w-4" /> Record rejection</Button>
                )}
                {can(role, 'quotations.create') && <Button variant="outline" className="w-full" onClick={duplicate} disabled={busy}><Copy className="h-4 w-4" /> Duplicate</Button>}
                <Button variant="outline" className="w-full" onClick={() => {
                  if (!existing) return;
                  const c = clients.find((x) => x.id === existing.client_id);
                  printDocument({
                    docType: 'Quotation',
                    docNumber: existing.quotation_number,
                    docDate: existing.quotation_date,
                    dueDateOrValidUntil: existing.valid_until,
                    clientName: c?.business_name || c?.contact_person || 'Client',
                    clientGstin: c?.gstin,
                    billingAddress: c?.billing_address,
                    placeOfSupply: c?.state,
                    currency: existing.currency,
                    items: lines.filter((l) => l.description.trim()).map((l) => ({
                      description: l.description,
                      hsn_sac: l.hsn_sac,
                      quantity: l.quantity,
                      unit: l.unit,
                      rate: l.rate,
                      discount_amount: l.discount_amount,
                      tax_percent: l.tax_percent,
                      line_total: (l.quantity * l.rate) - (l.discount_amount || 0),
                    })),
                    subtotal: Number(existing.subtotal || totals.subtotal),
                    discountAmount: Number(existing.discount_amount || totals.discountAmount),
                    taxAmount: Number(existing.tax_amount || totals.taxAmount),
                    total: Number(existing.total || totals.total),
                    paymentTerms: existing.payment_terms,
                    termsAndConditions: existing.terms_and_conditions,
                    notes: existing.notes,
                    isInterState,
                  });
                }} disabled={busy}><FileDown className="h-4 w-4" /> Download PDF</Button>
                <Button variant="outline" className="w-full" onClick={copyShareLink} disabled={busy}><LinkIcon className="h-4 w-4" /> {shareCopied ? 'Link copied!' : 'Copy share link'}</Button>
                {can(role, 'email.send') && existing.client_id && (() => { const c = clients.find((x) => x.id === existing.client_id); return c?.primary_email ? <Button variant="outline" className="w-full" onClick={() => setShowSendEmail(true)}><Mail className="h-4 w-4" /> Send by email</Button> : null; })()}
                {can(role, 'whatsapp.send') && existing.client_id && (() => { const c = clients.find((x) => x.id === existing.client_id); return (c?.whatsapp_number || c?.primary_phone) ? <Button variant="outline" className="w-full" onClick={() => setShowSendWhatsApp(true)}><MessageCircle className="h-4 w-4" /> Send by WhatsApp</Button> : null; })()}
                {revisions.length > 1 && <Button variant="outline" className="w-full" onClick={() => setShowCompare(true)}><GitCompare className="h-4 w-4" /> Compare revisions ({revisions.length})</Button>}
                {existing.status === 'approved' && (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                      Approved — ready to convert to a project.
                    </div>
                    {can(role, 'project.create') && (
                      <Button variant="primary" className="w-full" onClick={() => { setShowConvertProject(true); }} disabled={busy}>
                        <FolderKanban className="h-4 w-4" /> Convert to project
                      </Button>
                    )}
                    {can(role, 'invoices.create') && (
                      <Button variant="outline" className="w-full mt-2" onClick={() => navigate(`/invoices/new?quotation_id=${existing.id}`)} disabled={busy}>
                        <Receipt className="h-4 w-4" /> Convert to invoice
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          {revisions.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Clock className="h-4 w-4 text-slate-400" /> Revision history</h3>
              <ol className="space-y-2">
                {revisions.map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">v{r.version}</span>
                    <span className="text-slate-500">{formatCurrency(Number(r.total), currency)}</span>
                    <StatusBadge status={r.status_snapshot} tone={STATUS_TONE[r.status_snapshot as QuotationStatus] ?? 'neutral'} />
                    <span className="text-xs text-slate-400">{formatDate(r.created_at)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>

      <Modal open={showReject} onClose={() => setShowReject(false)} title="Record rejection reason" size="sm">
        <Field label="Rejection reason" required><TextArea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} /></Field>
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button><Button variant="danger" onClick={reject} disabled={busy || !rejectionReason.trim()}>Record rejection</Button></div>
      </Modal>

      <Modal open={showCompare} onClose={() => setShowCompare(false)} title="Revision comparison" size="lg">
        {revisions.length === 0 ? <p className="text-sm text-slate-500">No revisions recorded.</p> : (
          <div className="space-y-4">
            {revisions.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-slate-700">Version {r.version}</span>
                  <div className="flex items-center gap-2 text-xs text-slate-400"><StatusBadge status={r.status_snapshot} tone={STATUS_TONE[r.status_snapshot as QuotationStatus] ?? 'neutral'} /> {formatDate(r.created_at)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div><span className="text-slate-400">Subtotal:</span> {formatCurrency(Number(r.subtotal), currency)}</div>
                  <div><span className="text-slate-400">Tax:</span> {formatCurrency(Number(r.tax_amount), currency)}</div>
                  <div><span className="text-slate-400">Discount:</span> {formatCurrency(Number(r.discount_amount), currency)}</div>
                  <div><span className="text-slate-400">Total:</span> <span className="font-semibold">{formatCurrency(Number(r.total), currency)}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {showConvertProject && existing && (
        <CreateProjectModal
          onClose={() => setShowConvertProject(false)}
          onCreated={(id) => { setShowConvertProject(false); navigate(`/projects/${id}`); }}
          preselectQuotationId={existing.id}
        />
      )}

      {showSendEmail && existing && (() => { const c = clients.find((x) => x.id === existing.client_id); return (
        <SendEmailModal
          open={showSendEmail}
          onClose={() => setShowSendEmail(false)}
          to={c?.primary_email ?? ''}
          toName={c?.business_name ?? c?.contact_person}
          subject={`Quotation ${existing.quotation_number}${existing.subject ? ' — ' + existing.subject : ''}`}
          bodyHtml={`<p>Dear ${existing.contact_person || c?.contact_person || 'Client'},</p><p>Please find our quotation <strong>${existing.quotation_number}</strong> attached for your review.</p><p>Quotation total: <strong>${formatCurrency(Number(existing.total), existing.currency)}</strong></p><p>Valid until: ${existing.valid_until ? formatDate(existing.valid_until) : 'N/A'}</p><p>You can view the quotation online: <a href="${window.location.origin}/#/share/quotation/${existing.share_token}">${window.location.origin}/#/share/quotation/${existing.share_token}</a></p><p>We look forward to your response.</p>`}
          attachmentContext={{ entity_type: 'quotation', entity_id: existing.id, entity_number: existing.quotation_number }}
        />
      ); })()}

      {showSendWhatsApp && existing && (() => { const c = clients.find((x) => x.id === existing.client_id); return (
        <SendWhatsAppModal
          open={showSendWhatsApp}
          onClose={() => setShowSendWhatsApp(false)}
          toPhone={c?.whatsapp_number || c?.primary_phone || ''}
          clientId={existing.client_id ?? undefined}
          templateName="quotation_sent"
          context={{ entity_type: 'quotation', entity_id: existing.id, entity_number: existing.quotation_number }}
        />
      ); })()}
    </div>
  );
}
