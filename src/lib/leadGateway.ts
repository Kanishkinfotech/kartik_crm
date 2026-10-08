import { supabase } from './supabase';
import type { Lead, LeadSource, LeadStatus, LeadPriority, LeadActivityEvent, LeadFollowUp } from './types';
import { sendLeadWorkflowEmail } from './leadEmailWorkflow';
import { validatePhoneNumber, validateWebsiteUrl, findDuplicateLead, type DuplicateMatchResult } from './contactValidation';

export interface WebsiteLeadPayload {
  workspace_id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  service?: string;
  requirement?: string;
  page_url?: string;
  form_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  provider_submission_id?: string;
  assigned_to?: string;
  assigned_owner_name?: string;
  allow_duplicate?: boolean;
  reject_if_duplicate?: boolean;
  next_followup_date?: string;
}

export interface MetaLeadPayload {
  workspace_id: string;
  ad_id?: string;
  form_id?: string;
  campaign_name?: string;
  full_name: string;
  email: string;
  phone_number?: string;
  company_name?: string;
  custom_qualifications?: Record<string, string>;
  provider_submission_id?: string;
}

export interface GatewayResult {
  success: boolean;
  lead_id?: string;
  lead_number?: string;
  is_existing_updated?: boolean;
  message: string;
  error?: string;
}

/**
 * Normalize Email string for duplicate matching
 */
export function normalizeEmail(email: string): string {
  return email ? email.trim().toLowerCase() : '';
}

/**
 * Normalize Phone string to digits for duplicate matching
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Generate sequential unique Lead Number (e.g. LEAD-1042)
 * Finds the highest existing lead number + 1 to avoid duplicate numbers.
 */
export function generateLeadNumber(existingLeadsOrCount: Lead[] | number = 0): string {
  if (typeof existingLeadsOrCount === 'number') {
    return `LEAD-${existingLeadsOrCount + 1001}`;
  }
  let maxNum = 1000;
  for (const l of existingLeadsOrCount) {
    if (l && l.lead_number) {
      const match = l.lead_number.match(/\d+/);
      if (match) {
        const val = parseInt(match[0], 10);
        if (!isNaN(val) && val > maxNum) {
          maxNum = val;
        }
      }
    }
  }
  return `LEAD-${maxNum + 1}`;
}

// In-memory storage fallback for Node CLI test environments
const memoryStorageMap: Record<string, string> = {};

function safeStorageGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // Fallback below
  }
  return memoryStorageMap[key] || null;
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // Fallback below
  }
  memoryStorageMap[key] = value;
}

// Simple in-memory rate limiting map
const rateLimitMap: Record<string, number[]> = {};

function checkRateLimit(ipOrEmail: string, maxRequests = 5, windowMs = 60000): boolean {
  const now = Date.now();
  if (!rateLimitMap[ipOrEmail]) {
    rateLimitMap[ipOrEmail] = [];
  }
  rateLimitMap[ipOrEmail] = rateLimitMap[ipOrEmail].filter((t) => now - t < windowMs);
  if (rateLimitMap[ipOrEmail].length >= maxRequests) {
    return false; // Rate limit exceeded
  }
  rateLimitMap[ipOrEmail].push(now);
  return true;
}

/**
 * Secure Website Lead Capture Gateway
 */
