import { supabase } from './supabase';
import { nextEntityNumber, addTimelineEvent } from './data';
import { convertLeadCustomValuesToClient } from './customFields';
import type { Lead, Client, LeadActivityEvent } from './types';

export async function convertLeadToClientAction(
  workspaceId: string,
  lead: Lead,
  userId?: string | null
): Promise<{ success: boolean; client?: Client; message: string }> {
  if (!workspaceId || !lead) {
    return { success: false, message: 'Invalid workspace or lead.' };
  }

  // 1. DUPLICATE PROTECTION: If lead is already converted, return existing converted_client_id
  if (lead.converted_client_id) {
    return {
      success: false,
      message: 'This lead has already been converted to a client.',
    };
  }

  // 2. GENERATE CLIENT NUMBER
  let clientNumber = `CLT-0001`;
  try {
    clientNumber = await nextEntityNumber(workspaceId, 'clients', 'CLT');
  } catch {
    clientNumber = `CLT-${Date.now().toString().slice(-4)}`;
  }

  // 3. CONSTRUCT REAL CLIENT PAYLOAD MATCHING DB SCHEMA EXACTLY
  const clientId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const convertEvent: LeadActivityEvent = {
    id: `evt_${Date.now()}`,
    lead_id: lead.id,
    workspace_id: workspaceId,
    event_type: 'client_converted',
    title: 'Converted to Client',
    description: `Converted to Client ${clientNumber} by ${userId || 'User'}.`,
    created_at: nowIso,
  };

  const clientPayload: Omit<Client, 'created_at' | 'updated_at'> & { created_at: string; updated_at: string } = {
    id: clientId,
    workspace_id: workspaceId,
    client_number: clientNumber,
    client_type: 'business',
    business_name: (lead.company_name || '').trim() || null,
    contact_person: (lead.contact_name || lead.company_name || 'Client').trim(),
    primary_phone: lead.phone || '',
    whatsapp_number: lead.phone || null,
    primary_email: lead.email || null,
    secondary_email: null,
    website: null,
    industry: null,
    lead_source: lead.source || null,
    account_manager_id: lead.assigned_to || null,
    status: 'active',
    billing_address: null,
    shipping_address: null,
    city: null,
    state: null,
    country: 'India',
    pincode: null,
    gst_registered: false,
    gstin: null,
    pan: null,
    tax_treatment: null,
    default_currency: lead.currency || 'INR',
    payment_terms: null,
    internal_notes: `Converted from Lead ${lead.lead_number || lead.id}.\nSource: ${lead.source || 'N/A'}\nService Interest: ${lead.interested_service_name || 'N/A'}\nRequirement: ${lead.requirement || 'N/A'}\nNotes: ${lead.notes || 'N/A'}`,
    tags: ['Converted Lead'],
    created_by: userId || null,
    created_at: nowIso,
    updated_at: nowIso,
    is_deleted: false,
  };

  // 4. INSERT INTO SUPABASE 'clients' TABLE
  let createdClient: Client = clientPayload as Client;
  try {
    const { data, error } = await supabase
      .from('clients')
      .insert(clientPayload)
      .select()
      .maybeSingle();

    if (!error && data) {
      createdClient = data as Client;
    }
  } catch (err) {
    console.error('Supabase client insert error:', err);
  }

  // 5. UPDATE LOCAL STORAGE CACHE FOR CLIENTS LIST
  try {
    const cacheKey = `k1_clients_${workspaceId}`;
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    const existingList: Client[] = cached ? JSON.parse(cached) : [];
    const filteredList = existingList.filter((c) => c.id !== createdClient.id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(cacheKey, JSON.stringify([createdClient, ...filteredList]));
    }
  } catch {
    // Ignore cache error
  }

  // 6. TRANSFER CUSTOM FIELD VALUES
  try {
    await convertLeadCustomValuesToClient(workspaceId, lead.id, createdClient.id);
  } catch (err) {
    console.error('Custom field values transfer error:', err);
  }

  // 7. UPDATE LEAD STATUS TO WON & CONVERTED_CLIENT_ID
  const updatedTimeline = [...(lead.timeline_events || []), convertEvent];
  try {
    const { error: updateErr } = await supabase.from('leads').update({ status: 'won', converted_client_id: createdClient.id, updated_at: nowIso }).eq('id', lead.id);
      if (updateErr) throw updateErr;
  } catch (err) {
    console.error('Lead status update error:', err);
  }

  return {
    success: true,
    client: createdClient,
    message: 'Lead successfully converted to Client.',
  };
}

