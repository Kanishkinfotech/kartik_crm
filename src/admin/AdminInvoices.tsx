import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState, Button, Modal, Field, TextInput, Select } from '@/components/ui';
import { Receipt, Building2, Download, Plus, RefreshCw, FileText, CheckCircle2, Clock } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { printDocument } from '@/lib/pdfGenerator';

export function AdminInvoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWsId, setSelectedWsId] = useState('');
  const [amount, setAmount] = useState('4999');
  const [description, setDescription] = useState('Annual Custom SaaS Subscription Fee');
  const [busy, setBusy] = useState(false);

  const loadInvoices = async () => {
    setLoading(true);
    const { data: invData } = await supabase
      .from('platform_invoices')
      .select('*, workspaces(name, slug, branding)')
      .order('created_at', { ascending: false });

    const { data: wsData } = await supabase
      .from('workspaces')
      .select('id, name, slug')
      .order('name');

    setInvoices(invData || []);
    setWorkspaces(wsData || []);
    if (wsData && wsData.length > 0) setSelectedWsId(wsData[0].id);
    setLoading(false);
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleCreateInvoice = async () => {
    if (!selectedWsId || !amount) return;
    setBusy(true);

    const invNum = `INV-SAAS-${Date.now().toString().slice(-6)}`;
    const subtotal = Number(amount);
    const taxAmount = subtotal * 0.18; // 18% GST
    const total = subtotal + taxAmount;

    const { error } = await supabase.from('platform_invoices').insert({
      workspace_id: selectedWsId,
      invoice_number: invNum,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      currency: 'INR',
      subtotal,
      tax_amount: taxAmount,
      total,
      status: 'unpaid',
      notes: description,
    });

    setBusy(false);
    if (!error) {
      setShowCreateModal(false);
      loadInvoices();
    } else {
      alert(`Failed to create platform invoice: ${error.message}`);
    }
  };

  const handleDownloadPdf = (inv: any) => {
    printDocument({
      docType: 'Invoice',
      docNumber: inv.invoice_number || 'INV-SAAS-001',
      docDate: inv.invoice_date || new Date().toISOString().slice(0, 10),
      dueDateOrValidUntil: inv.due_date,
      clientName: inv.workspaces?.name || 'Workspace Customer',
      currency: inv.currency || 'INR',
      items: [
        {
          description: inv.notes || 'Platform Subscription Fee',
          quantity: 1,
          unit: 'Months',
          rate: Number(inv.subtotal || inv.total || 0),
          discount_amount: 0,
          tax_percent: 18,
          line_total: Number(inv.subtotal || inv.total || 0),
        },
      ],
      subtotal: Number(inv.subtotal || inv.total || 0),
      discountAmount: 0,
      cgstAmount: Number(inv.tax_amount || 0) / 2,
      sgstAmount: Number(inv.tax_amount || 0) / 2,
      igstAmount: 0,
      taxAmount: Number(inv.tax_amount || 0),
      roundOff: 0,
      total: Number(inv.total || 0),
      notes: 'Thank you for choosing Kanishk One SaaS Platform.',
      termsAndConditions: 'Payment due within 15 days of invoice date.',
    });
  };

  if (loading) return <LoadingState label="Loading SaaS Platform Invoices..." />;

  const filtered = invoices.filter((inv) => {
    const wsName = (inv.workspaces?.name || '').toLowerCase();
    const invNum = (inv.invoice_number || '').toLowerCase();
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || wsName.includes(q) || invNum.includes(q);
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary flex items-center gap-2">
            <Receipt className="h-7 w-7 text-admin-primary" /> SaaS Platform Invoices
          </h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Manage B2B SaaS tax invoices, GST breakdowns, and download official PDF receipts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={loadInvoices} className="gap-2 text-xs">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)} className="gap-2 text-xs">
            <Plus className="h-4 w-4" /> Create Custom Invoice
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workspace or invoice number..."
          className="flex-1 rounded-lg border border-admin-border-subtle bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-admin-border-subtle bg-white px-3 py-2 text-xs text-slate-700 shadow-sm"
        >
          <option value="all">All Statuses</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      <div className="bg-admin-bg-surface rounded-xl shadow-sm border border-admin-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-admin-text-secondary">
            <thead className="bg-slate-50 text-admin-text-primary border-b border-admin-border-subtle font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Invoice #</th>
                <th className="px-6 py-3.5">Workspace</th>
                <th className="px-6 py-3.5">Amount (₹)</th>
                <th className="px-6 py-3.5">Tax (GST 18%)</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.length > 0 ? (
                filtered.map((inv) => {
                  const wsName = inv.workspaces?.name || 'Customer Workspace';
                  const totalFormatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: inv.currency || 'INR' }).format(inv.total || 0);
                  const taxFormatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: inv.currency || 'INR' }).format(inv.tax_amount || 0);

                  let statusBadge = 'bg-emerald-100 text-emerald-800';
                  if (inv.status === 'unpaid') statusBadge = 'bg-amber-100 text-amber-800';
                  if (inv.status === 'overdue') statusBadge = 'bg-rose-100 text-rose-800';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-admin-text-primary">
                        {inv.invoice_number || 'INV-SAAS-001'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400" />
                          <span>{wsName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-900">
                        {totalFormatted}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">
                        {taxFormatted}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-bold uppercase tracking-wider ${statusBadge}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {inv.invoice_date || formatDateTime(inv.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadPdf(inv)}
                          className="gap-1.5 text-xs"
                        >
                          <Download className="h-3.5 w-3.5" /> PDF
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-xs text-slate-400">
                    No platform invoices found matching filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Custom SaaS Invoice">
          <div className="space-y-4 py-2">
            <Field label="Target Workspace">
              <Select value={selectedWsId} onChange={(e) => setSelectedWsId(e.target.value)}>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.slug})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Subtotal Amount (₹)">
              <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="4999" />
            </Field>

            <Field label="Description / Particulars">
              <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Annual Enterprise Billing" />
            </Field>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateInvoice} disabled={busy}>
                {busy ? 'Creating...' : 'Create Invoice'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}