export async function submitWebsiteLeadGateway(payload: WebsiteLeadPayload): Promise<GatewayResult> {
  if (!payload.workspace_id) {
    return { success: false, message: 'Workspace ID is required.', error: 'MISSING_WORKSPACE_ID' };
  }

  const name = (payload.name || '').trim();
  const rawEmail = (payload.email || '').trim();
  const rawPhone = (payload.phone || '').trim();

  if (!name) {
    return { success: false, message: 'Lead Name is required.', error: 'INVALID_NAME' };
  }

  const email = normalizeEmail(rawEmail);
  const phoneDigits = normalizePhone(rawPhone);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: 'A valid email address is required.', error: 'INVALID_EMAIL' };
  }

  // Phone number validation according to supported format & length rules
  if (rawPhone) {
    const phoneVal = validatePhoneNumber(rawPhone, { fieldLabel: 'Phone number' });
    if (!phoneVal.isValid) {
      return { success: false, message: phoneVal.error || 'Please enter a valid phone number.', error: 'INVALID_PHONE' };
    }
  }

  // If running in browser environment, send HTTP POST request to real backend endpoint /api/leads/capture
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    try {
      const resp = await window.fetch('/api/leads/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-K1-Workspace-Key': payload.workspace_id,
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        const leadRecord: Lead = {
          id: data.lead_id || crypto.randomUUID(),
          workspace_id: payload.workspace_id,
          lead_number: data.lead_number || 'LEAD-1001',
          contact_name: payload.name,
          company_name: payload.company || `${payload.name}'s Business`,
          email: payload.email,
          phone: payload.phone,
          status: 'new',
          source: (payload.utm_source as any) || 'website',
          source_detail: payload.page_url || 'Website Form',
          interested_service_name: payload.service || 'General Software / CRM Services',
          requirement: payload.requirement || 'Website enquiry submission',
          priority: 'high',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await saveLeadRecord(payload.workspace_id, leadRecord, []);
        return data;
      }
      if (!resp.ok && data.error) {
        return { success: false, message: data.message || 'Server returned error.', error: data.error };
      }
    } catch {
      // Fall through to server-side / direct database execution fallback below
    }
  }

  try {
    // 1. DUPLICATE CHECK: Search for existing lead in workspace matching email or phone
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('workspace_id', payload.workspace_id);

    let allLeads: Lead[] = (existingLeads as Lead[]) || [];

    // Fallback to local storage if offline/demo
    if (allLeads.length === 0) {
      const cached = safeStorageGet(`k1_leads_${payload.workspace_id}`);
      if (cached) {
        allLeads = JSON.parse(cached);
      }
    }

    const dupCheck = findDuplicateLead(allLeads, { email, phone: rawPhone });
    if (dupCheck.isDuplicate && payload.reject_if_duplicate && !payload.allow_duplicate) {
      return {
        success: false,
        lead_id: dupCheck.matchedLead?.id,
        is_existing_updated: false,
        message: dupCheck.warningMessage,
        error: 'DUPLICATE_LEAD',
      };
    }

    const matchedLead = allLeads.find((l) => {
      if (normalizeEmail(l.email) === email) return true;
      if (phoneDigits && normalizePhone(l.phone || '') === phoneDigits) return true;
      if (payload.provider_submission_id && l.provider_submission_id === payload.provider_submission_id) return true;
      return false;
    });

    const nowIso = new Date().toISOString();

    // 2. EXISTING LEAD RE-SUBMISSION FLOW
    if (matchedLead) {
      const newTimelineEvent: LeadActivityEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        lead_id: matchedLead.id,
        workspace_id: payload.workspace_id,
        event_type: 'web_enquiry',
        title: 'New Web Enquiry Re-submission Received',
        description: `Service: ${payload.service || 'General Inquiries'} | Requirement: ${payload.requirement || 'No detail provided'} | Page: ${payload.page_url || 'Website'}`,
        metadata: {
          utm_source: payload.utm_source,
          utm_medium: payload.utm_medium,
          utm_campaign: payload.utm_campaign,
          form_id: payload.form_id,
        },
        created_at: nowIso,
      };

      const updatedTimeline = [...(matchedLead.timeline_events || []), newTimelineEvent];
      const updatedRequirement = matchedLead.requirement
        ? `${matchedLead.requirement}\n\n[Re-enquiry ${new Date().toLocaleDateString('en-IN')}]: ${payload.requirement || payload.service}`
        : payload.requirement || payload.service || '';

      const nextFollowupDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];

      const updatedLead: Lead = {
        ...matchedLead,
        requirement: updatedRequirement,
        last_contact_at: nowIso,
        next_followup_date: nextFollowupDate,
        next_followup_time: '10:00',
        next_followup_type: 'call',
        next_followup_note: 'Follow up on new web re-enquiry',
        status: matchedLead.status === 'won' || matchedLead.status === 'lost' ? 'contacted' : matchedLead.status,
        timeline_events: updatedTimeline,
        updated_at: nowIso,
      };

      // Save updated lead
      await saveLeadRecord(payload.workspace_id, updatedLead, allLeads);

      // Trigger acknowledgement email if not DNC
      if (!updatedLead.is_do_not_contact) {
        await sendLeadWorkflowEmail(payload.workspace_id, updatedLead, 'Lead Acknowledgement');
      }

      return {
        success: true,
        lead_id: matchedLead.id,
        is_existing_updated: true,
        message: 'New enquiry appended to existing Lead timeline.',
      };
    }

    // 3. NEW LEAD CREATION FLOW
    const leadId = crypto.randomUUID();
    const leadNum = generateLeadNumber(allLeads);

    const initialEvent: LeadActivityEvent = {
      id: `evt_${Date.now()}_1`,
      lead_id: leadId,
      workspace_id: payload.workspace_id,
      event_type: 'web_enquiry',
      title: 'Website Enquiry Captured',
      description: `Source: Website (${payload.utm_source || 'Direct'}) | Service: ${payload.service || 'General'}`,
      metadata: {
        page_url: payload.page_url,
        form_id: payload.form_id,
        utm_source: payload.utm_source,
        utm_medium: payload.utm_medium,
        utm_campaign: payload.utm_campaign,
      },
      created_at: nowIso,
    };

    const tomorrowStr = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];

    const newLead: Lead = {
      id: leadId,
      workspace_id: payload.workspace_id,
      lead_number: leadNum,
      contact_name: name,
      company_name: payload.company || `${name}'s Business`,
      email,
      phone: rawPhone || undefined,
      source: (payload.utm_source as any) || 'website',
      source_detail: payload.page_url ? `Form on ${payload.page_url}` : 'Website form',
      interested_service_name: payload.service || 'General Software / CRM Services',
      requirement: payload.requirement || 'Website enquiry submission',
      status: 'new',
      priority: 'high',
      last_contact_at: nowIso,
      next_followup_date: payload.next_followup_date || tomorrowStr,
      next_followup_time: '11:00',
      next_followup_type: 'call',
      next_followup_note: 'Initial enquiry review and qualification call',
      page_url: payload.page_url,
      form_id: payload.form_id,
      utm_source: payload.utm_source,
      utm_medium: payload.utm_medium,
      utm_campaign: payload.utm_campaign,
      provider_submission_id: payload.provider_submission_id,
      timeline_events: [initialEvent],
      created_at: nowIso,
      updated_at: nowIso,
    };

    await saveLeadRecord(payload.workspace_id, newLead, allLeads);

    // Trigger Lead Acknowledgement & Service Requirement emails
    await sendLeadWorkflowEmail(payload.workspace_id, newLead, 'Lead Acknowledgement');
    await sendLeadWorkflowEmail(payload.workspace_id, newLead, 'Requirement Request');

    return {
      success: true,
      lead_id: newLead.id,
      is_existing_updated: false,
      message: `Lead ${leadNum} created successfully.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Failed to process website lead.',
      error: err.message || 'GATEWAY_ERROR',
    };
  }
}

/**
 * Meta (Facebook / Instagram) Lead Ads Gateway Handler
 */
export async function submitMetaLeadGateway(payload: MetaLeadPayload): Promise<GatewayResult> {
  return submitWebsiteLeadGateway({
    workspace_id: payload.workspace_id,
    name: payload.full_name,
    email: payload.email,
    phone: payload.phone_number,
    company: payload.company_name,
    service: payload.campaign_name || 'Meta Ad Leads',
    requirement: payload.custom_qualifications ? JSON.stringify(payload.custom_qualifications) : 'Meta Lead Ad Response',
    utm_source: 'facebook_instagram_ads',
    utm_campaign: payload.campaign_name,
    form_id: payload.form_id,
    provider_submission_id: payload.provider_submission_id,
  });
}

export interface WhatsAppLeadPayload {
  workspace_id: string;
  phone_number: string;
  sender_name?: string;
  message_text: string;
  message_id?: string;
}

/**
 * Official WhatsApp Business Platform Webhook Gateway Handler
 */
export async function submitWhatsAppLeadGateway(payload: WhatsAppLeadPayload): Promise<GatewayResult> {
  if (!payload.workspace_id || !payload.phone_number) {
    return { success: false, message: 'Workspace ID and Phone Number required.', error: 'INVALID_PAYLOAD' };
  }

  const phoneDigits = normalizePhone(payload.phone_number);
  const nowIso = new Date().toISOString();

  // 1. Check if phone matches an existing Client
  try {
    const { data: clients } = await supabase.from('clients').select('*').eq('workspace_id', payload.workspace_id).eq('is_deleted', false);
    const matchedClient = (clients || []).find((c: any) => normalizePhone(c.primary_phone || c.whatsapp_number || '') === phoneDigits);
    if (matchedClient) {
      await supabase.from('client_timeline').insert({
        workspace_id: payload.workspace_id,
        client_id: matchedClient.id,
        event_type: 'whatsapp_message',
        title: 'Incoming WhatsApp Message',
        description: payload.message_text,
        event_date: nowIso,
      });
      return { success: true, is_existing_updated: true, message: `Attached message to Client ${matchedClient.contact_person || matchedClient.business_name}.` };
    }
  } catch {
    // Local fallback
  }

  // 2. Check if phone matches an existing Lead
  const { data: existingLeads } = await supabase.from('leads').select('*').eq('workspace_id', payload.workspace_id);
  let allLeads: Lead[] = (existingLeads as Lead[]) || [];
  if (allLeads.length === 0) {
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(`k1_leads_${payload.workspace_id}`) : null;
    if (cached) allLeads = JSON.parse(cached);
  }

  const matchedLead = allLeads.find((l) => phoneDigits && normalizePhone(l.phone || '') === phoneDigits);

  if (matchedLead) {
    const newTimelineEvent: LeadActivityEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      lead_id: matchedLead.id,
      workspace_id: payload.workspace_id,
      event_type: 'email_replied', // or whatsapp message
      title: 'Incoming WhatsApp Message',
      description: payload.message_text,
      created_at: nowIso,
    };

    const updatedLead: Lead = {
      ...matchedLead,
      last_contact_at: nowIso,
      timeline_events: [...(matchedLead.timeline_events || []), newTimelineEvent],
      updated_at: nowIso,
    };

    await saveLeadRecord(payload.workspace_id, updatedLead, allLeads);
    return { success: true, lead_id: matchedLead.id, is_existing_updated: true, message: 'Attached message to Lead timeline.' };
  }

  // 3. Create New WhatsApp Lead
  const senderName = (payload.sender_name || `WhatsApp Contact ${phoneDigits}`).trim();
  return submitWebsiteLeadGateway({
    workspace_id: payload.workspace_id,
    name: senderName,
    email: `${phoneDigits}@whatsapp.inbound`,
    phone: payload.phone_number,
    company: `${senderName}'s Business`,
    service: 'WhatsApp Inbound Sales Inquiry',
    requirement: payload.message_text,
    utm_source: 'whatsapp',
    provider_submission_id: payload.message_id,
  });
}

