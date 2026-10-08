import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { addAuditLog, nextEntityNumber } from '@/lib/data';
import type { Service, ServiceBillingType } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, Modal, Field, TextInput, TextArea, Select, ConfirmDialog } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { Plus, Package, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { can } from '@/lib/permissions';

const BILLING_TYPES: ServiceBillingType[] = ['one_time', 'milestone', 'monthly', 'quarterly', 'half_yearly', 'annual', 'usage_based', 'custom'];

const EMPTY = {
  service_code: '',
  name: '',
  category: '',
  description: '',
  deliverables: '',
  default_price: '',
  negotiation_price_1: '',
  negotiation_price_2: '',
  min_allowed_price: '',
  tax_percent: '18',
  sac_hsn_code: '',
  billing_type: 'one_time' as ServiceBillingType,
  billing_frequency: '',
  estimated_delivery_days: '',
  default_terms: '',
  default_exclusions: '',
  is_active: true,
};

export function ServicesList() {
  const { activeWorkspace, role } = useWorkspace();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('workspace_id', activeWorkspace.id)
      .order('created_at', { ascending: false });
    if (error) setError(describeDbError(error));
    else setServices((data ?? []) as Service[]);
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const columns: Column<Service>[] = [
    { key: 'code', header: 'Code', sortValue: (s) => s.service_code, render: (s) => <span className="font-mono text-xs text-slate-500">{s.service_code}</span> },
    { key: 'name', header: 'Service', sortValue: (s) => s.name, render: (s) => (
      <div>
        <div className="font-medium text-slate-900">{s.name}</div>
        {s.category && <div className="text-xs text-slate-400">{s.category}</div>}
      </div>
    )},
    { key: 'billing', header: 'Billing', sortValue: (s) => s.billing_type, render: (s) => <span className="capitalize text-slate-600">{s.billing_type.replace(/_/g, ' ')}</span> },
    { key: 'price', header: 'Default price', sortValue: (s) => Number(s.default_price ?? 0), render: (s) => <span className="font-medium text-slate-700">{s.default_price != null ? formatCurrency(Number(s.default_price)) : '—'}</span> },
    { key: 'tax', header: 'Tax %', sortValue: (s) => Number(s.tax_percent), render: (s) => <span className="text-slate-600">{s.tax_percent}%</span> },
    { key: 'hsn', header: 'HSN/SAC', render: (s) => <span className="text-slate-600">{s.sac_hsn_code ?? '—'}</span> },
    { key: 'status', header: 'Status', sortValue: (s) => (s.is_active ? 'active' : 'inactive'), render: (s) => <StatusBadge status={s.is_active ? 'active' : 'inactive'} tone={s.is_active ? 'success' : 'neutral'} /> },
    { key: 'actions', header: '', render: (s) => (
      <div className="flex justify-end gap-1">
        {can(role, 'services.update') && <button onClick={(e) => { e.stopPropagation(); setEditing(s); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>}
        {can(role, 'services.delete') && <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services"
        description="Reusable services and packages for quotations and invoices."
        actions={can(role, 'services.create') && <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> New service</Button>}
      />

      {loading ? <LoadingState /> :
        error ? <ErrorState message={error} onRetry={load} /> :
        services.length === 0 ? (
          <EmptyState icon={<Package className="h-10 w-10" />} title="No services yet" description="Create services to reuse them across quotations and invoices." action={can(role, 'services.create') && <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> New service</Button>} />
        ) : (
          <Card className="p-4">
            <DataTable
              columns={columns}
              rows={services}
              rowKey={(s) => s.id}
              searchKeys={(s) => `${s.service_code} ${s.name} ${s.category ?? ''} ${s.sac_hsn_code ?? ''}`}
              empty="No services match your search."
            />
          </Card>
        )
      }

      {showForm && activeWorkspace && (
        <ServiceFormModal
          open={showForm}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
          workspaceId={activeWorkspace.id}
          existing={editing}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget || !activeWorkspace) return;
          await supabase.from('services').delete().eq('id', deleteTarget.id).eq('workspace_id', activeWorkspace.id);
          await addAuditLog(activeWorkspace.id, null, 'service', deleteTarget.id, 'delete', { changeSummary: `Deleted service ${deleteTarget.service_code}` });
          setDeleteTarget(null);
          load();
        }}
        title="Delete service?"
        message={`This permanently removes "${deleteTarget?.name}". Existing quotations/invoices keep their line-item data.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function ServiceFormModal({ open, onClose, onSaved, workspaceId, existing }: { open: boolean; onClose: () => void; onSaved: () => void; workspaceId: string; existing: Service | null }) {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setForm({
        service_code: existing.service_code,
        name: existing.name,
        category: existing.category ?? '',
        description: existing.description ?? '',
        deliverables: existing.deliverables ?? '',
        default_price: existing.default_price != null ? String(existing.default_price) : '',
        negotiation_price_1: existing.negotiation_price_1 != null ? String(existing.negotiation_price_1) : '',
        negotiation_price_2: existing.negotiation_price_2 != null ? String(existing.negotiation_price_2) : '',
        min_allowed_price: existing.min_allowed_price != null ? String(existing.min_allowed_price) : '',
        tax_percent: String(existing.tax_percent),
        sac_hsn_code: existing.sac_hsn_code ?? '',
        billing_type: existing.billing_type,
        billing_frequency: existing.billing_frequency ?? '',
        estimated_delivery_days: existing.estimated_delivery_days != null ? String(existing.estimated_delivery_days) : '',
        default_terms: existing.default_terms ?? '',
        default_exclusions: existing.default_exclusions ?? '',
        is_active: existing.is_active,
      });
    } else {
      setForm(EMPTY);
    }
  }, [existing]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v === '' ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.service_code.trim() || !form.name.trim()) { setError('Service code and name are required.'); return; }

    const defaultPriceNum = num(form.default_price);
    if (defaultPriceNum != null && defaultPriceNum < 0) {
      setError('Default price cannot be negative.');
      return;
    }
    const taxNum = Number(form.tax_percent) || 0;
    if (taxNum < 0 || taxNum > 100) {
      setError('Tax percent must be between 0% and 100%.');
      return;
    }

    setBusy(true);
    setError(null);

    // Duplicate check for service code or name
    try {
      const { data: existingServices } = await supabase
        .from('services')
        .select('id, service_code, name')
        .eq('workspace_id', workspaceId);
      if (existingServices) {
        const dup = existingServices.find((s) => {
          if (existing && s.id === existing.id) return false;
          return s.service_code.trim().toLowerCase() === form.service_code.trim().toLowerCase() ||
                 s.name.trim().toLowerCase() === form.name.trim().toLowerCase();
        });
        if (dup) {
          setError(`A service with code "${dup.service_code}" or name "${dup.name}" already exists.`);
          setBusy(false);
          return;
        }
      }
    } catch {
      // Fallback
    }

    const row = {
      service_code: form.service_code.trim(),
      name: form.name.trim(),
      category: form.category || null,
      description: form.description || null,
      deliverables: form.deliverables || null,
      default_price: defaultPriceNum,
      negotiation_price_1: num(form.negotiation_price_1),
      negotiation_price_2: num(form.negotiation_price_2),
      min_allowed_price: num(form.min_allowed_price),
      tax_percent: taxNum,
      sac_hsn_code: form.sac_hsn_code || null,
      billing_type: form.billing_type,
      billing_frequency: form.billing_frequency || null,
      estimated_delivery_days: form.estimated_delivery_days ? Number(form.estimated_delivery_days) : null,
      default_terms: form.default_terms || null,
      default_exclusions: form.default_exclusions || null,
      is_active: form.is_active,
    };

    let result;
    if (existing) {
      result = await supabase.from('services').update(row).eq('id', existing.id).eq('workspace_id', workspaceId).select().single();
      if (!result.error) await addAuditLog(workspaceId, user?.id ?? null, 'service', existing.id, 'update', { changeSummary: `Updated service ${existing.service_code}` });
    } else {
      result = await supabase.from('services').insert({ ...row, workspace_id: workspaceId }).select().single();
      if (!result.error) await addAuditLog(workspaceId, user?.id ?? null, 'service', result.data?.id, 'create', { changeSummary: `Created service ${row.service_code}` });
    }

    if (result.error) { setError(describeDbError(result.error)); setBusy(false); return; }
    setBusy(false);
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Edit service' : 'New service'} size="xl" preventEscape={true}>
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="space-y-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Service code" required><TextInput value={form.service_code} onChange={(e) => set('service_code', e.target.value)} disabled={!!existing} placeholder="WEB-001" /></Field>
          <Field label="Service name" required><TextInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Business Website Development" /></Field>
          <Field label="Category"><TextInput value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Web Development" /></Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Description"><TextArea value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="Deliverables"><TextArea value={form.deliverables} onChange={(e) => set('deliverables', e.target.value)} /></Field>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Default price"><TextInput type="number" step="0.01" value={form.default_price} onChange={(e) => set('default_price', e.target.value)} /></Field>
          <Field label="Negotiation price 1"><TextInput type="number" step="0.01" value={form.negotiation_price_1} onChange={(e) => set('negotiation_price_1', e.target.value)} /></Field>
          <Field label="Negotiation price 2"><TextInput type="number" step="0.01" value={form.negotiation_price_2} onChange={(e) => set('negotiation_price_2', e.target.value)} /></Field>
          <Field label="Min allowed price"><TextInput type="number" step="0.01" value={form.min_allowed_price} onChange={(e) => set('min_allowed_price', e.target.value)} /></Field>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Tax %"><TextInput type="number" step="0.01" value={form.tax_percent} onChange={(e) => set('tax_percent', e.target.value)} /></Field>
          <Field label="HSN/SAC code"><TextInput value={form.sac_hsn_code} onChange={(e) => set('sac_hsn_code', e.target.value)} placeholder="998314" /></Field>
          <Field label="Billing type"><Select value={form.billing_type} onChange={(e) => set('billing_type', e.target.value as ServiceBillingType)}>{BILLING_TYPES.map((b) => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}</Select></Field>
          <Field label="Est. delivery (days)"><TextInput type="number" value={form.estimated_delivery_days} onChange={(e) => set('estimated_delivery_days', e.target.value)} /></Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default terms"><TextArea value={form.default_terms} onChange={(e) => set('default_terms', e.target.value)} /></Field>
          <Field label="Default exclusions"><TextArea value={form.default_exclusions} onChange={(e) => set('default_exclusions', e.target.value)} /></Field>
        </div>

        <Field label="Active">
          <Select value={form.is_active ? 'yes' : 'no'} onChange={(e) => set('is_active', e.target.value === 'yes')}><option value="yes">Active</option><option value="no">Inactive</option></Select>
        </Field>

        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Create service'}</Button>
        </div>
      </form>
    </Modal>
  );
}
