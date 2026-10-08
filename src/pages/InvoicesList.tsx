import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { addTimelineEvent, addAuditLog, nextEntityNumber } from '@/lib/data';
import type { Invoice, InvoiceStatus, InvoiceType, InvoiceItem, Client, Service, Payment, PaymentAllocation, Quotation } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone, Modal, Field, TextInput, TextArea, Select } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { LineItemsEditor, newLine, computeEditableTotals, type EditableLine } from '@/components/LineItemsEditor';
import { computeLine, computeDocTotals } from '@/lib/finance';
import { Plus, Receipt, ArrowLeft, Save, CreditCard, Link as LinkIcon, Send, Copy, Mail, MessageCircle, Zap, ChevronDown, FileDown, Edit } from 'lucide-react';
import { formatCurrency, formatDate, financialYear, classNames } from '@/lib/format';
import { printDocument } from '@/lib/pdfGenerator';
import { can } from '@/lib/permissions';
import { SendEmailModal } from '@/components/SendEmailModal';
import { SendWhatsAppModal } from '@/components/SendWhatsAppModal';

const STATUS_TONE: Record<InvoiceStatus, BadgeTone> = {
  draft: 'neutral', sent: 'info', viewed: 'info', partially_paid: 'warning',
  paid: 'success', overdue: 'danger', cancelled: 'neutral', written_off: 'danger',
};

const INVOICE_TYPES: InvoiceType[] = ['tax_invoice', 'proforma', 'advance', 'milestone', 'recurring', 'final', 'credit_note'];