export interface EmailLeadPayload {
  workspace_id: string;
  sender_email: string;
  sender_name?: string;
  subject?: string;
  body_text: string;
  message_id?: string;
}

/**
 * Sales Inbox Email Ingestion Gateway Handler
 */
export async function submitEmailLeadGateway(payload: EmailLeadPayload): Promise<GatewayResult> {
  if (!payload.workspace_id || !payload.sender_email) {
    return { success: false, message: 'Workspace ID and Sender Email required.', error: 'INVALID_PAYLOAD' };
  }

  const email = normalizeEmail(payload.sender_email);
  const nowIso = new Date().toISOString();

  // Spam / Automated / Newsletter Filter
  if (
    email.includes('noreply') ||
    email.includes('no-reply') ||
    email.includes('mailer-daemon') ||
    email.includes('notifications@') ||
    email.includes('donotreply') ||
    email.includes('bounce')
  ) {
    return { success: false, message: 'Ignored automated / noreply / system email.', error: 'AUTOMATED_SENDER_IGNORED' };
  }

  // 1. Check if email matches existing Client
  try {
    const { data: clients } = await supabase.from('clients').select('*').eq('workspace_id', payload.workspace_id).eq('is_deleted', false);
    const matchedClient = (clients || []).find((c: any) => normalizeEmail(c.primary_email || c.secondary_email || '') === email);
    if (matchedClient) {
      await supabase.from('client_timeline').insert({
        workspace_id: payload.workspace_id,
        client_id: matchedClient.id,
        event_type: 'email_received',
        title: `Incoming Email: ${payload.subject || 'Sales Inquiry'}`,
        description: payload.body_text,
        event_date: nowIso,
      });
      return { success: true, is_existing_updated: true, message: `Attached email to Client ${matchedClient.contact_person}.` };
    }
  } catch {
    // Fallback
  }

  // 2. Check if email matches existing Lead
  const { data: existingLeads } = await supabase.from('leads').select('*').eq('workspace_id', payload.workspace_id);
  let allLeads: Lead[] = (existingLeads as Lead[]) || [];
  if (allLeads.length === 0) {
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(`k1_leads_${payload.workspace_id}`) : null;
    if (cached) allLeads = JSON.parse(cached);
  }

  const matchedLead = allLeads.find((l) => normalizeEmail(l.email) === email);

  if (matchedLead) {
    const replyEvent: LeadActivityEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      lead_id: matchedLead.id,
      workspace_id: payload.workspace_id,
      event_type: 'email_replied',
      title: `Email Received: ${payload.subject || 'Client Response'}`,
      description: payload.body_text,
      created_at: nowIso,
    };

    const updatedLead: Lead = {
      ...matchedLead,
      last_contact_at: nowIso,
      next_followup_note: 'Customer responded via email — review reply',
      timeline_events: [...(matchedLead.timeline_events || []), replyEvent],
      updated_at: nowIso,
    };

    await saveLeadRecord(payload.workspace_id, updatedLead, allLeads);
    return { success: true, lead_id: matchedLead.id, is_existing_updated: true, message: 'Attached email response to Lead timeline.' };
  }

  // 3. Create New Email Lead
  const name = payload.sender_name || email.split('@')[0];
  return submitWebsiteLeadGateway({
    workspace_id: payload.workspace_id,
    name,
    email: payload.sender_email,
    service: payload.subject || 'Sales Mailbox Inquiry',
    requirement: payload.body_text,
    utm_source: 'email_inbound',
    provider_submission_id: payload.message_id,
  });
}

