import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { formatCurrency, formatDate, formatDateTime, classNames } from '@/lib/format';
import type { Client, ClientTimelineEvent, Quotation, Invoice, Payment, Project, CustomFieldDef } from '@/lib/types';
import { Card, LoadingState, ErrorState, EmptyState, StatusBadge, Button, Field, TextArea, Modal } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { Phone, MessageCircle, Mail, Globe, MapPin, Building2, FolderKanban, FileText, Receipt, CreditCard, Activity, StickyNote, Tag, Sparkles, Plus, Edit2, Trash2, ExternalLink } from 'lucide-react';
import { PortalAccessTab } from '@/components/PortalAccessTab';
import { CommunicationTab } from '@/components/CommunicationTab';
import { AddCustomFieldModal } from '@/components/AddCustomFieldModal';
import { CustomFieldBuilderModal } from '@/components/CustomFieldBuilderModal';
import { getCustomFieldDefs, getCustomFieldValues, saveCustomFieldValues, deleteCustomFieldDef, deleteCustomFieldValue, DEFAULT_UNITS, formatCustomFieldValue, getCustomFieldValueForField } from '@/lib/customFields';

const TABS = ['Overview', 'Communication', 'Custom Fields', 'Projects', 'Quotations', 'Invoices', 'Payments', 'Activity', 'Portal Access', 'Notes'] as const;
type Tab = (typeof TABS)[number];