export function InvoicesList() {
  const { activeWorkspace, role } = useWorkspace();
  const { navigate } = useRouter();
  const [rows, setRows] = useState<(Invoice & { client_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('invoices')
      .select('*, clients!inner(business_name, contact_person)')
      .eq('workspace_id', activeWorkspace.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) { setError(describeDbError(error)); setLoading(false); return; }
    setRows((data ?? []).map((i: Invoice & { clients?: { business_name: string | null; contact_person: string } }) => ({ ...i, client_name: i.clients?.business_name ?? i.clients?.contact_person ?? '—' })));
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => (statusFilter === 'all' || r.status === statusFilter) && (typeFilter === 'all' || r.invoice_type === typeFilter));

  const columns: Column<(Invoice & { client_name?: string })>[] = [
    { key: 'num', header: 'Number', sortValue: (i) => i.invoice_number, render: (i) => <span className="font-mono text-xs text-slate-600">{i.invoice_number}</span> },
    { key: 'client', header: 'Client', sortValue: (i) => i.client_name ?? '', render: (i) => <span className="font-medium text-slate-900">{i.client_name}</span> },
    { key: 'type', header: 'Type', sortValue: (i) => i.invoice_type, render: (i) => <span className="capitalize text-slate-600">{i.invoice_type.replace(/_/g, ' ')}</span> },
    { key: 'date', header: 'Date', sortValue: (i) => i.invoice_date, render: (i) => <span className="text-slate-500">{formatDate(i.invoice_date)}</span> },
    { key: 'due', header: 'Due', sortValue: (i) => i.due_date ?? '', render: (i) => <span className="text-slate-500">{formatDate(i.due_date)}</span> },
    { key: 'total', header: 'Total', sortValue: (i) => Number(i.total), render: (i) => <span className="font-medium text-slate-700">{formatCurrency(Number(i.total), i.currency)}</span> },
    { key: 'bal', header: 'Balance', sortValue: (i) => Number(i.balance_due), render: (i) => <span className={Number(i.balance_due) > 0 ? 'text-amber-600' : 'text-emerald-600'}>{formatCurrency(Number(i.balance_due), i.currency)}</span> },
    { key: 'status', header: 'Status', sortValue: (i) => i.status, render: (i) => <StatusBadge status={i.status} tone={STATUS_TONE[i.status]} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="GST-ready invoices for billing and collection management."
        actions={can(role, 'invoices.create') && <Button onClick={() => navigate('/invoices/new')}><Plus className="h-4 w-4" /> New invoice</Button>}
      />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? (
        <EmptyState icon={<Receipt className="h-10 w-10" />} title="No invoices yet" description="Create your first invoice to start tracking payments." action={can(role, 'invoices.create') && <Button onClick={() => navigate('/invoices/new')}><Plus className="h-4 w-4" /> New invoice</Button>} />
      ) : (
        <Card className="p-4">
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(i) => i.id}
            onRowClick={(i) => navigate(`/invoices/${i.id}`)}
            searchKeys={(i) => `${i.invoice_number} ${i.client_name} ${i.invoice_type} ${i.status}`}
            toolbar={<>
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-36"><option value="all">All types</option>{INVOICE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</Select>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36"><option value="all">All statuses</option>{Object.keys(STATUS_TONE).map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</Select>
            </>}
            empty="No invoices match your filters."
          />
        </Card>
      )}
    </div>
  );
}

export function InvoiceEditor({ invoiceId }: { invoiceId: string | null }) {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const isNew = invoiceId === null;

  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [existing, setExisting] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<(Payment & { payment_allocations?: PaymentAllocation[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showSendEmail, setShowSendEmail] = useState(false);
  const [showSendWhatsApp, setShowSendWhatsApp] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkResult, setLinkResult] = useState<string | null>(null);
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const saveOptionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (saveOptionsRef.current && !saveOptionsRef.current.contains(event.target as Node)) {
        setShowSaveOptions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const [isEditingOverride, setIsEditingOverride] = useState(false);
  const [clientId, setClientId] = useState('');
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('tax_invoice');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [billingAddress, setBillingAddress] = useState('');
  const [clientGstin, setClientGstin] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('Karnataka');
  const [isInterState, setIsInterState] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState('Net 15');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<EditableLine[]>([newLine()]);
  const [docDiscount, setDocDiscount] = useState(0);
  const [status, setStatus] = useState<InvoiceStatus>('draft');

  useEffect(() => {
    if (!clientId || !clients.length) return;
    const c = clients.find((x) => x.id === clientId);
    if (c) {
      if (!billingAddress && c.billing_address) setBillingAddress(c.billing_address);
      if (!clientGstin && c.gstin) setClientGstin(c.gstin);
      if ((!placeOfSupply || placeOfSupply === 'Karnataka') && c.state) setPlaceOfSupply(c.state);
    }
  }, [clientId, clients]);
  useEffect(() => {
    if (!activeWorkspace) return;
    Promise.all([
      supabase.from('clients').select('*').eq('workspace_id', activeWorkspace.id).eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('services').select('*').eq('workspace_id', activeWorkspace.id).order('name'),
    ]).then(([c, s]) => { setClients((c.data ?? []) as Client[]); setServices((s.data ?? []) as Service[]); });
  }, [activeWorkspace]);

  const loadExisting = useCallback(async () => {
    if (!activeWorkspace || !invoiceId) return;
    setLoading(true);
    const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoiceId).eq('workspace_id', activeWorkspace.id).eq('is_deleted', false).maybeSingle();
    if (!inv) { setError('Invoice not found.'); setLoading(false); return; }
    const iv = inv as Invoice;
    setExisting(iv);
    setClientId(iv.client_id);
    setInvoiceType(iv.invoice_type);
    setInvoiceDate(iv.invoice_date);
    setDueDate(iv.due_date ?? '');
    setCurrency(iv.currency);
    setBillingAddress(iv.billing_address ?? '');
    setClientGstin(iv.client_gstin ?? '');
    setPlaceOfSupply(iv.place_of_supply ?? 'Karnataka');
    setIsInterState(Number(iv.igst_amount) > 0);
    setPaymentTerms(iv.payment_terms ?? '');
    setNotes(iv.notes ?? '');
    setTerms(iv.terms_and_conditions ?? '');
    setStatus(iv.status);

    const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('sort_order');
    const itemRows = (items ?? []) as InvoiceItem[];
    setLines(itemRows.length > 0 ? itemRows.map((it) => ({ id: it.id ?? `db-${it.sort_order}`, service_id: it.service_id, description: it.description, hsn_sac: it.hsn_sac, quantity: Number(it.quantity), unit: it.unit, rate: Number(it.rate), discount_type: 'amount' as const, discount_amount: Number(it.discount_amount), discount_percent: 0, tax_percent: Number(it.tax_rate) })) : [newLine()]);

    const { data: pays } = await supabase.from('payments').select('*, payment_allocations(*)').eq('client_id', iv.client_id).eq('verification_status', 'verified');
    const relevantPays = ((pays ?? []) as (Payment & { payment_allocations: PaymentAllocation[] })[]).filter((p) => p.payment_allocations.some((a: PaymentAllocation) => a.invoice_id === invoiceId));
    setPayments(relevantPays);

    setLoading(false);
  }, [activeWorkspace, invoiceId]);

  useEffect(() => {
    if (isNew) {
      const qParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const qId = qParams.get('quotation_id');
      if (qId && activeWorkspace) {
        setLoading(true);
        Promise.all([
          supabase.from('quotations').select('*').eq('id', qId).eq('workspace_id', activeWorkspace.id).maybeSingle(),
          supabase.from('quotation_items').select('*').eq('quotation_id', qId).order('sort_order')
        ]).then(([{ data: q }, { data: items }]) => {
          if (q) {
            setClientId(q.client_id);
            setCurrency(q.currency);
            setPaymentTerms(q.payment_terms || '');
            setTerms(q.terms_and_conditions || '');
            setNotes(q.notes || '');
          }
          if (items && items.length > 0) {
            setLines(items.map((it: any) => ({
              id: it.id, service_id: it.service_id, description: it.description, hsn_sac: it.hsn_sac,
              quantity: Number(it.quantity), unit: it.unit, rate: Number(it.rate), discount_type: 'amount', discount_amount: Number(it.discount_amount),
              discount_percent: 0, tax_percent: Number(it.tax_percent)
            })));
          }
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    } else {
      loadExisting();
    }
  }, [isNew, loadExisting, activeWorkspace]);

  const { totals } = computeEditableTotals(lines, isInterState, docDiscount);

  const save = async (asStatus?: InvoiceStatus) => {
    if (!activeWorkspace) return;
    if (!clientId) { setError('Please select a client.'); return; }
    if (lines.length === 0 || lines.every((l) => !l.description.trim())) { setError('Add at least one line item.'); return; }
    setBusy(true);
    setError(null);
    const targetStatus = asStatus ?? status;

    const cleanLines = lines.filter((l) => l.description.trim());
    const computed = cleanLines.map((l) => computeLine({ quantity: l.quantity, rate: l.rate, discount_amount: l.discount_amount, tax_percent: l.tax_percent, isInterState }));
    const finalTotals = computeDocTotals(computed, docDiscount);
    const taxRate = cleanLines[0]?.tax_percent ?? 18;
    const itemRows = cleanLines.map((l, i) => {
      const c = computed[i];
      return {
        service_id: l.service_id, description: l.description.trim(), hsn_sac: l.hsn_sac,
        quantity: l.quantity, unit: l.unit, rate: l.rate, discount_amount: l.discount_amount,
        tax_rate: l.tax_percent,
        cgst_rate: isInterState ? 0 : l.tax_percent / 2,
        sgst_rate: isInterState ? 0 : l.tax_percent / 2,
        igst_rate: isInterState ? l.tax_percent : 0,
        cgst_amount: c.cgstAmount, sgst_amount: c.sgstAmount, igst_amount: c.igstAmount,
        line_total: c.lineTotal, sort_order: i,
      };
    });

    const headerFields = {
      client_id: clientId, invoice_type: invoiceType, invoice_date: invoiceDate, due_date: dueDate || null,
      currency, billing_address: billingAddress || null, client_gstin: clientGstin || null,
      place_of_supply: placeOfSupply || null, payment_terms: paymentTerms || null,
      notes: notes || null, terms_and_conditions: terms || null,
      subtotal: finalTotals.subtotal, discount_amount: finalTotals.discountAmount,
      tax_amount: finalTotals.taxAmount, cgst_amount: finalTotals.cgstAmount, sgst_amount: finalTotals.sgstAmount,
      igst_amount: finalTotals.igstAmount, round_off: finalTotals.roundOff, total: finalTotals.total,
      status: targetStatus,
    };

    let iid = invoiceId;
    if (isNew) {
      const fy = financialYear();
      const prefix = invoiceType === 'credit_note' ? 'CN' : 'INV';
      const num = await nextEntityNumber(activeWorkspace.id, 'invoices', `${prefix}-${fy}`);
      const { data, error: insErr } = await supabase.from('invoices').insert({
        ...headerFields, workspace_id: activeWorkspace.id, invoice_number: num, financial_year: fy,
        amount_paid: 0, balance_due: finalTotals.total, created_by: user?.id ?? null,
      }).select().single();
      if (insErr) { setError(describeDbError(insErr)); setBusy(false); return; }
      iid = (data as Invoice).id;
      setExisting(data as Invoice);
      await supabase.from('invoice_items').insert(itemRows.map((r) => ({ ...r, workspace_id: activeWorkspace.id, invoice_id: iid })));
      await addTimelineEvent(activeWorkspace.id, clientId, 'invoice_created', { title: 'Invoice created', description: `${num} for ${formatCurrency(finalTotals.total, currency)}`, actorId: user?.id ?? null, relatedEntityType: 'invoice', relatedEntityId: iid });
      await addAuditLog(activeWorkspace.id, user?.id ?? null, 'invoice', iid, 'create', { changeSummary: `Created invoice ${num}` });
    } else {
      const hasPayment = Number(existing?.amount_paid) > 0;
      if (hasPayment && targetStatus !== 'cancelled') {
        setError('Invoice has received payments. Use a credit note for adjustments instead of editing totals.');
        setBusy(false);
        return;
      }
      const { error: updErr } = await supabase.from('invoices').update({ ...headerFields, balance_due: finalTotals.total - Number(existing?.amount_paid ?? 0), updated_at: new Date().toISOString() }).eq('id', iid).eq('workspace_id', activeWorkspace.id);
      if (updErr) { setError(describeDbError(updErr)); setBusy(false); return; }
      await supabase.from('invoice_items').delete().eq('invoice_id', iid);
      await supabase.from('invoice_items').insert(itemRows.map((r) => ({ ...r, workspace_id: activeWorkspace.id, invoice_id: iid })));
      await addAuditLog(activeWorkspace.id, user?.id ?? null, 'invoice', iid, 'update', { changeSummary: 'Updated invoice' });
    }
    setBusy(false);
    navigate(`/invoices/${iid}`);
  };

  const copyPaymentLink = () => {
    if (!existing) return;
    const url = `${window.location.origin}/#/pay/${existing.id}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const createPaymentLink = async () => {
    if (!activeWorkspace || !existing) return;
    setCreatingLink(true);
    setLinkResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-link`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workspace_id: activeWorkspace.id, invoice_id: existing.id }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || data.details || `Failed (${resp.status})`);
      setLinkResult(`Payment link created: ${data.short_url || data.payment_link_url || 'Check invoice'}`);
      loadExisting();
    } catch (err) {
      setLinkResult(`Error: ${err instanceof Error ? err.message : 'Failed to create link'}`);
    }
    setCreatingLink(false);
  };

  const duplicate = async () => {
    if (!activeWorkspace || !existing) return;
    const fy = financialYear();
    const num = await nextEntityNumber(activeWorkspace.id, 'invoices', `INV-${fy}`);
    const { data } = await supabase.from('invoices').insert({
      workspace_id: activeWorkspace.id, invoice_number: num, financial_year: fy,
      client_id: existing.client_id, invoice_type: existing.invoice_type, invoice_date: new Date().toISOString().slice(0, 10),
      due_date: existing.due_date, currency: existing.currency, billing_address: existing.billing_address,
      client_gstin: existing.client_gstin, place_of_supply: existing.place_of_supply,
      subtotal: existing.subtotal, discount_amount: existing.discount_amount, tax_amount: existing.tax_amount,
      cgst_amount: existing.cgst_amount, sgst_amount: existing.sgst_amount, igst_amount: existing.igst_amount,
      round_off: existing.round_off, total: existing.total, amount_paid: 0, balance_due: existing.total,
      payment_terms: existing.payment_terms, notes: existing.notes, terms_and_conditions: existing.terms_and_conditions,
      status: 'draft', created_by: user?.id ?? null,
    }).select().single();
    if (data) {
      const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', existing.id);
      if (items?.length) await supabase.from('invoice_items').insert((items as InvoiceItem[]).map((it) => ({ workspace_id: activeWorkspace.id, invoice_id: (data as Invoice).id, service_id: it.service_id, description: it.description, hsn_sac: it.hsn_sac, quantity: it.quantity, unit: it.unit, rate: it.rate, discount_amount: it.discount_amount, tax_rate: it.tax_rate, cgst_rate: it.cgst_rate, sgst_rate: it.sgst_rate, igst_rate: it.igst_rate, cgst_amount: it.cgst_amount, sgst_amount: it.sgst_amount, igst_amount: it.igst_amount, line_total: it.line_total, sort_order: it.sort_order })));
      navigate(`/invoices/${(data as Invoice).id}`);
    }
  };

  const markSent = async () => {
    if (!activeWorkspace || !existing) return;
    setBusy(true);
    await supabase.from('invoices').update({ status: 'sent' }).eq('id', existing.id).eq('workspace_id', activeWorkspace.id);
    if (existing.client_id) await addTimelineEvent(activeWorkspace.id, existing.client_id, 'invoice_sent', { title: 'Invoice sent', actorId: user?.id ?? null, relatedEntityType: 'invoice', relatedEntityId: existing.id });
    await addAuditLog(activeWorkspace.id, user?.id ?? null, 'invoice', existing.id, 'send', { changeSummary: 'Marked as sent' });
    setBusy(false);
    loadExisting();
  };

  if (loading) return <LoadingState label="Loading invoice…" />;

  const hasPayment = Boolean(existing) && Number(existing?.amount_paid) > 0;
  const readOnly = !isEditingOverride && Boolean(existing && (existing.status === 'paid' || existing.status === 'cancelled' || existing.status === 'written_off' || hasPayment));

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/invoices')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">{isNew ? 'New invoice' : existing?.invoice_number}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{isNew ? 'Create a GST-ready invoice' : `${existing?.financial_year} · ${formatCurrency(Number(existing?.total), currency)}`}</p>
        </div>
        {existing && <StatusBadge status={existing.status} tone={STATUS_TONE[existing.status]} />}
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">Invoice details</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Client" required>
                <Select value={clientId} onChange={(e) => { setClientId(e.target.value); const c = clients.find((x) => x.id === e.target.value); if (c) { setBillingAddress(c.billing_address ?? ''); setClientGstin(c.gstin ?? ''); setPlaceOfSupply(c.state ?? 'Karnataka'); setIsInterState(Boolean(c.state && c.state !== 'Karnataka')); } }} disabled={readOnly}>
                  <option value="">Select client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.business_name || c.contact_person}</option>)}
                </Select>
              </Field>
              <Field label="Invoice type"><Select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as InvoiceType)} disabled={readOnly}>{INVOICE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</Select></Field>
              <Field label="Invoice date" required><TextInput type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} disabled={readOnly} /></Field>
              <Field label="Due date"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={readOnly} /></Field>
              <Field label="Currency"><Select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={readOnly}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option></Select></Field>
              <Field label="Place of supply"><TextInput value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} disabled={readOnly} /></Field>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Billing address"><TextArea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} disabled={readOnly} /></Field>
              <Field label="Client GSTIN"><TextInput value={clientGstin} onChange={(e) => setClientGstin(e.target.value)} disabled={readOnly} /></Field>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Line items</h3>
              <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={isInterState} onChange={(e) => setIsInterState(e.target.checked)} disabled={readOnly} /> Inter-state (IGST)</label>
            </div>
            <LineItemsEditor lines={lines} onChange={setLines} services={services} isInterState={isInterState} docDiscount={docDiscount} currency={currency} />
            {!readOnly && <div className="mt-4"><Field label="Document discount"><TextInput type="number" step="0.01" value={docDiscount} onChange={(e) => setDocDiscount(Number(e.target.value) || 0)} className="max-w-[200px]" /></Field></div>}
          </Card>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Terms & notes</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Field label="Terms & conditions"><TextArea value={terms} onChange={(e) => setTerms(e.target.value)} disabled={readOnly} rows={4} /></Field>
            <Field label="Notes"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} rows={4} /></Field>
          </div>
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
          </div>
        </div>
      </Card>

      {existing && payments.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Payments received</h3>
          <div className="space-y-2">
            {payments.map((p) => {
              const alloc = p.payment_allocations?.find((a) => a.invoice_id === existing.id);
              return (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-slate-600">{p.payment_number}</span>
                  <span className="text-slate-500">{formatDate(p.payment_date)}</span>
                  <span className="font-medium text-slate-700">{formatCurrency(Number(alloc?.amount ?? p.amount))}</span>
                  <StatusBadge status={p.verification_status} tone={p.verification_status === 'verified' ? 'success' : 'warning'} />
                </div>
              );
            })}
          </div>
        </Card>
      )}

        </div>

        {/* Right Column: Sticky Summary */}
        <div className="lg:sticky lg:top-24 self-start order-first lg:order-last mb-6 lg:mb-0">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="text-slate-700">{formatCurrency(totals.subtotal, currency)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="text-slate-700">{formatCurrency(totals.discountAmount, currency)}</span></div>
              {isInterState ? (
                <div className="flex justify-between"><span className="text-slate-500">IGST</span><span className="text-slate-700">{formatCurrency(totals.igstAmount, currency)}</span></div>
              ) : (<>
                <div className="flex justify-between"><span className="text-slate-500">CGST</span><span className="text-slate-700">{formatCurrency(totals.cgstAmount, currency)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">SGST</span><span className="text-slate-700">{formatCurrency(totals.sgstAmount, currency)}</span></div>
              </>)}
              <div className="flex justify-between"><span className="text-slate-500">Round-off</span><span className="text-slate-700">{formatCurrency(totals.roundOff, currency)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span>{formatCurrency(totals.total, currency)}</span></div>
              {existing && Number(existing.amount_paid) > 0 && (<>
                <div className="flex justify-between pt-1 text-emerald-600"><span>Paid</span><span>{formatCurrency(Number(existing.amount_paid), currency)}</span></div>
                <div className="flex justify-between font-medium text-amber-600"><span>Balance due</span><span>{formatCurrency(Number(existing.balance_due), currency)}</span></div>
              </>)}
            </div>
          </Card>

          {existing && (
            <Card className="p-5 mt-6">
              <h3 className="mb-4 text-sm font-semibold text-slate-700">Actions</h3>
              <div className="space-y-3">
                {can(role, 'invoices.edit') && readOnly && existing.status !== 'cancelled' && (
                  <Button variant="outline" className="w-full text-blue-700 hover:bg-blue-50 border-blue-200" onClick={() => setIsEditingOverride(true)} disabled={busy}><Edit className="h-4 w-4 mr-2" /> Edit invoice</Button>
                )}
                {can(role, 'payments.create') && Number(existing.balance_due) > 0 && existing.status !== 'cancelled' && (
                  <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 border-blue-600 shadow-sm" onClick={() => setShowPayment(true)}><CreditCard className="h-4 w-4 mr-2" /> Record payment</Button>
                )}
                {can(role, 'payment_link.create') && Number(existing.balance_due) > 0 && existing.status !== 'cancelled' && !existing.payment_link && (
                  <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 border-blue-600 shadow-sm" onClick={createPaymentLink} disabled={creatingLink}><Zap className="h-4 w-4 mr-2" /> {creatingLink ? 'Creating…' : 'Create Razorpay link'}</Button>
                )}
                {can(role, 'invoices.create') && <Button variant="outline" className="w-full text-slate-700 hover:bg-slate-50 border-slate-200" onClick={duplicate} disabled={busy}><Copy className="h-4 w-4 mr-2" /> Duplicate</Button>}
                <Button variant="outline" className="w-full text-slate-700 hover:bg-slate-50 border-slate-200" onClick={() => {
                  if (!existing) return;
                  const c = clients.find((x) => x.id === existing.client_id);
                  printDocument({
                    docType: 'Invoice',
                    docNumber: existing.invoice_number,
                    docDate: existing.invoice_date,
                    dueDateOrValidUntil: existing.due_date,
                    clientName: c?.business_name || c?.contact_person || 'Client',
                    clientGstin: existing.client_gstin || c?.gstin,
                    billingAddress: existing.billing_address || c?.billing_address,
                    placeOfSupply: existing.place_of_supply || c?.state,
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
                    cgstAmount: Number(existing.cgst_amount || totals.cgstAmount),
                    sgstAmount: Number(existing.sgst_amount || totals.sgstAmount),
                    igstAmount: Number(existing.igst_amount || totals.igstAmount),
                    roundOff: Number(existing.round_off || totals.roundOff),
                    total: Number(existing.total || totals.total),
                    amountPaid: Number(existing.amount_paid),
                    balanceDue: Number(existing.balance_due),
                    paymentTerms: existing.payment_terms,
                    termsAndConditions: existing.terms_and_conditions,
                    notes: existing.notes,
                    isInterState,
                  });
                }}><FileDown className="h-4 w-4 mr-2" /> Download PDF</Button>
                <Button variant="outline" className="w-full text-slate-700 hover:bg-slate-50 border-slate-200" onClick={copyPaymentLink}><LinkIcon className="h-4 w-4 mr-2" /> {linkCopied ? 'Link copied!' : 'Copy payment link'}</Button>
                {can(role, 'email.send') && existing.client_id && (() => { const c = clients.find((x) => x.id === existing.client_id); return c?.primary_email ? <Button variant="outline" className="w-full text-slate-700 hover:bg-slate-50 border-slate-200" onClick={() => setShowSendEmail(true)}><Mail className="h-4 w-4 mr-2" /> Send by email</Button> : null; })()}
                {can(role, 'whatsapp.send') && existing.client_id && (() => { const c = clients.find((x) => x.id === existing.client_id); return (c?.whatsapp_number || c?.primary_phone) ? <Button variant="outline" className="w-full text-slate-700 hover:bg-slate-50 border-slate-200" onClick={() => setShowSendWhatsApp(true)}><MessageCircle className="h-4 w-4 mr-2" /> Send by WhatsApp</Button> : null; })()}
              </div>
              {linkResult && <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{linkResult}</div>}
            </Card>
          )}
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-0 z-40 bg-white border-t border-slate-200 py-4 px-6 lg:pr-24 -mx-6 -mb-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] mt-8">
        <div className="flex flex-col sm:flex-row items-center justify-end gap-4">
          <div className="flex w-full sm:w-auto gap-3">
            {!readOnly ? (
              <div className="relative flex-1 sm:flex-none flex items-center justify-end" ref={saveOptionsRef}>
                <div className="inline-flex rounded-md shadow-sm">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => save('draft')}
                    className="relative inline-flex items-center rounded-l-md border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Save invoice as draft"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setShowSaveOptions(!showSaveOptions)}
                    className="relative -ml-px inline-flex items-center rounded-r-md border border-blue-600 border-l-blue-700 bg-blue-600 px-2 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Open save options"
                    aria-haspopup="menu"
                    aria-expanded={showSaveOptions}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                
                {showSaveOptions && (
                  <div className="absolute right-0 bottom-full mb-2 w-64 origin-bottom-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                    <div className="py-1" role="menu" aria-orientation="vertical">
                      <button
                        onClick={() => { setShowSaveOptions(false); save('draft'); }}
                        className="group flex w-full items-center px-4 py-3 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus:bg-slate-100"
                        role="menuitem"
                      >
                        <div className="flex flex-col text-left">
                          <span className="font-medium">Save as Draft</span>
                          <span className="text-xs text-slate-500 mt-0.5">Save the invoice without changing its status to Sent.</span>
                        </div>
                      </button>
                      <button
                        onClick={() => { 
                          setShowSaveOptions(false); 
                          if (window.confirm('Save and mark this invoice as sent?\n\nThe invoice will be saved and its status will be updated to Sent.')) {
                            save('sent');
                          }
                        }}
                        className="group flex w-full items-center px-4 py-3 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus:bg-slate-100 border-t border-slate-100"
                        role="menuitem"
                      >
                        <div className="flex flex-col text-left">
                          <span className="font-medium">Save & Mark Sent</span>
                          <span className="text-xs text-slate-500 mt-0.5">Save the invoice and update its status to Sent.</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 w-full text-center">{hasPayment ? 'Invoice has payments — use credit notes for adjustments.' : 'This invoice cannot be edited in its current state.'}</div>
            )}
          </div>
        </div>
      </div>

      {showPayment && existing && (
        <RecordPaymentModal open={showPayment} onClose={() => setShowPayment(false)} onSaved={() => { setShowPayment(false); loadExisting(); }} invoice={existing} workspaceId={activeWorkspace!.id} />
      )}

      {showSendEmail && existing && (() => { const c = clients.find((x) => x.id === existing.client_id); return (
        <SendEmailModal
          open={showSendEmail}
          onClose={() => setShowSendEmail(false)}
          to={c?.primary_email ?? ''}
          toName={c?.business_name ?? c?.contact_person}
          subject={`Invoice ${existing.invoice_number}`}
          bodyHtml={`<p>Dear ${c?.contact_person || 'Client'},</p><p>Please find our invoice <strong>${existing.invoice_number}</strong> for ${formatCurrency(Number(existing.total), existing.currency)}.</p><p>Due date: ${existing.due_date ? formatDate(existing.due_date) : 'N/A'}</p><p>Balance due: <strong>${formatCurrency(Number(existing.balance_due), existing.currency)}</strong></p>${existing.payment_link ? `<p>Pay online: <a href="${existing.payment_link}">${existing.payment_link}</a></p>` : ''}<p>Thank you for your business.</p>`}
          attachmentContext={{ entity_type: 'invoice', entity_id: existing.id, entity_number: existing.invoice_number }}
        />
      ); })()}

      {showSendWhatsApp && existing && (() => { const c = clients.find((x) => x.id === existing.client_id); return (
        <SendWhatsAppModal
          open={showSendWhatsApp}
          onClose={() => setShowSendWhatsApp(false)}
          toPhone={c?.whatsapp_number || c?.primary_phone || ''}
          clientId={existing.client_id}
          templateName="invoice_sent"
          context={{ entity_type: 'invoice', entity_id: existing.id, entity_number: existing.invoice_number }}
        />
      ); })()}
    </div>
  );
}

