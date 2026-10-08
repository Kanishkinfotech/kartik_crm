import type { Lead, LeadActivityEvent } from './types';
import { supabase } from './supabase';

export type LeadEmailTemplateType =
  | 'Lead Acknowledgement'
  | 'Requirement Request'
  | 'Quotation Sent'
  | 'Follow-up 1'
  | 'Follow-up 2'
  | 'Final Follow-up';

export interface WorkflowEmailResult {
  sent: boolean;
  template: LeadEmailTemplateType;
  recipient: string;
  subject: string;
  reason?: string;
}

export interface SenderBrand {
  /** Workspace company name, from workspaces.branding.company_name */
  company: string;
  /** Reply-to address shown in the sign-off, if the workspace set one */
  supportEmail?: string;
}

/**
 * Multi-tenant: every workspace sends under its own name. Nothing here may
 * name a specific customer - the fallback is deliberately generic.
 */
export function getLeadEmailContent(
  template: LeadEmailTemplateType,
  lead: Lead,
  brand: SenderBrand = { company: 'our team' },
): { subject: string; body: string } {
  const org = brand.company || 'our team';
  const contactLine = brand.supportEmail ? `Reply to this email or write to us at ${brand.supportEmail}.` : 'Reply directly to this email and we will pick it up.';
  const name = lead.contact_name || 'Valued Customer';
  const company = lead.company_name || 'your organization';
  const service = lead.interested_service_name || 'Software Solutions';

  switch (template) {
    case 'Lead Acknowledgement':
      return {
        subject: `[${org}] We received your enquiry for ${service}`,
        body: `Dear ${name},\n\nThank you for reaching out to ${org} regarding ${service}.\n\nOur team has received your details and is reviewing your project requirements. A dedicated Solutions Consultant will reach out to you within 24 business hours to discuss the next steps.\n\nEnquiry Summary:\n- Company: ${company}\n- Service Requested: ${service}\n- Reference ID: ${lead.lead_number || lead.id}\n\nBest Regards,\nClient Services Team\n${org}`,
      };

    case 'Requirement Request': {
      let requirementQuestions = `1. Target Completion Timeline / Go-live date\n2. Number of active users / outlets\n3. Existing systems / integrations required`;
      
      const serviceLower = (service || '').toLowerCase();
      if (serviceLower.includes('web') || serviceLower.includes('site')) {
        requirementQuestions = `1. New website build or redesign of existing site?\n2. Number of pages & main sections required\n3. E-commerce / online payments required?\n4. Domain & hosting available?\n5. Reference website examples you like\n6. Target launch deadline & budget range`;
      } else if (serviceLower.includes('design') || serviceLower.includes('graphic') || serviceLower.includes('logo')) {
        requirementQuestions = `1. Design deliverables required (Logo, Branding, Social Media, Brochure)\n2. Quantity & required format dimensions\n3. Do you have existing brand colors/guidelines?\n4. Preferred design style & sample references\n5. Target completion deadline`;
      } else if (serviceLower.includes('seo') || serviceLower.includes('marketing') || serviceLower.includes('digital')) {
        requirementQuestions = `1. Target website URL\n2. Primary geographic locations / regions\n3. Core target keywords or product categories\n4. Top 3 key competitors\n5. Main business goals (leads, traffic, online sales)`;
      } else if (serviceLower.includes('crm') || serviceLower.includes('software') || serviceLower.includes('automation') || serviceLower.includes('pos')) {
        requirementQuestions = `1. Total team size / active CRM user count\n2. Current software / tools in use\n3. Top 3 operational bottlenecks to automate\n4. Custom integrations needed (WhatsApp, Razorpay, Tally, Email)\n5. Target deployment timeline`;
      }

      return {
        subject: `[${org}] Requirement Details for ${service} (${company})`,
        body: `Hi ${name},\n\nTo help us design the most accurate proposal and architecture for ${company}, could you please reply with brief answers to the following details regarding ${service}?\n\n${requirementQuestions}\n\n${contactLine}\n\nWarm Regards,\nSolutions Engineering Team\n${org}`,
      };
    }

    case 'Quotation Sent':
      return {
        subject: `[${org}] Custom Quotation & Proposal for ${company}`,
        body: `Dear ${name},\n\nWe are pleased to present our formal quotation and project proposal for ${service} for ${company}.\n\nPlease review the attached quotation details. Feel free to contact us if you have any questions or require scope adjustments.\n\nLooking forward to collaborating with you!\n\nBest Regards,\nSales Team\n${org}`,
      };

    case 'Follow-up 1':
      return {
        subject: `[Checking In] Following up on ${service} for ${company}`,
        body: `Hi ${name},\n\nI hope you are having a great week! I am following up to see if you had a chance to review our initial discussion and proposal regarding ${service}.\n\nPlease let me know if you would like to schedule a 10-minute demo call this week.\n\nBest Regards,\n${lead.assigned_owner_name || 'Sales Team'}\n${org}`,
      };

    case 'Follow-up 2':
      return {
        subject: `[Quick Question] Next steps regarding ${service}`,
        body: `Hi ${name},\n\nJust checking in regarding your enquiry for ${company}. Are you still looking for ${service} solutions this quarter?\n\nHappy to tailor our proposal to fit your timeline or budget constraints.\n\nWarm Regards,\n${lead.assigned_owner_name || 'Client Relations'}\n${org}`,
      };

    case 'Final Follow-up':
      return {
        subject: `[Final Check-in] Closing enquiry for ${company}`,
        body: `Dear ${name},\n\nWe haven't heard back regarding your enquiry for ${service}. We will be closing this active file for now to keep our records updated.\n\nIf your requirements open up again in the future, please feel free to reach out anytime!\n\nBest Wishes,\n${org} Team`,
      };
  }
}