export interface CSVLeadRow {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  service?: string;
  requirement?: string;
  source?: string;
  source_detail?: string;
}

export interface CSVImportResult {
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  details: string[];
}

/**
 * Bulk CSV Lead Import Gateway Handler
 */
export async function submitCSVImportGateway(workspaceId: string, rows: CSVLeadRow[]): Promise<CSVImportResult> {
  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const details: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name || (!row.email && !row.phone)) {
      errorCount++;
      details.push(`Row ${i + 1}: Skipped due to missing name and email/phone.`);
      continue;
    }

    const res = await submitWebsiteLeadGateway({
      workspace_id: workspaceId,
      name: row.name,
      email: row.email || `${normalizePhone(row.phone || '')}@csv.import`,
      phone: row.phone,
      company: row.company,
      service: row.service || 'CSV Imported Lead',
      requirement: row.requirement || 'Imported via CSV',
      utm_source: row.source || 'csv_import',
    });

    if (res.success) {
      if (res.is_existing_updated) {
        updatedCount++;
        details.push(`Row ${i + 1} (${row.name}): Appended to existing lead timeline.`);
      } else {
        createdCount++;
        details.push(`Row ${i + 1} (${row.name}): Created new lead ${res.lead_id}.`);
      }
    } else {
      errorCount++;
      details.push(`Row ${i + 1} (${row.name}): ${res.message}`);
    }
  }

  return { createdCount, updatedCount, errorCount, details };
}