function RecordPaymentModal({ open, onClose, onSaved, invoice, workspaceId }: { open: boolean; onClose: () => void; onSaved: () => void; invoice: Invoice; workspaceId: string }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState(Number(invoice.balance_due));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<Payment['payment_mode']>('upi');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) { setError('Amount must be greater than zero.'); return; }
    if (amount > Number(invoice.balance_due) + 0.01) { setError(`Amount exceeds balance due (${formatCurrency(Number(invoice.balance_due), invoice.currency)}). Record the excess as client credit instead.`); return; }
    setBusy(true);
    setError(null);

    const payNum = await nextEntityNumber(workspaceId, 'payments', 'PMT');
    const { data: payRow, error: payErr } = await supabase.from('payments').insert({
      workspace_id: workspaceId, client_id: invoice.client_id, payment_number: payNum,
      payment_date: paymentDate, amount, payment_mode: mode, transaction_reference: reference || null,
      notes: notes || null, recorded_by: user?.id ?? null, verification_status: 'verified',
    }).select().single();
    if (payErr) { setError(describeDbError(payErr)); setBusy(false); return; }
    const pay = payRow as Payment;

    await supabase.from('payment_allocations').insert({ workspace_id: workspaceId, payment_id: pay.id, invoice_id: invoice.id, amount });

    const newAmountPaid = Number(invoice.amount_paid) + amount;
    const newBalance = Number(invoice.total) - newAmountPaid;
    const newStatus: InvoiceStatus = newBalance <= 0.01 ? 'paid' : 'partially_paid';
    await supabase.from('invoices').update({ amount_paid: newAmountPaid, balance_due: newBalance, status: newStatus, updated_at: new Date().toISOString() }).eq('id', invoice.id).eq('workspace_id', workspaceId);

    await addTimelineEvent(workspaceId, invoice.client_id, 'payment_received', { title: 'Payment received', description: `${formatCurrency(amount, invoice.currency)} against ${invoice.invoice_number}`, actorId: user?.id ?? null, relatedEntityType: 'invoice', relatedEntityId: invoice.id });
    await addAuditLog(workspaceId, user?.id ?? null, 'payment', pay.id, 'create', { changeSummary: `Recorded payment ${payNum} of ${formatCurrency(amount)} against ${invoice.invoice_number}` });

    setBusy(false);
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title="Record payment" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Invoice</span><span className="font-mono text-slate-700">{invoice.invoice_number}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="text-slate-700">{formatCurrency(Number(invoice.total), invoice.currency)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Balance due</span><span className="font-semibold text-amber-600">{formatCurrency(Number(invoice.balance_due), invoice.currency)}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount" required><TextInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} autoFocus /></Field>
          <Field label="Payment date" required><TextInput type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Payment mode" required><Select value={mode} onChange={(e) => setMode(e.target.value as Payment['payment_mode'])}><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="payment_gateway">Payment Gateway</option><option value="other">Other</option></Select></Field>
          <Field label="Transaction reference"><TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." /></Field>
        </div>
        <Field label="Notes"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Recording…' : 'Record payment'}</Button></div>
      </form>
    </Modal>
  );
}
