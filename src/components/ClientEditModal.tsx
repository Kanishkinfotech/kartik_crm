import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { addTimelineEvent, addAuditLog, nextEntityNumber } from '@/lib/data';
import type { Client, ClientStatus, ExtendedClientType } from '@/lib/types';
import { Button, Modal, Field, TextInput, TextArea, Select } from '@/components/ui';
import { CustomFieldsSection } from './CustomFieldsSection';
import { getCustomFieldValues, saveCustomFieldValues, CLIENT_TYPE_LABELS } from '@/lib/customFields';
import { validateWebsiteUrl, validatePhoneNumber, validateEmail, validatePAN, validateGSTIN, normalizeContactPhone, normalizeContactEmail } from '@/lib/contactValidation';

const STATUS_OPTIONS: ClientStatus[] = ['prospect', 'active', 'inactive', 'on_hold', 'completed', 'lost', 'blacklisted'];

const EMPTY_FORM = {
  client_type: 'business' as ExtendedClientType,
  business_name: '',
  contact_person: '',
  primary_phone: '',
  whatsapp_number: '',
  primary_email: '',
  secondary_email: '',
  website: '',
  industry: '',
  lead_source: '',
  status: 'prospect' as ClientStatus,
  billing_address: '',
  shipping_address: '',
  city: '',
  state: '',
  country: 'India',
  pincode: '',
  gst_registered: false,
  gstin: '',
  pan: '',
  tax_treatment: '',
  default_currency: 'INR',
  payment_terms: '',
  internal_notes: '',
  tags: '',
};