export function ClientDetailTabs({ client }: { client: Client }) {
  const { activeWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<Tab>('Overview');

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-slate-200 px-6 shrink-0 bg-white">
        <nav className="flex gap-1 overflow-x-auto hide-scrollbar">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={classNames(
                'whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                tab === t ? 'border-blue-600 text-blue-700 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              )}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'Overview' && <OverviewTab client={client} />}
        {tab === 'Communication' && <CommunicationTab client={client} />}
        {tab === 'Custom Fields' && <ClientCustomOptionsCard clientId={client.id} />}
        {tab === 'Projects' && <ProjectsTab client={client} />}
        {tab === 'Quotations' && <QuotationsTab client={client} />}
        {tab === 'Invoices' && <InvoicesTab client={client} />}
        {tab === 'Payments' && <PaymentsTab client={client} />}
        {tab === 'Activity' && <ActivityTab client={client} />}
        {tab === 'Portal Access' && <PortalAccessTab clientId={client.id} />}
        {tab === 'Notes' && <NotesTab client={client} />}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// OVERVIEW TAB
// ----------------------------------------------------------------------
function OverviewTab({ client }: { client: Client }) {
  const { activeWorkspace } = useWorkspace();
  const [metrics, setMetrics] = useState({ totalQuoted: 0, approvedQuoted: 0, totalInvoiced: 0, totalCollected: 0, outstanding: 0, overdue: 0, activeProjects: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadMetrics() {
      if (!activeWorkspace) return;
      setLoading(true);
      
      try {
        const dbPromise = Promise.all([
          supabase.from('quotations').select('total, status').eq('workspace_id', activeWorkspace.id).eq('client_id', client.id).eq('is_deleted', false),
          supabase.from('invoices').select('total, balance_due, status').eq('workspace_id', activeWorkspace.id).eq('client_id', client.id).eq('is_deleted', false),
          supabase.from('payments').select('amount, verification_status').eq('workspace_id', activeWorkspace.id).eq('client_id', client.id).eq('is_deleted', false),
          supabase.from('projects').select('status').eq('workspace_id', activeWorkspace.id).eq('client_id', client.id).eq('is_deleted', false),
        ]);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 2000)
        );

        const [qs, inv, pays, projs] = await Promise.race([dbPromise, timeoutPromise]) as any;

        if (!active) return;

        const totalQuoted = (qs?.data ?? []).reduce((sum: number, q: any) => sum + Number(q.total), 0);
        const approvedQuoted = (qs?.data ?? []).filter((q: any) => q.status === 'approved' || q.status === 'converted').reduce((sum: number, q: any) => sum + Number(q.total), 0);
        
        const totalInvoiced = (inv?.data ?? []).reduce((sum: number, i: any) => sum + Number(i.total), 0);
        const outstanding = (inv?.data ?? []).reduce((sum: number, i: any) => sum + Number(i.balance_due), 0);
        const overdue = (inv?.data ?? []).filter((i: any) => i.status === 'overdue').reduce((sum: number, i: any) => sum + Number(i.balance_due), 0);
        
        const totalCollected = (pays?.data ?? []).filter((p: any) => p.verification_status === 'verified').reduce((sum: number, p: any) => sum + Number(p.amount), 0);
        
        const activeProjects = (projs?.data ?? []).filter((p: any) => p.status === 'not_started' || p.status === 'in_progress' || p.status === 'on_hold').length;

        setMetrics({ totalQuoted, approvedQuoted, totalInvoiced, totalCollected, outstanding, overdue, activeProjects });
      } catch {
        // Keep default demo metrics on network failure
      } finally {
        if (active) setLoading(false);
      }
    }
    loadMetrics();
    return () => { active = false; };
  }, [client.id, activeWorkspace]);

  return (
    <div className="space-y-6">
      {/* Contact cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={<Phone className="h-4 w-4" />}
          label="Phone"
          value={client.primary_phone || '—'}
          href={client.primary_phone ? `tel:${client.primary_phone}` : undefined}
        />
        <InfoCard
          icon={<MessageCircle className="h-4 w-4" />}
          label="WhatsApp"
          value={client.whatsapp_number || '—'}
          href={client.whatsapp_number ? `https://wa.me/${client.whatsapp_number.replace(/[^0-9]/g, '')}` : undefined}
        />
        <InfoCard
          icon={<Mail className="h-4 w-4" />}
          label="Email"
          value={client.primary_email || '—'}
          href={client.primary_email ? `mailto:${client.primary_email}` : undefined}
        />
        <InfoCard
          icon={<Globe className="h-4 w-4" />}
          label="Website"
          value={client.website || '—'}
          href={client.website ? (client.website.startsWith('http://') || client.website.startsWith('https://') ? client.website : `https://${client.website}`) : undefined}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Active projects" value={metrics.activeProjects.toString()} tone="brand" />
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
            <Detail label="GSTIN" value={client.gstin || '—'} />
            <Detail label="PAN" value={client.pan || '—'} />
            <Detail label="Tax treatment" value={client.tax_treatment || '—'} />
            <Detail label="Industry" value={client.industry || '—'} />
            <Detail label="Lead source" value={client.lead_source || '—'} />
            <Detail label="Payment terms" value={client.payment_terms || '—'} />
            <Detail label="Currency" value={client.default_currency} />
          </div>
          {client.tags && client.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {client.tags.map((t: string) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"><Tag className="h-3 w-3" />{t}</span>)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ClientCustomOptionsCard({ clientId }: { clientId: string }) {
  const { activeWorkspace } = useWorkspace();
  const [customValues, setCustomValues] = useState<Record<string, { value: any; unit?: string }>>({});
  const [fieldDefs, setFieldDefs] = useState<any[]>([]);
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [editingFieldDef, setEditingFieldDef] = useState<CustomFieldDef | undefined>(undefined);

  const handleOpenEditField = (field: CustomFieldDef, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingFieldDef(field);
    setShowBuilderModal(true);
  };
  const [editingValueField, setEditingValueField] = useState<CustomFieldDef | null>(null);
  const [editValue, setEditValue] = useState<any>('');
  const [editUnit, setEditUnit] = useState<string>('');
  const [savingValue, setSavingValue] = useState(false);

  const loadData = async () => {
    if (!activeWorkspace) return;
    const defs = await getCustomFieldDefs(activeWorkspace.id, 'client', true, clientId);
    const vals = await getCustomFieldValues(activeWorkspace.id, 'client', clientId);
    setFieldDefs(defs);
    setCustomValues(vals);
  };

  useEffect(() => {
    loadData();
  }, [activeWorkspace, clientId]);

  const activeFieldsWithValues = useMemo(() => {
    return fieldDefs.filter((field: CustomFieldDef) => {
      if (field.scope_type === 'record' && field.scope_entity_id === clientId) return true;
      const valObj = getCustomFieldValueForField(customValues, field);
      const hasVal = valObj && valObj.value !== undefined && valObj.value !== null && valObj.value !== '' && (!Array.isArray(valObj.value) || valObj.value.length > 0);
      return hasVal;
    });
  }, [fieldDefs, customValues, clientId]);

  const handleSavedField = async () => {
    await loadData();
  };

  const handleOpenEditValue = (field: CustomFieldDef) => {
    setEditingValueField(field);
    const existing = getCustomFieldValueForField(customValues, field);
    setEditValue(existing?.value ?? '');
    setEditUnit(existing?.unit ?? (field.unit_config && field.unit_config[0] ? field.unit_config[0] : ''));
  };

  const handleSaveFieldValue = async () => {
    if (!editingValueField || !activeWorkspace) return;
    if (editValue === undefined || editValue === null || editValue === '' || (Array.isArray(editValue) && editValue.length === 0)) {
      alert('Please enter a value.');
      return;
    }
    setSavingValue(true);
    const updated = {
      ...customValues,
      [editingValueField.id]: {
        value: editValue,
        unit: editUnit || undefined,
      },
    };
    if (editingValueField.field_key) {
      updated[editingValueField.field_key] = {
        value: editValue,
        unit: editUnit || undefined,
      };
    }
    await saveCustomFieldValues(activeWorkspace.id, 'client', clientId, updated);
    setCustomValues(updated);
    setSavingValue(false);
    setEditingValueField(null);
  };

  const handleDeleteCustomDetail = async (field: CustomFieldDef, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeWorkspace) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete the "${field.label}" custom field?`);
    if (!confirmDelete) return;

    if (field.scope_type === 'record') {
      await deleteCustomFieldDef(activeWorkspace.id, 'client', field.id);
    } else {
      await deleteCustomFieldValue(activeWorkspace.id, 'client', clientId, field.id);
    }
    await loadData();
  };

  return (
    <>
      <Card className="p-5 border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-blue-600" /> CUSTOM FIELDS
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Custom fields stored specifically for this client.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingFieldDef(undefined);
              setShowBuilderModal(true);
            }}
            className="bg-blue-600 text-white text-xs gap-1.5 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" /> Add Custom Field
          </Button>
        </div>

        {activeFieldsWithValues.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeFieldsWithValues.map((field) => {
              const valObj = getCustomFieldValueForField(customValues, field);
              const val = valObj ? valObj.value : null;
              const unit = valObj ? valObj.unit : null;

              return (
                <div
                  key={field.id}
                  onClick={() => handleOpenEditField(field)}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5 cursor-pointer hover:border-blue-400 hover:shadow-sm transition group relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">{field.label}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleOpenEditField(field, e)}
                        className="p-1 rounded text-slate-400 hover:text-blue-600 transition"
                        title="Edit custom field"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCustomDetail(field, e)}
                        title={`Delete ${field.label}`}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-sm font-bold text-slate-900">
                    {formatCustomFieldValue(val, field.field_type, unit) || (field.default_value ? formatCustomFieldValue(field.default_value, field.field_type, unit) : '—')}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 text-center text-xs text-slate-500">
            No custom fields created for this client yet.
          </div>
        )}
      </Card>

      {/* SINGLE STEP ADD / EDIT CUSTOM FIELD MODAL */}
      {showBuilderModal && (
        <CustomFieldBuilderModal
          open={showBuilderModal}
          onClose={() => {
            setShowBuilderModal(false);
            setEditingFieldDef(undefined);
          }}
          workspaceId={activeWorkspace?.id || ''}
          entityType="client"
          targetEntityId={clientId}
          existingField={editingFieldDef}
          onSaved={() => {
            setShowBuilderModal(false);
            setEditingFieldDef(undefined);
            handleSavedField();
          }}
        />
      )}

      {/* QUICK VALUE EDIT MODAL */}
      {editingValueField && (
        <Modal
          open={!!editingValueField}
          onClose={() => setEditingValueField(null)}
          title={`Edit ${editingValueField.label}`}
          size="sm"
        >
          <div className="space-y-4">
            <Field label={editingValueField.label} required={editingValueField.required}>
              {editingValueField.field_type === 'radio' ? (
                <div className="flex flex-wrap gap-4 pt-1">
                  {(editingValueField.options || ['Male', 'Female', 'Other']).map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="quick_edit_radio"
                        value={opt}
                        checked={editValue === opt}
                        onChange={() => setEditValue(opt)}
                        className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              ) : editingValueField.field_type === 'checkbox_group' || editingValueField.field_type === 'multi_select' ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {(editingValueField.options || []).map((opt) => {
                    const selectedList: string[] = Array.isArray(editValue) ? editValue : [];
                    const checked = selectedList.includes(opt);
                    const toggle = () => {
                      setEditValue(checked ? selectedList.filter((i) => i !== opt) : [...selectedList, opt]);
                    };
                    return (
                      <button
                        type="button"
                        key={opt}
                        onClick={toggle}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        {checked ? '✓ ' : '+ '} {opt}
                      </button>
                    );
                  })}
                </div>
              ) : editingValueField.field_type === 'dropdown' || editingValueField.field_type === 'searchable_dropdown' ? (
                <select
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select option...</option>
                  {(editingValueField.options || []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : editingValueField.field_type === 'yes_no' || editingValueField.field_type === 'checkbox' ? (
                <select
                  value={String(editValue)}
                  onChange={(e) => setEditValue(e.target.value === 'true' || e.target.value === 'Yes')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              ) : editingValueField.field_type === 'long_text' ? (
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder={`Enter ${editingValueField.label}...`}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              ) : editingValueField.field_type === 'unit' ? (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Value (e.g. 10)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                    autoFocus
                  />
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    {(editingValueField.unit_config || DEFAULT_UNITS).map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              ) : editingValueField.field_type === 'address' || editingValueField.label.toLowerCase().includes('address') ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={typeof editValue === 'object' ? (editValue.address_line1 || editValue.street || '') : (editValue || '')}
                    onChange={(e) => {
                      const line1 = e.target.value;
                      if (typeof editValue === 'object') {
                        setEditValue({ ...editValue, address_line1: line1 });
                      } else {
                        setEditValue(line1);
                      }
                    }}
                    placeholder="Street Address / Line 1 (e.g. 123 MG Road)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={typeof editValue === 'object' ? (editValue.city || '') : ''}
                      onChange={(e) => {
                        const c = e.target.value;
                        const curr = typeof editValue === 'object' ? editValue : { address_line1: String(editValue || '') };
                        setEditValue({ ...curr, city: c });
                      }}
                      placeholder="City (e.g. Bengaluru)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={typeof editValue === 'object' ? (editValue.state || '') : ''}
                      onChange={(e) => {
                        const s = e.target.value;
                        const curr = typeof editValue === 'object' ? editValue : { address_line1: String(editValue || '') };
                        setEditValue({ ...curr, state: s });
                      }}
                      placeholder="State (e.g. Karnataka)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={typeof editValue === 'object' ? (editValue.postal_code || editValue.zip || editValue.pincode || '') : ''}
                      onChange={(e) => {
                        const p = e.target.value;
                        const curr = typeof editValue === 'object' ? editValue : { address_line1: String(editValue || '') };
                        setEditValue({ ...curr, postal_code: p });
                      }}
                      placeholder="Postal Code (e.g. 560001)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={typeof editValue === 'object' ? (editValue.country || '') : ''}
                      onChange={(e) => {
                        const c = e.target.value;
                        const curr = typeof editValue === 'object' ? editValue : { address_line1: String(editValue || '') };
                        setEditValue({ ...curr, country: c });
                      }}
                      placeholder="Country (e.g. India)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <input
                  type={editingValueField.field_type === 'number' || editingValueField.field_type === 'decimal' || editingValueField.field_type === 'currency' || editingValueField.field_type === 'percentage' ? 'number' : editingValueField.field_type === 'date' ? 'date' : editingValueField.field_type === 'datetime' ? 'datetime-local' : editingValueField.field_type === 'time' ? 'time' : 'text'}
                  value={typeof editValue === 'object' ? formatCustomFieldValue(editValue) : editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder={`Enter ${editingValueField.label}...`}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              )}
            </Field>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingValueField(null)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={savingValue} onClick={handleSaveFieldValue} className="bg-blue-600 text-white">
                {savingValue ? 'Saving...' : 'Save Value'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ----------------------------------------------------------------------
// PROJECTS TAB
// ----------------------------------------------------------------------
function ProjectsTab({ client }: { client: Client }) {
  const { activeWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!activeWorkspace) return;
      setLoading(true);
      const { data } = await supabase.from('projects').select('*').eq('workspace_id', activeWorkspace.id).eq('client_id', client.id).neq('status', 'archived').order('created_at', { ascending: false });
      if (active) { setProjects((data || []) as Project[]); setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [client.id, activeWorkspace]);

  if (loading) return <LoadingState />;

  return (
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
  );
}

// ----------------------------------------------------------------------
// QUOTATIONS TAB
// ----------------------------------------------------------------------
function QuotationsTab({ client }: { client: Client }) {
  const { activeWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!activeWorkspace) return;
      setLoading(true);
      const { data } = await supabase.from('quotations').select('*').eq('workspace_id', activeWorkspace.id).eq('client_id', client.id).eq('is_deleted', false).order('created_at', { ascending: false });
      if (active) { setQuotations((data || []) as Quotation[]); setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [client.id, activeWorkspace]);

  if (loading) return <LoadingState />;

  return (
    <Card className="p-4">
      {quotations.length === 0 ? <EmptyState icon={<FileText className="h-8 w-8" />} title="No quotations" description="Create a quotation for this client." /> : (
        <DataTable
          columns={[
            { key: 'num', header: 'Number', render: (q) => <span className="font-mono text-xs text-slate-600">{q.quotation_number}</span> },
            { key: 'subject', header: 'Subject', render: (q) => <span className="text-slate-700">{q.subject ?? '—'}</span> },
            { key: 'date', header: 'Date', render: (q) => <span className="text-slate-500">{formatDate(q.quotation_date)}</span> },
            { key: 'total', header: 'Total', render: (q) => <span className="font-medium text-slate-700">{formatCurrency(Number(q.total), q.currency)}</span> },
            { key: 'status', header: 'Status', render: (q) => <StatusBadge status={q.status} tone={q.status === 'approved' || q.status === 'converted' ? 'success' : q.status === 'rejected' || q.status === 'expired' ? 'danger' : 'info'} /> },
          ]}
          rows={quotations}
          rowKey={(q) => q.id}
          onRowClick={(q) => navigate(`/quotations/${q.id}`)}
          searchKeys={(q) => `${q.quotation_number} ${q.subject ?? ''} ${q.status}`}
          empty="No quotations match your search."
        />
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------
// INVOICES TAB
// ----------------------------------------------------------------------
function InvoicesTab({ client }: { client: Client }) {
  const { activeWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!activeWorkspace) return;
      setLoading(true);
      const { data } = await supabase.from('invoices').select('*').eq('workspace_id', activeWorkspace.id).eq('client_id', client.id).eq('is_deleted', false).order('created_at', { ascending: false });
      if (active) { setInvoices((data || []) as Invoice[]); setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [client.id, activeWorkspace]);

  if (loading) return <LoadingState />;

  return (
    <Card className="p-4">
      {invoices.length === 0 ? <EmptyState icon={<Receipt className="h-8 w-8" />} title="No invoices" /> : (
        <DataTable
          columns={[
            { key: 'num', header: 'Number', render: (i) => <span className="font-mono text-xs text-slate-600">{i.invoice_number}</span> },
            { key: 'type', header: 'Type', render: (i) => <span className="text-slate-600 capitalize">{i.invoice_type.replace(/_/g, ' ')}</span> },
            { key: 'date', header: 'Date', render: (i) => <span className="text-slate-500">{formatDate(i.invoice_date)}</span> },
            { key: 'total', header: 'Total', render: (i) => <span className="font-medium text-slate-700">{formatCurrency(Number(i.total), i.currency)}</span> },
            { key: 'bal', header: 'Balance', render: (i) => <span className={Number(i.balance_due) > 0 ? 'text-amber-600' : 'text-emerald-600'}>{formatCurrency(Number(i.balance_due), i.currency)}</span> },
            { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} tone={i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'danger' : i.status === 'partially_paid' ? 'warning' : 'neutral'} /> },
          ]}
          rows={invoices}
          rowKey={(i) => i.id}
          onRowClick={(i) => navigate(`/invoices/${i.id}`)}
          searchKeys={(i) => `${i.invoice_number} ${i.status} ${i.invoice_type}`}
          empty="No invoices match your search."
        />
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------
// PAYMENTS TAB
// ----------------------------------------------------------------------
function PaymentsTab({ client }: { client: Client }) {
  const { activeWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!activeWorkspace) return;
      setLoading(true);
      const { data } = await supabase.from('payments').select('*').eq('workspace_id', activeWorkspace.id).eq('client_id', client.id).eq('is_deleted', false).order('created_at', { ascending: false });
      if (active) { setPayments((data || []) as Payment[]); setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [client.id, activeWorkspace]);

  if (loading) return <LoadingState />;

  return (
    <Card className="p-4">
      {payments.length === 0 ? <EmptyState icon={<CreditCard className="h-8 w-8" />} title="No payments" /> : (
        <DataTable
          columns={[
            { key: 'num', header: 'Number', render: (p) => <span className="font-mono text-xs text-slate-600">{p.payment_number}</span> },
            { key: 'date', header: 'Date', render: (p) => <span className="text-slate-500">{formatDate(p.payment_date)}</span> },
            { key: 'amount', header: 'Amount', render: (p) => <span className="font-medium text-slate-700">{formatCurrency(Number(p.amount))}</span> },
            { key: 'mode', header: 'Mode', render: (p) => <span className="text-slate-600 capitalize">{p.payment_mode.replace(/_/g, ' ')}</span> },
            { key: 'verify', header: 'Verification', render: (p) => <StatusBadge status={p.verification_status} tone={p.verification_status === 'verified' ? 'success' : p.verification_status === 'reversed' ? 'danger' : 'warning'} /> },
          ]}
          rows={payments}
          rowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/payments/${p.id}`)}
          searchKeys={(p) => `${p.payment_number} ${p.payment_mode} ${p.verification_status}`}
          empty="No payments match your search."
        />
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------
// ACTIVITY TAB
// ----------------------------------------------------------------------
function ActivityTab({ client }: { client: Client }) {
  const { activeWorkspace } = useWorkspace();
  const [timeline, setTimeline] = useState<ClientTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!activeWorkspace) return;
      setLoading(true);
      const { data } = await supabase.from('client_timeline').select('*').eq('workspace_id', activeWorkspace.id).eq('client_id', client.id).order('event_date', { ascending: false });
      if (active) { setTimeline((data || []) as ClientTimelineEvent[]); setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [client.id, activeWorkspace]);

  if (loading) return <LoadingState />;

  return (
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
  );
}

// ----------------------------------------------------------------------
// NOTES TAB
// ----------------------------------------------------------------------
function NotesTab({ client }: { client: Client }) {
  const { activeWorkspace } = useWorkspace();
  const [timeline, setTimeline] = useState<ClientTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    const { data } = await supabase.from('client_timeline').select('*').eq('workspace_id', activeWorkspace.id).eq('client_id', client.id).order('event_date', { ascending: false });
    setTimeline((data || []) as ClientTimelineEvent[]);
    setLoading(false);
  }, [activeWorkspace, client.id]);

  useEffect(() => { load(); }, [load]);

  const saveNote = async () => {
    if (!noteText.trim() || !activeWorkspace) return;
    setSavingNote(true);
    try {
      await supabase.from('client_timeline').insert({
        workspace_id: activeWorkspace.id,
        client_id: client.id,
        event_type: 'note_added',
        title: 'Internal Note',
        description: noteText.trim(),
      });
      setNoteText('');
      load();
    } catch (e: any) {
      console.error('Failed to add note', e);
    }
    setSavingNote(false);
  };

  if (loading) return <LoadingState />;

  return (
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
  );
}

// ----------------------------------------------------------------------
// SHARED UI COMPONENTS
// ----------------------------------------------------------------------
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

function MetricCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' }) {
  const tones = { neutral: 'text-slate-900', success: 'text-emerald-700', warning: 'text-amber-700', danger: 'text-rose-700', brand: 'text-blue-700' };
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={classNames('mt-1 text-lg font-semibold', tones[tone])}>{value}</div>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div>
      <span className="text-slate-400 block text-xs">{label}</span>
      <span className="text-slate-700 font-medium">{value}</span>
    </div>
  );
}