/**
 * Helper to save Lead record into Supabase PostgreSQL (Source of Truth)
 */
export async function saveLeadRecord(workspaceId: string, lead: Lead, existingList: Lead[]): Promise<void> {
  let currentList: Lead[] = existingList || [];
  if (currentList.length === 0) {
    const cached = safeStorageGet(`k1_leads_${workspaceId}`);
    if (cached) {
      try {
        currentList = JSON.parse(cached);
      } catch {
        // Ignore parse error
      }
    }
  }

  // Always update local storage cache first for zero data loss
  const nextList = currentList.some((l) => l.id === lead.id)
    ? currentList.map((l) => (l.id === lead.id ? lead : l))
    : [lead, ...currentList];

  safeStorageSet(`k1_leads_${workspaceId}`, JSON.stringify(nextList));

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('k1_lead_captured', { detail: lead }));
    } catch {
      // Ignore event error
    }
  }

  try {
    const { error } = await supabase.from('leads').upsert({
      id: lead.id,
      workspace_id: workspaceId,
      lead_number: lead.lead_number,
      contact_name: lead.contact_name,
      company_name: lead.company_name,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      source: lead.source,
      source_detail: lead.source_detail,
      interested_service_id: lead.interested_service_id,
      interested_service_name: lead.interested_service_name,
      requirement: lead.requirement,
      priority: lead.priority,
      assigned_to: lead.assigned_to,
      assigned_owner_name: lead.assigned_owner_name,
      last_contact_at: lead.last_contact_at,
      next_followup_date: lead.next_followup_date,
      next_followup_time: lead.next_followup_time,
      next_followup_type: lead.next_followup_type,
      next_followup_note: lead.next_followup_note,
      page_url: lead.page_url,
      form_id: lead.form_id,
      utm_source: lead.utm_source,
      utm_medium: lead.utm_medium,
      utm_campaign: lead.utm_campaign,
      provider_submission_id: lead.provider_submission_id,
      timeline_events: lead.timeline_events || [],
      converted_client_id: lead.converted_client_id,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('Supabase DB notice (lead cached locally):', error.message);
    }
  } catch (err: any) {
    console.warn('Supabase DB exception (lead cached locally):', err.message);
  }
}