export function ClientEditModal({ 
  open, 
  onClose, 
  onSaved, 
  workspaceId,
  client 
}: { 
  open: boolean; 
  onClose: () => void; 
  onSaved: (c: Client) => void; 
  workspaceId: string;
  client?: Client;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [customValues, setCustomValues] = useState<Record<string, { value: any; unit?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fetchingPincode, setFetchingPincode] = useState(false);

  useEffect(() => {
    if (client && open) {
      setForm({
        client_type: client.client_type,
        business_name: client.business_name || '',
        contact_person: client.contact_person || '',
        primary_phone: client.primary_phone || '',
        whatsapp_number: client.whatsapp_number || '',
        primary_email: client.primary_email || '',
        secondary_email: client.secondary_email || '',
        website: client.website || '',
        industry: client.industry || '',
        lead_source: client.lead_source || '',
        status: client.status,
        billing_address: client.billing_address || '',
        shipping_address: client.shipping_address || '',
        city: client.city || '',
        state: client.state || '',
        country: client.country || 'India',
        pincode: client.pincode || '',
        gst_registered: client.gst_registered,
        gstin: client.gstin || '',
        pan: client.pan || '',
        tax_treatment: client.tax_treatment || '',
        default_currency: client.default_currency || 'INR',
        payment_terms: client.payment_terms || '',
        internal_notes: client.internal_notes || '',
        tags: client.tags ? client.tags.join(', ') : '',
      });
      setTouched({});

      getCustomFieldValues(workspaceId, 'client', client.id).then((vals) => {
        setCustomValues(vals);
      });
    } else if (open) {
      setForm(EMPTY_FORM);
      setCustomValues({});
      setTouched({});
    }
  }, [client, open, workspaceId]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const fetchPincode = async (address: string, city: string, state: string, currentPincode: string) => {
    if (!city || currentPincode) return; // Don't overwrite if already has pincode
    
    setFetchingPincode(true);
    try {
      // 1. Try Nominatim (OpenStreetMap) first for high-accuracy address-based lookup
      const addressQuery = [address, city, state].filter(Boolean).join(', ');
      if (addressQuery) {
        try {
          const osmRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressQuery)}&format=json&addressdetails=1&limit=1`);
          if (osmRes.ok) {
            const data = await osmRes.json();
            if (data && data.length > 0 && data[0].address && data[0].address.postcode) {
              set('pincode', data[0].address.postcode);
              return;
            }
          }
        } catch (osmError) {
          console.warn('OSM Pincode lookup failed, falling back to Postal API:', osmError);
        }
      }

      // 2. Fallback to Postal API (City based)
      let queryCity = city;
      const lowerCity = city.toLowerCase().trim();
      if (lowerCity === 'bengaluru' || lowerCity === 'banglore' || lowerCity === 'bengluru') {
        queryCity = 'Bangalore';
      } else if (lowerCity === 'hyderbad' || lowerCity === 'hayderabad' || lowerCity === 'hyderabad') {
        queryCity = 'Hyderabad';
      }

      const res = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(queryCity)}`);
      const data = await res.json();
      if (data && data[0] && data[0].Status === 'Success' && data[0].PostOffice && data[0].PostOffice.length > 0) {
        let match = data[0].PostOffice[0];
        if (state) {
          const stateMatch = data[0].PostOffice.find((po: any) => po.State.toLowerCase() === state.toLowerCase());
          if (stateMatch) match = stateMatch;
        }
        set('pincode', match.Pincode);
      }
    } catch (e) {
      console.error('Error fetching pincode:', e);
    } finally {
      setFetchingPincode(false);
    }
  };

  // Validation rules for Website and Phone numbers
  const websiteValidation = useMemo(
    () => validateWebsiteUrl(form.website, { required: false }),
    [form.website]
  );

  const primaryPhoneValidation = useMemo(
    () => validatePhoneNumber(form.primary_phone, { required: true, fieldLabel: 'Primary phone' }),
    [form.primary_phone]
  );

  const whatsappValidation = useMemo(
    () => validatePhoneNumber(form.whatsapp_number, { required: false, fieldLabel: 'WhatsApp number' }),
    [form.whatsapp_number]
  );

  const primaryEmailValidation = useMemo(
    () => validateEmail(form.primary_email, { required: false, fieldLabel: 'Primary email' }),
    [form.primary_email]
  );

  const secondaryEmailValidation = useMemo(
    () => validateEmail(form.secondary_email, { required: false, fieldLabel: 'Secondary email' }),
    [form.secondary_email]
  );

  const panValidation = useMemo(
    () => validatePAN(form.pan, { required: false }),
    [form.pan]
  );

  const gstinValidation = useMemo(
    () => validateGSTIN(form.gstin, { required: form.gst_registered }),
    [form.gstin, form.gst_registered]
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      contact_person: true,
      primary_phone: true,
      whatsapp_number: true,
      primary_email: true,
      secondary_email: true,
      website: true,
      pan: true,
      gstin: true,
    });

    if (!form.contact_person.trim()) {
      setError('Contact person / client name is required.');
      return;
    }

    if (!primaryPhoneValidation.isValid) {
      setError(primaryPhoneValidation.error || 'Please enter a valid primary phone number.');
      return;
    }

    if (!whatsappValidation.isValid) {
      setError(whatsappValidation.error || 'Please enter a valid WhatsApp number.');
      return;
    }

    if (!primaryEmailValidation.isValid) {
      setError(primaryEmailValidation.error || 'Please enter a valid primary email address.');
      return;
    }

    if (!secondaryEmailValidation.isValid) {
      setError(secondaryEmailValidation.error || 'Please enter a valid secondary email address.');
      return;
    }

    if (!websiteValidation.isValid) {
      setError(websiteValidation.error || 'Please enter a valid website URL.');
      return;
    }

    if (!panValidation.isValid) {
      setError(panValidation.error || 'Please enter a valid PAN.');
      return;
    }

    if (!gstinValidation.isValid) {
      setError(gstinValidation.error || 'Please enter a valid GSTIN.');
      return;
    }

    // Duplicate client check (ensures unique phone number and email across clients)
    try {
      const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(`k1_clients_${workspaceId}`) : null;
      let existingList: Client[] = cached ? JSON.parse(cached) : [];
      if (existingList.length === 0) {
        const { data: dbClients } = await supabase
          .from('clients')
          .select('id, contact_person, client_number, primary_phone, primary_email')
          .eq('workspace_id', workspaceId)
          .eq('is_deleted', false);
        if (dbClients) existingList = dbClients as Client[];
      }

      const normPhone = normalizeContactPhone(form.primary_phone);
      const normEmail = normalizeContactEmail(form.primary_email);

      const duplicate = existingList.find((c) => {
        if (client && c.id === client.id) return false;
        if (normPhone && normalizeContactPhone(c.primary_phone) === normPhone) return true;
        if (normEmail && normalizeContactEmail(c.primary_email) === normEmail) return true;
        return false;
      });

      if (duplicate) {
        setError(`A client with this phone number or email already exists (${duplicate.contact_person || duplicate.client_number}). Duplicate clients are not allowed.`);
        return;
      }
    } catch {
      // Fallback
    }

    setBusy(true);
    setError(null);

    const row = {
      workspace_id: workspaceId,
      client_type: form.client_type,
      business_name: form.business_name || null,
      contact_person: form.contact_person.trim(),
      primary_phone: form.primary_phone.trim(),
      whatsapp_number: form.whatsapp_number || null,
      primary_email: form.primary_email || null,
      secondary_email: form.secondary_email || null,
      website: form.website || null,
      industry: form.industry || null,
      lead_source: form.lead_source || null,
      status: form.status,
      billing_address: form.billing_address || null,
      shipping_address: form.shipping_address || null,
      city: form.city || null,
      state: form.state || null,
      country: form.country || 'India',
      pincode: form.pincode || null,
      gst_registered: form.gst_registered,
      gstin: form.gstin || null,
      pan: form.pan || null,
      tax_treatment: form.tax_treatment || null,
      default_currency: form.default_currency || 'INR',
      payment_terms: form.payment_terms || null,
      internal_notes: form.internal_notes || null,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    };

    if (client) {
      // Update existing
      let savedClient: Client = {
        ...client,
        ...row,
        updated_at: new Date().toISOString(),
      } as Client;

      try {
        const { data, error } = await supabase
          .from('clients')
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq('id', client.id)
          .eq('workspace_id', workspaceId)
          .select()
          .single();
        
        if (!error && data) {
          savedClient = data as Client;
        }
      } catch {
        // Fallback to local
      }

      // Update in localStorage
      try {
        const cached = localStorage.getItem(`k1_clients_${workspaceId}`);
        const list: Client[] = cached ? JSON.parse(cached) : [];
        const idx = list.findIndex((c) => c.id === client.id);
        if (idx >= 0) list[idx] = savedClient;
        else list.unshift(savedClient);
        localStorage.setItem(`k1_clients_${workspaceId}`, JSON.stringify(list));
      } catch {
        // ignore
      }

      try {
        await saveCustomFieldValues(workspaceId, 'client', client.id, customValues);
        await addAuditLog(workspaceId, user?.id ?? null, 'client', client.id, 'update', {
          changeSummary: `Updated client ${client.client_number}`,
          before: client as unknown as Record<string, unknown>,
          after: savedClient as unknown as Record<string, unknown>,
        });
      } catch {
        // ignore
      }

      setBusy(false);
      onSaved(savedClient);
    } else {
      // Create new
      let newClient: Client = {
        id: `client-${Date.now()}`,
        client_number: `CL-${Math.floor(100 + Math.random() * 900)}`,
        created_by: user?.id ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false,
        ...row,
      } as Client;

      try {
        const clientNumber = await nextEntityNumber(workspaceId, 'clients', 'CLT');
        const { data, error } = await supabase
          .from('clients')
          .insert({ ...row, client_number: clientNumber, created_by: user?.id ?? null })
          .select()
          .single();
        
        if (!error && data) {
          newClient = data as Client;
        }
      } catch {
        // Fallback to local
      }

      // Save to localStorage
      try {
        const cached = localStorage.getItem(`k1_clients_${workspaceId}`);
        const list: Client[] = cached ? JSON.parse(cached) : [];
        list.unshift(newClient);
        localStorage.setItem(`k1_clients_${workspaceId}`, JSON.stringify(list));
      } catch {
        // ignore
      }

      try {
        await saveCustomFieldValues(workspaceId, 'client', newClient.id, customValues);
        await addTimelineEvent(workspaceId, newClient.id, 'client_created', {
          title: 'Client created',
          description: `${newClient.business_name ?? newClient.contact_person} added as ${newClient.status}.`,
          actorId: user?.id ?? null,
          relatedEntityType: 'client',
          relatedEntityId: newClient.id,
        });
      } catch {
        // ignore
      }

      setBusy(false);
      onSaved(newClient);
    }
  };

  const handleCancel = () => {
    if (form.contact_person.trim() || form.primary_phone.trim()) {
      const confirmDiscard = window.confirm('You have unsaved client information. Are you sure you want to close without saving?');
      if (!confirmDiscard) return;
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={handleCancel} title={client ? "Edit client" : "New client"} size="xl" preventEscape={true}>
      <form
        noValidate
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="space-y-5"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Client Name" required hint="Full name of client or primary contact">
            <TextInput value={form.contact_person} onChange={(e) => set('contact_person', e.target.value)} placeholder="e.g. Dr. Sanjay, ABC Realtors, John Doe" autoFocus />
          </Field>
          <Field label="Company / Business Name">
            <TextInput value={form.business_name} onChange={(e) => set('business_name', e.target.value)} placeholder="e.g. Acme Realtors Pvt Ltd" />
          </Field>
          <Field label="Client Type">
            <Select value={form.client_type} onChange={(e) => set('client_type', e.target.value as ExtendedClientType)}>
              {Object.entries(CLIENT_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field 
            label="Primary phone" 
            required
            error={touched.primary_phone ? primaryPhoneValidation.error : undefined}
          >
            <TextInput 
              value={form.primary_phone} 
              onChange={(e) => {
                setTouched((t) => ({ ...t, primary_phone: true }));
                set('primary_phone', e.target.value);
              }}
              onBlur={() => setTouched((t) => ({ ...t, primary_phone: true }))}
              placeholder="+91 98765 43210" 
            />
          </Field>
          <Field 
            label="WhatsApp number"
            error={touched.whatsapp_number ? whatsappValidation.error : undefined}
          >
            <TextInput 
              value={form.whatsapp_number} 
              onChange={(e) => {
                setTouched((t) => ({ ...t, whatsapp_number: true }));
                set('whatsapp_number', e.target.value);
              }}
              onBlur={() => setTouched((t) => ({ ...t, whatsapp_number: true }))}
              placeholder="+91 98765 43210" 
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value as ClientStatus)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field 
            label="Primary email"
            error={touched.primary_email ? primaryEmailValidation.error : undefined}
          >
            <TextInput 
              type="text"
              value={form.primary_email} 
              onChange={(e) => {
                setTouched((t) => ({ ...t, primary_email: true }));
                set('primary_email', e.target.value);
              }}
              onBlur={() => setTouched((t) => ({ ...t, primary_email: true }))}
              placeholder="contact@acme.com" 
            />
          </Field>
          <Field 
            label="Secondary email"
            error={touched.secondary_email ? secondaryEmailValidation.error : undefined}
          >
            <TextInput 
              type="text"
              value={form.secondary_email} 
              onChange={(e) => {
                setTouched((t) => ({ ...t, secondary_email: true }));
                set('secondary_email', e.target.value);
              }}
              onBlur={() => setTouched((t) => ({ ...t, secondary_email: true }))}
              placeholder="e.g. secondary@acme.com"
            />
          </Field>
          <Field 
            label="Website"
            error={touched.website ? websiteValidation.error : undefined}
          >
            <TextInput 
              value={form.website} 
              onChange={(e) => {
                setTouched((t) => ({ ...t, website: true }));
                set('website', e.target.value);
              }}
              onBlur={() => setTouched((t) => ({ ...t, website: true }))}
              placeholder="e.g. acme.com or https://acme.com" 
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Industry">
            <TextInput value={form.industry} onChange={(e) => set('industry', e.target.value)} placeholder="IT Services" />
          </Field>
          <Field label="Lead source">
            <TextInput value={form.lead_source} onChange={(e) => set('lead_source', e.target.value)} placeholder="Referral" />
          </Field>
          <Field label="Default currency">
            <Select value={form.default_currency} onChange={(e) => set('default_currency', e.target.value)}>
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Billing address">
            <TextArea 
              value={form.billing_address} 
              onChange={(e) => set('billing_address', e.target.value)} 
              onBlur={() => fetchPincode(form.billing_address || '', form.city, form.state, form.pincode)}
              spellCheck={false} 
            />
          </Field>
          <Field label="Shipping Address details">
            <TextArea 
              value={form.shipping_address} 
              onChange={(e) => set('shipping_address', e.target.value)} 
              onBlur={() => fetchPincode(form.shipping_address || '', form.city, form.state, form.pincode)}
              spellCheck={false} 
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <TextInput 
                value={form.city} 
                onChange={(e) => set('city', e.target.value)} 
                onBlur={() => fetchPincode(form.shipping_address || form.billing_address || '', form.city, form.state, form.pincode)}
              />
            </Field>
            <Field label="State">
              <TextInput 
                value={form.state} 
                onChange={(e) => set('state', e.target.value)} 
                onBlur={() => fetchPincode(form.shipping_address || form.billing_address || '', form.city, form.state, form.pincode)}
              />
            </Field>
            <Field label="Country"><TextInput value={form.country} onChange={(e) => set('country', e.target.value)} /></Field>
            <Field label="Pincode details">
              <div className="relative">
                <TextInput value={form.pincode} onChange={(e) => set('pincode', e.target.value)} />
                {fetchingPincode && <div className="absolute right-2 top-2 text-xs text-slate-400">Fetching...</div>}
              </div>
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label="GST registered">
            <Select value={form.gst_registered ? 'yes' : 'no'} onChange={(e) => set('gst_registered', e.target.value === 'yes')}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="GSTIN" error={touched.gstin && !gstinValidation.isValid ? gstinValidation.error : undefined}>
            <TextInput
              value={form.gstin}
              onChange={(e) => {
                setTouched((t) => ({ ...t, gstin: true }));
                set('gstin', e.target.value.toUpperCase());
              }}
              onBlur={() => setTouched((t) => ({ ...t, gstin: true }))}
              disabled={!form.gst_registered}
              placeholder="e.g. 29ABCDE1234F1Z5"
            />
          </Field>
          <Field label="PAN" error={touched.pan && !panValidation.isValid ? panValidation.error : undefined}>
            <TextInput
              value={form.pan}
              onChange={(e) => {
                setTouched((t) => ({ ...t, pan: true }));
                set('pan', e.target.value.toUpperCase());
              }}
              onBlur={() => setTouched((t) => ({ ...t, pan: true }))}
              placeholder="e.g. ABCDE1234F"
            />
          </Field>
          <Field label="Tax treatment">
            <Select value={form.tax_treatment} onChange={(e) => set('tax_treatment', e.target.value)}>
              <option value="">Select…</option>
              <option value="Regular">Regular</option>
              <option value="Composition">Composition</option>
              <option value="Unregistered">Unregistered</option>
              <option value="Overseas">Overseas</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Payment terms">
            <Select value={form.payment_terms} onChange={(e) => set('payment_terms', e.target.value)}>
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
          <Field label="Tags" hint="Labels to categorize the client (e.g. VIP, Hot, Tech). Comma-separated.">
            <TextInput value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="priority, enterprise" />
          </Field>
        </div>

        <Field label="Internal notes"><TextArea value={form.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} /></Field>

        {/* CUSTOM FIELDS SECTION */}
        <CustomFieldsSection
          workspaceId={workspaceId}
          entityType="client"
          entityId={client?.id}
          valuesMap={customValues}
          onChangeValues={setCustomValues}
        />

        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : (client ? 'Save changes' : 'Create client')}</Button>
        </div>
      </form>
    </Modal>
  );
}