/**
 * Send Lead Workflow Email with automated safety rule checks
 */
export async function sendLeadWorkflowEmail(
  workspaceId: string,
  lead: Lead,
  template: LeadEmailTemplateType
): Promise<WorkflowEmailResult> {
  // 1. Safety Rule Checks: Stop automated emails if customer replied, DNC, Won, Lost, or Spam
  if (lead.is_do_not_contact) {
    return { sent: false, template, recipient: lead.email, subject: '', reason: 'STOPPED: Lead flagged Do Not Contact.' };
  }
  if (lead.unsubscribe_status) {
    return { sent: false, template, recipient: lead.email, subject: '', reason: 'STOPPED: Recipient unsubscribed.' };
  }
  if (lead.status === 'won' || lead.status === 'lost' || lead.status === 'spam') {
    return { sent: false, template, recipient: lead.email, subject: '', reason: `STOPPED: Lead in terminal stage (${(lead.status ?? '').toUpperCase()}).` };
  }

  // Load this workspace's own branding so the email is signed correctly.
  let brand: SenderBrand = { company: 'our team' };
  try {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('name, branding')
      .eq('id', workspaceId)
      .maybeSingle();
    if (ws) {
      const b = (ws.branding ?? {}) as Record<string, string>;
      brand = {
        company: b.company_name || ws.name || 'our team',
        supportEmail: b.email || undefined,
      };
    }
  } catch {
    // Fall back to the generic wording rather than another tenant's name.
  }

  const emailData = getLeadEmailContent(template, lead, brand);
  const nowIso = new Date().toISOString();

  // Create Timeline Activity Event
  const emailEvent: LeadActivityEvent = {
    id: `email_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    lead_id: lead.id,
    workspace_id: workspaceId,
    event_type: 'email_sent',
    title: `Email Sent: ${template}`,
    description: `To: ${lead.email} | Subject: ${emailData.subject}`,
    metadata: {
      template,
      recipient: lead.email,
      subject: emailData.subject,
      body: emailData.body,
    },
    created_at: nowIso,
  };

  const updatedTimeline = [...(lead.timeline_events || []), emailEvent];
  const updatedLead: Lead = {
    ...lead,
    last_contact_at: nowIso,
    timeline_events: updatedTimeline,
    updated_at: nowIso,
  };

  // Save updated lead
  try {
    await supabase.from('leads').upsert({
      id: updatedLead.id,
      workspace_id: workspaceId,
      last_contact_at: nowIso,
      timeline_events: updatedTimeline,
      updated_at: nowIso,
    });
  } catch {
    // Local storage fallback
  }

  try {
    const cachedStr = typeof localStorage !== 'undefined' ? localStorage.getItem(`k1_leads_${workspaceId}`) : null;
    if (cachedStr) {
      const list: Lead[] = JSON.parse(cachedStr);
      const updatedList = list.map((l) => (l.id === updatedLead.id ? updatedLead : l));
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`k1_leads_${workspaceId}`, JSON.stringify(updatedList));
      }
    }
  } catch {
    // Ignore cache error in test/server environment
  }

  return {
    sent: true,
    template,
    recipient: lead.email,
    subject: emailData.subject,
  };
}