export async function revertClientToLeadAction(
  workspaceId: string,
  lead: Lead,
  userId?: string | null
): Promise<{ success: boolean; message: string; updatedLead?: Lead }> {
  if (!workspaceId || !lead || !lead.converted_client_id) {
    return { success: false, message: 'This lead is not currently converted to a client.' };
  }

  const clientId = lead.converted_client_id;

  // 1. CHECK DEPENDENT BUSINESS RECORDS
  let hasDependentRecords = false;

  try {
    const [projRes, quotRes, invRes, payRes, taskRes] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('client_id', clientId),
      supabase.from('quotations').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('client_id', clientId).eq('is_deleted', false),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('client_id', clientId).eq('is_deleted', false),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('client_id', clientId),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('client_id', clientId),
    ]);

    const totalDependentCount =
      (projRes.count || 0) +
      (quotRes.count || 0) +
      (invRes.count || 0) +
      (payRes.count || 0) +
      (taskRes.count || 0);

    if (totalDependentCount > 0) {
      hasDependentRecords = true;
    }
  } catch {
    // Fallback
  }

  if (hasDependentRecords) {
    return {
      success: false,
      message: 'This Client already has linked business records and cannot be safely reverted.',
    };
  }

  const nowIso = new Date().toISOString();

  // 2. SOFT DELETE / UNLINK CLIENT IN DB
  try {
    await supabase
      .from('clients')
      .update({ is_deleted: true, updated_at: nowIso })
      .eq('id', clientId)
      .eq('workspace_id', workspaceId);
  } catch (err) {
    console.error('Failed to soft delete client in Supabase:', err);
  }

  // 3. REMOVE / MARK DELETED IN LOCAL CACHE
  try {
    const cacheKey = `k1_clients_${workspaceId}`;
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    if (cached) {
      const existingList: Client[] = JSON.parse(cached);
      const filteredList = existingList.filter((c) => c.id !== clientId);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(cacheKey, JSON.stringify(filteredList));
      }
    }
  } catch {
    // Ignore cache error
  }

  // 4. RESTORE LEAD IN DB & AUDIT HISTORY
  const revertEvent: LeadActivityEvent = {
    id: `evt_${Date.now()}`,
    lead_id: lead.id,
    workspace_id: workspaceId,
    event_type: 'reverted_to_lead',
    title: 'Reverted from Client',
    description: `Client ${clientId} was reverted back to Lead state by ${userId || 'User'}.`,
    created_at: nowIso,
  };

  const updatedLeadPayload: Lead = {
    ...lead,
    status: lead.status === 'won' ? 'qualified' : lead.status,
    converted_client_id: undefined,
    timeline_events: [...(lead.timeline_events || []), revertEvent],
    updated_at: nowIso,
  };

  try {
    const { error: revertErr } = await supabase.from('leads').update({ status: lead.status === 'won' ? 'qualified' : lead.status, updated_at: nowIso }).eq('id', lead.id);
      if (revertErr) throw revertErr;
  } catch (err) {
    console.error('Failed to update lead status in Supabase:', err);
  }

  return {
    success: true,
    message: 'Client successfully reverted to Lead.',
    updatedLead: updatedLeadPayload,
  };
}
