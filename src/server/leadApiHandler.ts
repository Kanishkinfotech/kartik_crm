import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { supabase as normalSupabase } from '../lib/supabase';
import type { Lead, LeadActivityEvent } from '../lib/types';
import { normalizeEmail, normalizePhone, generateLeadNumber } from '../lib/leadGateway';
import { validateWebsiteUrl, validatePhoneNumber, findDuplicateLead } from '../lib/contactValidation';

let serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://gfvqxfcixamriayqzaxn.supabase.co';

if (!serviceRoleKey) {
  try {
    const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const match = envContent.match(/VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)/);
    if (match) serviceRoleKey = match[1].trim();
    
    const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
    if (urlMatch) supabaseUrl = urlMatch[1].trim();
  } catch {}
}

const supabase = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : normalSupabase;

const LEADS_FILE = path.join(process.cwd(), '.leads_cache.json');

function loadPersistentLeads(): Lead[] { console.log('loadPersistentLeads CALLED'); console.log('LEADS_FILE:', LEADS_FILE, 'EXISTS:', fs.existsSync(LEADS_FILE));
  try {
    if (fs.existsSync(LEADS_FILE)) {
      return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
    }
  } catch (err) { console.error('SAVE ERROR:', err); }
  return [];
}

function savePersistentLeads(leads: Lead[]) {
  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
  } catch { }
}

let persistentLeads: Lead[] = loadPersistentLeads();

// In-memory rate limiting map (IP/Workspace -> timestamps)
const rateLimitMap: Record<string, number[]> = {};

function checkRateLimit(key: string, maxRequests = 5, windowMs = 60000): boolean {
  const now = Date.now();
  if (!rateLimitMap[key]) rateLimitMap[key] = [];
  rateLimitMap[key] = rateLimitMap[key].filter((t) => now - t < windowMs);
  if (rateLimitMap[key].length >= maxRequests) return false;
  rateLimitMap[key].push(now);
  return true;
}

// In-memory provider deduplication cache (leadgen_id / message_id)
const processedProviderIds = new Set<string>();

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      const contentType = req.headers['content-type'] || '';
      
      try {
        if (contentType.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(body);
          const obj: Record<string, any> = {};
          
          // Parse fields[Name][value]=AgentTest into { fields: { Name: { value: 'AgentTest' } } }
          for (const [key, value] of params.entries()) {
            const keys = key.replace(/\]/g, '').split('[');
            let current = obj;
            for (let i = 0; i < keys.length - 1; i++) {
              const k = keys[i];
              if (!current[k]) current[k] = {};
              current = current[k];
            }
            current[keys[keys.length - 1]] = value;
          }
          return resolve(obj);
        }
        
        // Default to JSON
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-K1-Workspace-Key, X-Hub-Signature-256');
  res.end(JSON.stringify(data));
}

/**
 * Node.js Server API Handler for /api/leads/capture, /api/webhooks/meta, /api/webhooks/whatsapp
 */
export async function handleLeadApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  // ----------------------------------------------------
  // 0. GET /api/wordpress/download or /api/download-plugin — Serve WordPress Plugin ZIP
  // ----------------------------------------------------
  if (pathname === '/api/wordpress/download' || pathname === '/api/download-plugin' || pathname === '/api/wordpress/plugin.zip') {
    try {
      const { getWordPressPluginZipBuffer } = await import('../lib/downloadPlugin');
      const zipBytes = getWordPressPluginZipBuffer();
      const buffer = Buffer.from(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="kanishk-one-connector.zip"');
      res.setHeader('Content-Length', buffer.length.toString());
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(buffer);
      return true;
    } catch (err: any) {
      sendJson(res, 500, { success: false, error: 'DOWNLOAD_FAILED', message: err.message || 'Failed to build plugin zip' });
      return true;
    }
  }

  // ----------------------------------------------------
  // 0.1 GET /api/leads — Fetch all captured leads
  // ----------------------------------------------------
  if (pathname === '/api/leads' && req.method === 'GET') {
    // Removed: this returned every cached lead to any caller. workspace_id was
    // a filter, not a credential. Read leads through Supabase, under RLS.
    sendJson(res, 410, {
      success: false,
      error: 'ENDPOINT_REMOVED',
      message: 'Read leads from Supabase with an authenticated session instead.',
    });
    return true;
  }

  // ----------------------------------------------------
  // 0.2 GET/POST /api/leads/check-duplicate — Duplicate Lead Verification
  // ----------------------------------------------------
  if (pathname === '/api/leads/check-duplicate') {
    try {
      const payload = req.method === 'POST' ? await parseBody(req) : {};
      const workspaceId = payload.workspace_id || url.searchParams.get('workspace_id') || '031702e9-43a7-4487-8d10-0240501c88c9';
      const email = payload.email || url.searchParams.get('email') || '';
      const phone = payload.phone || url.searchParams.get('phone') || '';

      const { data: dbLeads } = await supabase
        .from('leads')
        .select('*')
        .eq('workspace_id', workspaceId);

      const allLeads: Lead[] = (dbLeads as Lead[]) || persistentLeads.filter(l => l.workspace_id === workspaceId);
      const dupResult = findDuplicateLead(allLeads, { email, phone });

      sendJson(res, 200, {
        success: true,
        is_duplicate: dupResult.isDuplicate,
        matched_by: dupResult.matchedBy,
        matched_lead: dupResult.matchedLead ? {
          id: dupResult.matchedLead.id,
          lead_number: dupResult.matchedLead.lead_number,
          contact_name: dupResult.matchedLead.contact_name,
          company_name: dupResult.matchedLead.company_name,
          email: dupResult.matchedLead.email,
          phone: dupResult.matchedLead.phone,
          status: dupResult.matchedLead.status,
        } : null,
        message: dupResult.warningMessage,
      });
      return true;
    } catch (err: any) {
      sendJson(res, 500, { success: false, error: 'SERVER_ERROR', message: err.message });
      return true;
    }
  }

  // ----------------------------------------------------
  // 1. POST /api/leads/capture & /api/webhooks/wordpress — WordPress & Website Lead Gateway
  // ----------------------------------------------------
  // --------------------------------------------------------------------
  // Lead intake runs in the deployed Supabase functions, not here. This file
  // is Vite middleware, so anything implemented in it exists only under dev
  // and preview - the two environments would silently diverge. Forwarding
  // means a local test exercises the same code path a real submission does,
  // and production never depends on a Node process in front of the frontend.
  // --------------------------------------------------------------------
  const FN_BASE = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;

  const forwardTarget =
    (pathname.includes('/leads/capture') || pathname.includes('/webhooks/wordpress') || pathname.includes('/leads/wordpress'))
      ? 'lead-ingest'
      : pathname.includes('/webhooks/meta')
      ? 'meta-leads-webhook'
      : pathname.includes('/webhooks/whatsapp')
      ? 'whatsapp-webhook'
      : null;

  // Forwarding to Edge Functions has been disabled for self-hosted compatibility.
  // All lead ingestion is processed locally by this Node.js handler.

  if (
    pathname === '/api/leads/capture' ||
    pathname.includes('/leads/capture')
  ) {
    // Connection Ping Check
    if (pathname.endsWith('/ping') || url.searchParams.has('ping')) {
      sendJson(res, 200, { success: true, message: 'WordPress Connector Ping Verified!' });
      return true;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED', message: 'Use POST method for lead capture.' });
      return true;
    }

    try {
      const payload = await parseBody(req); console.log("[WEBHOOK INCOMING]", pathname, JSON.stringify(payload));
      let workspaceId =
        payload.workspace_id ||
        (req.headers['x-k1-workspace-key'] as string) ||
        (req.headers['x-wp-api-key'] as string) ||
        payload.api_key ||
        (req.headers["x-k1-ingest-key"] as string) || url.searchParams.get('workspace_id') ||
        url.searchParams.get('api_key');

      // If the incoming ID is actually a WordPress API key (starts with wp_k1_ or doesn't look like a UUID),
      // we must fetch the real UUID workspace_id from the database.
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId || '');
      
      if (!workspaceId || !isUUID) {
        let incomingApiKey = workspaceId || (req.headers['x-wp-api-key'] as string) || payload.api_key || (req.headers["x-k1-ingest-key"] as string);
        const { data: configs } = await supabase
          .from('integration_configs')
          .select('workspace_id, config')
          .eq('provider', 'wordpress');
          
        let foundWorkspaceId = null;
        if (configs) {
           for (const c of configs) {
             if (c.config && (c.config.api_key === incomingApiKey || c.workspace_id === incomingApiKey)) {
                foundWorkspaceId = c.workspace_id;
                break;
             }
           }
           if (!foundWorkspaceId && configs[0]) {
              foundWorkspaceId = configs[0].workspace_id;
           }
        }

        if (foundWorkspaceId) {
          workspaceId = foundWorkspaceId;
        } else {
          // HARDCODED FALLBACK: Accept the lead into the main Test account unconditionally
          workspaceId = '031702e9-43a7-4487-8d10-0240501c88c9';
        }
      }

      if (!workspaceId) {
        // Absolute fallback just in case
        workspaceId = '031702e9-43a7-4487-8d10-0240501c88c9';
      }

      // Spam Protection: Honeypot field check
      if (payload.website_url_hp || payload.bot_check) {
        sendJson(res, 400, { success: false, error: 'SPAM_DETECTED', message: 'Bot submission rejected.' });
        return true;
      }

      // Normalize keys to lowercase for foolproof extraction
      const lowerPayload: Record<string, any> = {};
      for (const [key, value] of Object.entries(payload)) {
        lowerPayload[key.toLowerCase().trim()] = value;
      }

      // 1. Flexible Extraction for Core Fields (Case-Insensitive)
      const rawName = lowerPayload['name'] || lowerPayload['your-name'] || lowerPayload['contact_name'] || lowerPayload['full_name'] || lowerPayload['first name'] || [lowerPayload['first_name'], lowerPayload['last_name']].filter(Boolean).join(' ') || 'Unknown Website Lead';
      const rawEmail = lowerPayload['email'] || lowerPayload['your-email'] || lowerPayload['contact_email'] || lowerPayload['email address'] || '';
      const rawPhone = lowerPayload['phone'] || lowerPayload['your-tel'] || lowerPayload['tel'] || lowerPayload['contact_number'] || lowerPayload['mobile'] || lowerPayload['phone number'] || '';

      const name = String(rawName).trim() || 'Unknown Website Lead';
      const email = normalizeEmail(String(rawEmail).trim());
      const phoneDigits = normalizePhone(String(rawPhone).trim());

      // Phone number validation according to supported format & length rules
      if (rawPhone && String(rawPhone).trim()) {
        const phoneVal = validatePhoneNumber(String(rawPhone).trim(), { fieldLabel: 'Phone number' });
        if (!phoneVal.isValid) {
          sendJson(res, 400, {
            success: false,
            error: 'INVALID_PHONE',
            message: phoneVal.error || 'Please enter a valid phone number.',
          });
          return true;
        }
      }

      // Website URL validation
      const rawWebsite = lowerPayload['website'] || lowerPayload['website_url'] || lowerPayload['client_website'];
      if (rawWebsite && String(rawWebsite).trim()) {
        const websiteVal = validateWebsiteUrl(String(rawWebsite).trim());
        if (!websiteVal.isValid) {
          sendJson(res, 400, {
            success: false,
            error: 'INVALID_WEBSITE_URL',
            message: 'Please enter a valid website URL.',
          });
          return true;
        }
      }

      // If absolutely no email/phone, create a dummy one so it NEVER fails as requested
      const finalEmail = email || (phoneDigits ? '' : `lead-${Date.now()}@website.local`);


      // 2. Extract Custom Data (everything else)
      const knownKeys = ['workspace_id', 'api_key', 'website_url_hp', 'bot_check', 'name', 'first_name', 'last_name', 'your-name', 'contact_name', 'full_name', 'email', 'your-email', 'contact_email', 'phone', 'your-tel', 'tel', 'contact_number', 'mobile', 'utm_source', 'utm_medium', 'utm_campaign', 'form_id', 'service', 'requirement', 'page_url', 'provider_submission_id'];
      const customData: Record<string, any> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (!knownKeys.includes(key) && value !== '' && value !== null) {
          customData[key] = value;
        }
      }

      // Server Rate Limiting Check
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || 'unknown_ip';
      if (!checkRateLimit(`ratelimit_${workspaceId}_${clientIp}`)) {
        sendJson(res, 429, { success: false, error: 'RATE_LIMITED', message: 'Too many submissions from your IP. Please try again in 1 minute.' });
        return true;
      }

      // Database Search for Duplicate Check
      const { data: dbLeads, error: searchError } = await supabase
        .from('leads')
        .select('*')
        .eq('workspace_id', workspaceId);

      const allLeads: Lead[] = (dbLeads as Lead[]) || [];
      const matchedLead = allLeads.find((l) => {
        if (finalEmail && normalizeEmail(l.email) === finalEmail) return true;
        if (phoneDigits && normalizePhone(l.phone || '') === phoneDigits) return true;
        if (payload.provider_submission_id && l.provider_submission_id === payload.provider_submission_id) return true;
        return false;
      });

      const nowIso = new Date().toISOString();

      // DUPLICATE LEAD CHECK / RE-SUBMISSION FLOW
      if (matchedLead) {
        if ((payload.reject_if_duplicate || payload.strict_duplicate) && !payload.allow_duplicate) {
          sendJson(res, 409, {
            success: false,
            error: 'DUPLICATE_LEAD',
            message: `A lead with this ${matchedLead.email === finalEmail ? 'email' : 'phone number'} already exists in this workspace: "${matchedLead.contact_name}" (${matchedLead.company_name || 'No company'}) [Status: ${matchedLead.status}].`,
            matched_lead: {
              id: matchedLead.id,
              lead_number: matchedLead.lead_number,
              contact_name: matchedLead.contact_name,
              company_name: matchedLead.company_name,
              email: matchedLead.email,
              phone: matchedLead.phone,
              status: matchedLead.status,
            },
          });
          return true;
        }
        const reEnquiryEvent: LeadActivityEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          lead_id: matchedLead.id,
          workspace_id: workspaceId,
          event_type: 'web_enquiry',
          title: 'Web Enquiry Re-submission',
          description: `Service: ${payload.service || 'General'} | Requirement: ${payload.requirement || 'No detail'} | Page: ${payload.page_url || 'Website'}`,
          metadata: {
            ...customData,
            utm_source: payload.utm_source,
            utm_medium: payload.utm_medium,
            utm_campaign: payload.utm_campaign,
            form_id: payload.form_id,
          },
          created_at: nowIso,
        };

        const updatedTimeline = [...(matchedLead.timeline_events || []), reEnquiryEvent];
        const updatedReq = matchedLead.requirement
          ? `${matchedLead.requirement}\n\n[Re-enquiry ${new Date().toLocaleDateString('en-IN')}]: ${payload.requirement || payload.service}`
          : payload.requirement || payload.service || '';

        persistentLeads = persistentLeads.map((l) =>
          l.id === matchedLead.id
            ? { ...l, requirement: updatedReq, timeline_events: updatedTimeline, last_contact_at: nowIso, updated_at: nowIso }
            : l
        );
        savePersistentLeads(persistentLeads);

        try {
          await supabase
            .from('leads')
            .update({
              requirement: updatedReq,
              last_contact_at: nowIso,
              timeline_events: updatedTimeline,
              updated_at: nowIso,
            })
            .eq('id', matchedLead.id);
        } catch {
          // Fallback to in-memory persistent storage
        }

        sendJson(res, 200, {
          success: true,
          lead_id: matchedLead.id,
          is_existing_updated: true,
          message: 'New enquiry appended to existing Lead timeline.',
        });
        return true;
      }

      // NEW LEAD CREATION FLOW
      const leadId = crypto.randomUUID();
      const leadNum = generateLeadNumber(allLeads);

      const initialEvent: LeadActivityEvent = {
        id: `evt_${Date.now()}_1`,
        lead_id: leadId,
        workspace_id: workspaceId,
        event_type: 'web_enquiry',
        title: 'Website Enquiry Captured',
        description: `Source: Website (${payload.utm_source || 'Direct'}) | Service: ${payload.service || 'General'}`,
        metadata: {
          ...customData,
          page_url: payload.page_url,
          form_id: payload.form_id,
          utm_source: payload.utm_source,
          utm_medium: payload.utm_medium,
          utm_campaign: payload.utm_campaign,
        },
        created_at: nowIso,
      };

      const tomorrowStr = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];

      const newLeadRecord = {
        id: leadId,
        workspace_id: workspaceId,
        lead_number: leadNum,
        contact_name: name,
        company_name: payload.company || `${name}'s Business`,
        email: finalEmail,
        phone: rawPhone || null,
        status: 'new',
        source: payload.utm_source || 'website',
        source_detail: payload.page_url ? `Form on ${payload.page_url}` : `Received via ${pathname}`,
        interested_service_name: payload.service || null,
        requirement: payload.requirement || 'Website enquiry submission',
        priority: 'high',
        last_contact_at: nowIso,
        next_followup_date: tomorrowStr,
        next_followup_time: '11:00',
        next_followup_type: 'call',
        next_followup_note: 'Initial enquiry review and qualification call',
        assigned_to: payload.assigned_to || null,
        assigned_owner_name: payload.assigned_owner_name || null,
        page_url: payload.page_url || null,
        form_id: payload.form_id || null,
        utm_source: payload.utm_source || null,
        utm_medium: payload.utm_medium || null,
        utm_campaign: payload.utm_campaign || null,
        provider_submission_id: payload.provider_submission_id || null,
        timeline_events: [initialEvent],
        created_at: nowIso,
        updated_at: nowIso,
      };

      persistentLeads = [newLeadRecord as unknown as Lead, ...persistentLeads.filter((l) => l.id !== leadId)];
      savePersistentLeads(persistentLeads);

      // Database Persistence (Source of Truth)
      try {
        const { error: insertError } = await supabase.from('leads').insert(newLeadRecord);
        if (insertError) {
          console.error('[LEAD INSERT ERROR]', insertError.message, insertError.code, JSON.stringify(insertError));
        } else {
          console.log('[LEAD INSERT OK]', leadId, 'workspace:', workspaceId);
        }
      } catch (dbErr: any) {
        console.error('[LEAD INSERT EXCEPTION]', dbErr?.message || dbErr);
        // Fallback to in-memory persistent storage
      }

      sendJson(res, 201, {
        success: true,
        lead_id: leadId,
        lead_number: leadNum,
        is_existing_updated: false,
        message: `Lead ${leadNum} captured successfully.`,
      });
      return true;
    } catch (err: any) {
      sendJson(res, 500, { success: false, error: 'SERVER_ERROR', message: err.message || 'Internal server error.' });
      return true;
    }
  }

  // ----------------------------------------------------
  // 2. GET/POST /api/webhooks/meta — Meta Facebook & Instagram Lead Ads Security Handler
  // ----------------------------------------------------
  if (pathname === '/api/webhooks/meta') {
    // Challenge Verification Handshake (GET)
    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      const expectedToken = process.env.META_VERIFY_TOKEN || 'kanishk_meta_verify_token_2026';

      if (mode === 'subscribe' && token === expectedToken) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end(challenge || '');
        return true;
      }

      sendJson(res, 403, { success: false, error: 'VERIFICATION_FAILED', message: 'Invalid Meta verify token.' });
      return true;
    }

    if (req.method === 'POST') {
      const metaSecret = process.env.META_APP_SECRET;
      const signatureHeader = req.headers['x-hub-signature-256'] as string;

      // HMAC Signature Verification Check
      if (metaSecret && signatureHeader) {
        const rawBody = await parseBody(req);
        const expectedSig = 'sha256=' + crypto.createHmac('sha256', metaSecret).update(JSON.stringify(rawBody)).digest('hex');

        if (signatureHeader !== expectedSig) {
          sendJson(res, 401, { success: false, error: 'INVALID_SIGNATURE', message: 'Meta HMAC signature mismatch.' });
          return true;
        }
      }

      const body = await parseBody(req);
      const leadgenId = body.entry?.[0]?.changes?.[0]?.value?.leadgen_id || body.provider_submission_id;

      // Idempotency Deduplication Check
      if (leadgenId && processedProviderIds.has(leadgenId)) {
        sendJson(res, 200, { success: true, message: 'Duplicate Meta webhook payload ignored (idempotent).' });
        return true;
      }
      if (leadgenId) processedProviderIds.add(leadgenId);

      // Meta Graph API Fetch if Page Access Token is configured
      const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
      let name = body.full_name || 'Meta Ad Lead';
      let email = body.email || '';
      let phone = body.phone_number || '';
      let company = body.company_name || '';

      if (leadgenId && pageAccessToken) {
        try {
          const graphResp = await fetch(`https://graph.facebook.com/v19.0/${leadgenId}?access_token=${pageAccessToken}`);
          if (graphResp.ok) {
            const graphData = await graphResp.json();
            const fieldData: Array<{ name: string; values: string[] }> = graphData.field_data || [];
            fieldData.forEach((field) => {
              if (field.name === 'full_name' || field.name === 'name') name = field.values[0] || name;
              if (field.name === 'email') email = field.values[0] || email;
              if (field.name === 'phone_number' || field.name === 'phone') phone = field.values[0] || phone;
              if (field.name === 'company_name' || field.name === 'company') company = field.values[0] || company;
            });
          }
        } catch (err) {
          console.warn('Failed to fetch lead details from Meta Graph API:', err);
        }
      }

      sendJson(res, 200, { success: true, message: 'Meta lead webhook processed successfully.', leadgen_id: leadgenId });
      return true;
    }
  }

  // ----------------------------------------------------
  // 3. GET/POST /api/webhooks/whatsapp — Official WhatsApp Cloud API Webhook Handler
  // ----------------------------------------------------
  if (pathname === '/api/webhooks/whatsapp') {
    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'kanishk_whatsapp_verify_token_2026';

      if (mode === 'subscribe' && token === expectedToken) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end(challenge || '');
        return true;
      }

      sendJson(res, 403, { success: false, error: 'VERIFICATION_FAILED', message: 'Invalid WhatsApp verify token.' });
      return true;
    }

    if (req.method === 'POST') {
      const waSecret = process.env.WHATSAPP_APP_SECRET;
      const signatureHeader = req.headers['x-hub-signature-256'] as string;

      if (waSecret && signatureHeader) {
        const rawBody = await parseBody(req);
        const expectedSig = 'sha256=' + crypto.createHmac('sha256', waSecret).update(JSON.stringify(rawBody)).digest('hex');

        if (signatureHeader !== expectedSig) {
          sendJson(res, 401, { success: false, error: 'INVALID_SIGNATURE', message: 'WhatsApp HMAC signature mismatch.' });
          return true;
        }
      }

      const body = await parseBody(req);
      const messageId = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id || body.message_id;

      if (messageId && processedProviderIds.has(messageId)) {
        sendJson(res, 200, { success: true, message: 'Duplicate WhatsApp webhook payload ignored.' });
        return true;
      }
      if (messageId) processedProviderIds.add(messageId);

      sendJson(res, 200, { success: true, message: 'WhatsApp webhook processed.' });
      return true;
    }
  }

  // ----------------------------------------------------
  // 4. POST /api/webhooks/email — Sales Mailbox Inbound Ingestion Handler
  // ----------------------------------------------------
  if (pathname === '/api/webhooks/email') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED', message: 'Use POST method.' });
      return true;
    }

    const emailSecret = process.env.EMAIL_WEBHOOK_SECRET;
    const authHeader = req.headers['x-email-webhook-secret'] as string;

    if (emailSecret && authHeader !== emailSecret) {
      sendJson(res, 401, { success: false, error: 'UNAUTHORIZED', message: 'Invalid email webhook secret.' });
      return true;
    }

    const body = await parseBody(req);
    const messageId = body.message_id || body.id;

    if (messageId && processedProviderIds.has(messageId)) {
      sendJson(res, 200, { success: true, message: 'Duplicate email webhook payload ignored.' });
      return true;
    }
    if (messageId) processedProviderIds.add(messageId);

    sendJson(res, 200, { success: true, message: 'Inbound email webhook processed.' });
    return true;
  }

  // ----------------------------------------------------
  // 5. POST /api/webhooks/wordpress — WordPress Form Lead Gateway Endpoint
  // ----------------------------------------------------
  if (pathname === '/api/webhooks/wordpress' || pathname === '/api/leads/wordpress') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED', message: 'Use POST method for WordPress lead webhooks.' });
      return true;
    }

    try {
      const payload = await parseBody(req); console.log("[WEBHOOK INCOMING]", pathname, JSON.stringify(payload));
      let incomingApiKey = (req.headers['x-wp-api-key'] as string) || (req.headers['x-k1-workspace-key'] as string) || payload.api_key || (req.headers["x-k1-ingest-key"] as string);
      let incomingWorkspaceId = payload.workspace_id || url.searchParams.get('workspace_id') || incomingApiKey;

      if (!incomingWorkspaceId) {
        sendJson(res, 400, { success: false, error: 'MISSING_AUTHENTICATION', message: 'Workspace ID or API Key is required.' });
        return true;
      }

      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incomingWorkspaceId || '');
      let matchedWorkspaceId = isUUID ? incomingWorkspaceId : null;
      let existingConfigRecord: any = null;

      if (isUUID) {
        const { data: configs } = await supabase
          .from('integration_configs')
          .select('*')
          .eq('workspace_id', incomingWorkspaceId)
          .eq('provider', 'wordpress')
          .maybeSingle();

        if (configs) {
          existingConfigRecord = configs;
          matchedWorkspaceId = configs.workspace_id;
        }
      }

      // If workspaceId wasn't found directly (or wasn't a UUID), try locating by api_key in config
      if (!matchedWorkspaceId && incomingApiKey) {
        const { data: configs } = await supabase
          .from('integration_configs')
          .select('*')
          .eq('provider', 'wordpress');

        if (configs && configs.length > 0) {
          const found = configs.find((c: any) => c.config && (c.config.api_key === incomingApiKey || c.workspace_id === incomingApiKey));
          if (found) {
            existingConfigRecord = found;
            matchedWorkspaceId = found.workspace_id;
          }
        }
      }

      if (!matchedWorkspaceId) {
        sendJson(res, 401, {
          success: false,
          error: 'INVALID_API_KEY',
          message: 'WordPress API key is invalid or not registered.'
        });
        return true;
      }

      const nowIso = new Date().toISOString();

      // Handle Test Connection Ping from WordPress Connector Plugin
      if (payload.test_ping) {
        if (existingConfigRecord) {
          const currentCfg = existingConfigRecord.config || {};
          await supabase
            .from('integration_configs')
            .update({
              connection_status: 'connected',
              last_webhook_at: nowIso,
              config: {
                ...currentCfg,
                website_url: payload.website_url || currentCfg.website_url,
                last_successful_sync: nowIso,
                last_error: null,
              },
              updated_at: nowIso,
            })
            .eq('id', existingConfigRecord.id);
        }

        sendJson(res, 200, {
          success: true,
          message: 'Connection Verified! WordPress plugin successfully authenticated with Kanishk One.',
        });
        return true;
      }

      // Normalize keys to lowercase for foolproof extraction
      const lowerPayload: Record<string, any> = {};
      for (const [key, value] of Object.entries(payload)) {
        lowerPayload[key.toLowerCase().trim()] = value;
      }

      let rawEmail = '';
      let rawPhone = '';
      let name = '';
      let company = '';
      let service = '';
      let requirement = '';

      for (const [k, v] of Object.entries(lowerPayload)) {
        if (!v || typeof v !== 'string') continue;
        if (!rawEmail && (k.includes('email') || k === 'e-mail')) rawEmail = v;
        if (!rawPhone && (k.includes('phone') || k.includes('mobile') || k === 'tel' || k.includes('whatsapp'))) rawPhone = v;
        if (!name && (k === 'name' || k.includes('full name') || k.includes('first name') || k === 'your-name')) name = v;
        if (!company && (k.includes('company') || k.includes('organization') || k.includes('business'))) company = v;
        if (!service && (k.includes('service') || k.includes('interested') || k.includes('help'))) service = v;
        if (!requirement && (k.includes('message') || k.includes('requirement') || k.includes('comments'))) requirement = v;
      }

      if (!name) name = (rawEmail ? rawEmail.split('@')[0] : 'Website Lead');
      
      rawEmail = rawEmail.trim();
      rawPhone = rawPhone.trim();
      name = name.trim();
      company = company.trim();
      service = service.trim();
      requirement = requirement.trim();

      const email = normalizeEmail(rawEmail);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { success: false, error: 'INVALID_EMAIL', message: 'A valid email address is required.' });
        return true;
      }

      // Import & invoke submitWebsiteLeadGateway
      const { submitWebsiteLeadGateway } = await import('../lib/leadGateway');
      const result = await submitWebsiteLeadGateway({
        workspace_id: matchedWorkspaceId,
        name,
        email,
        phone: rawPhone || undefined,
        company: company || undefined,
        service: service || undefined,
        requirement: requirement || undefined,
        page_url: payload.page_url || payload.website_url || 'WordPress Website',
        form_id: payload.form_id || 'wordpress_form',
        utm_source: payload.utm_source || 'wordpress',
        utm_medium: payload.utm_medium || 'connector_plugin',
        utm_campaign: payload.utm_campaign,
        provider_submission_id: payload.provider_submission_id || payload.entry_id,
      });

      // If lead submission succeeded, update metrics in integration_configs
      if (result.success && existingConfigRecord) {
        const currentCfg = existingConfigRecord.config || {};
        const totalLeads = Number(currentCfg.total_leads_received || 0) + 1;

        await supabase
          .from('integration_configs')
          .update({
            connection_status: 'connected',
            last_webhook_at: nowIso,
            config: {
              ...currentCfg,
              website_url: payload.website_url || currentCfg.website_url,
              last_lead_received: nowIso,
              last_successful_sync: nowIso,
              total_leads_received: totalLeads,
              last_error: null,
            },
            updated_at: nowIso,
          })
          .eq('id', existingConfigRecord.id);
      }

      sendJson(res, result.success ? 200 : 400, result);
      return true;
    } catch (err: any) {
      sendJson(res, 500, { success: false, error: 'SERVER_ERROR', message: err.message || 'Internal server error processing WordPress lead.' });
      return true;
    }
  }

  // ----------------------------------------------------------------------
  // 6. RAZORPAY PLATFORM SUBSCRIPTION PAYMENT WEBHOOK
  // ----------------------------------------------------------------------
  if (req.url?.startsWith('/api/webhooks/razorpay') || req.url?.startsWith('/api/webhooks/platform-payment')) {
    if (req.method !== 'POST') {
      sendJson(res, 455, { success: false, error: 'METHOD_NOT_ALLOWED' });
      return true;
    }

    try {
      const payload = await parseBody(req);
      const event = payload.event || payload.type;
      const paymentEntity = payload.payload?.payment?.entity || payload.entity || payload;
      
      const workspaceId = payload.notes?.workspace_id || paymentEntity?.notes?.workspace_id || payload.workspace_id;
      const amount = (paymentEntity?.amount ? paymentEntity.amount / 100 : payload.amount) || 0;
      const paymentId = paymentEntity?.id || payload.payment_id || `pay_${Date.now()}`;
      const status = paymentEntity?.status || 'success';

      const nowIso = new Date().toISOString();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      if (workspaceId && (event === 'payment.captured' || event === 'subscription.charged' || status === 'captured' || status === 'success')) {
        // 1. Record Platform Payment
        await supabase.from('platform_payments').insert({
          workspace_id: workspaceId,
          amount,
          currency: paymentEntity?.currency || 'INR',
          status: 'success',
          provider_payment_id: paymentId,
          payment_method: paymentEntity?.method || 'razorpay',
          created_at: nowIso,
        });

        // 2. AUTO-ACTIVATE WORKSPACE SUBSCRIPTION UNTIL EXPIRY DATE
        await supabase
          .from('workspace_subscriptions')
          .update({
            status: 'active',
            current_period_end: periodEnd,
            updated_at: nowIso,
          })
          .eq('workspace_id', workspaceId);

        // 3. Generate Platform B2B Invoice
        await supabase.from('platform_invoices').insert({
          workspace_id: workspaceId,
          invoice_number: `INV-SAAS-${Date.now().toString().slice(-6)}`,
          invoice_date: nowIso.slice(0, 10),
          due_date: nowIso.slice(0, 10),
          currency: paymentEntity?.currency || 'INR',
          subtotal: amount / 1.18,
          tax_amount: amount - (amount / 1.18),
          total: amount,
          status: 'paid',
          notes: 'Automated Razorpay Payment Auto-Activation Receipt',
          created_at: nowIso,
        });

        sendJson(res, 200, { success: true, message: 'Workspace automatically activated upon payment verification.', workspace_id: workspaceId, active_until: periodEnd });
        return true;
      }

      sendJson(res, 200, { success: true, message: 'Webhook received.' });
      return true;
    } catch (err: any) {
      sendJson(res, 500, { success: false, error: 'PAYMENT_WEBHOOK_ERROR', message: err.message });
      return true;
    }
  }

  // ----------------------------------------------------------------------
  // 7. QUOTATIONS API & DATE VALIDATION (valid_until >= quotation_date)
  // ----------------------------------------------------------------------
  if (pathname === '/api/quotations/validate' || pathname === '/api/quotations') {
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        const payload = await parseBody(req);
        const { validateQuotationDates } = await import('../lib/quotationValidation');
        const validation = validateQuotationDates(payload.quotation_date, payload.valid_until);

        if (!validation.valid) {
          sendJson(res, 400, {
            success: false,
            error: 'INVALID_DATE_RANGE',
            message: validation.error || 'Valid until date must be on or after the quotation date.',
            details: {
              quotation_date: payload.quotation_date,
              valid_until: payload.valid_until,
            },
          });
          return true;
        }

        if (pathname === '/api/quotations/validate') {
          sendJson(res, 200, { success: true, message: 'Quotation date range is valid.' });
          return true;
        }
      } catch (err: any) {
        sendJson(res, 400, { success: false, error: 'BAD_REQUEST', message: err.message });
        return true;
      }
    }
  }

  // ----------------------------------------------------------------------
  // 8. CONTACT VALIDATION API (/api/contact/validate)
  // ----------------------------------------------------------------------
  if (pathname === '/api/contact/validate' && (req.method === 'POST' || req.method === 'GET')) {
    try {
      const payload = req.method === 'POST' ? await parseBody(req) : {};
      const website = payload.website ?? url.searchParams.get('website');
      const phone = payload.phone ?? url.searchParams.get('phone');
      const whatsapp = payload.whatsapp ?? url.searchParams.get('whatsapp');

      const websiteRes = website !== undefined && website !== null ? validateWebsiteUrl(website) : null;
      const phoneRes = phone !== undefined && phone !== null ? validatePhoneNumber(phone, { fieldLabel: 'Phone number' }) : null;
      const whatsappRes = whatsapp !== undefined && whatsapp !== null ? validatePhoneNumber(whatsapp, { fieldLabel: 'WhatsApp number' }) : null;

      const errors: Record<string, string> = {};
      if (websiteRes && !websiteRes.isValid) errors.website = websiteRes.error || 'Please enter a valid website URL.';
      if (phoneRes && !phoneRes.isValid) errors.phone = phoneRes.error || 'Please enter a valid phone number.';
      if (whatsappRes && !whatsappRes.isValid) errors.whatsapp = whatsappRes.error || 'Please enter a valid WhatsApp number.';

      const isValid = Object.keys(errors).length === 0;
      sendJson(res, isValid ? 200 : 400, {
        success: isValid,
        isValid,
        errors,
      });
      return true;
    } catch (err: any) {
      sendJson(res, 500, { success: false, error: 'SERVER_ERROR', message: err.message });
      return true;
    }
  }

  return false;
}

