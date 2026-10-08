import { supabase } from '@/lib/supabase';

/**
 * Emit an automation event. Called after significant business actions.
 * The automation-worker edge function processes these events.
 */
export async function emitAutomationEvent(params: {
  workspaceId: string;
  eventType: string;
  recordType: string;
  recordId?: string | null;
  relatedClientId?: string | null;
  source?: 'user' | 'system' | 'razorpay' | 'whatsapp' | 'email' | 'automation' | 'scheduler';
  originUserId?: string | null;
  originAutomationRunId?: string | null;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const idempotencyKey = `${params.workspaceId}:${params.eventType}:${params.recordType}:${params.recordId ?? 'none'}:${Date.now()}`;
  await supabase.from('automation_events').insert({
    workspace_id: params.workspaceId,
    event_type: params.eventType,
    record_type: params.recordType,
    record_id: params.recordId ?? null,
    related_client_id: params.relatedClientId ?? null,
    source: params.source ?? 'user',
    origin_user_id: params.originUserId ?? null,
    origin_automation_run_id: params.originAutomationRunId ?? null,
    previous_values: params.previousValues ?? null,
    new_values: params.newValues ?? null,
    idempotency_key: idempotencyKey,
    metadata: params.metadata ?? {},
  });
}

export async function ensureAutomationSettings(workspaceId: string): Promise<void> {
  await supabase.rpc('ensure_automation_settings', { p_workspace_id: workspaceId });
}

export async function triggerAutomationWorker(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  await fetch(`${url}/functions/v1/automation-worker`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${session?.access_token || key}`, 'Content-Type': 'application/json' },
  });
}

export const TRIGGER_CATEGORIES = {
  lead: ['lead_created', 'lead_assigned', 'lead_status_changed', 'lead_follow_up_due', 'lead_follow_up_overdue', 'lead_converted', 'lead_inactive'],
  client: ['client_created', 'client_activated', 'client_status_changed', 'client_assigned', 'client_inactive', 'client_document_expiry', 'client_service_added'],
  quotation: ['quotation_created', 'quotation_submitted_for_review', 'quotation_approved_internally', 'quotation_sent', 'quotation_viewed', 'quotation_follow_up_due', 'quotation_revision_requested', 'quotation_approved_by_client', 'quotation_rejected', 'quotation_expiring_soon', 'quotation_expired', 'quotation_converted', 'quotation_inactive'],
  invoice: ['invoice_created', 'invoice_approved', 'invoice_sent', 'invoice_viewed', 'invoice_due_soon', 'invoice_due_today', 'invoice_overdue', 'invoice_partially_paid', 'invoice_fully_paid', 'invoice_cancelled', 'invoice_payment_link_created', 'payment_link_expiring', 'payment_link_expired'],
  payment: ['payment_received', 'partial_payment_received', 'full_payment_received', 'manual_payment_recorded', 'razorpay_payment_verified', 'payment_reconciliation_failed', 'payment_mismatch_detected', 'payment_receipt_generated', 'client_credit_created'],
  project: ['project_created', 'project_assigned', 'project_started', 'project_status_changed', 'project_health_changed', 'project_waiting_for_client', 'project_at_risk', 'project_delayed', 'project_due_soon', 'project_overdue', 'project_completed', 'project_reopened', 'project_inactive'],
  milestone: ['milestone_created', 'milestone_started', 'milestone_due_soon', 'milestone_overdue', 'milestone_ready_for_review', 'milestone_approval_pending', 'milestone_completed', 'milestone_reopened', 'payment_dependency_satisfied'],
  task: ['task_created', 'task_assigned', 'task_started', 'task_status_changed', 'task_due_soon', 'task_due_today', 'task_overdue', 'task_blocked', 'task_waiting_for_client', 'task_submitted_for_review', 'task_changes_requested', 'task_approved', 'task_completed', 'task_reopened', 'task_inactive'],
  requirement: ['requirement_created', 'requirement_requested', 'requirement_due_soon', 'requirement_overdue', 'requirement_partially_received', 'requirement_received', 'requirement_rejected'],
  approval: ['approval_created', 'approval_ready_to_send', 'approval_requested', 'approval_pending', 'approval_overdue', 'approval_approved', 'changes_requested', 'approval_rejected', 'approval_expired'],
  change_request: ['change_request_created', 'change_request_submitted', 'change_request_approved_internally', 'change_request_sent_to_client', 'change_request_approved', 'change_request_rejected', 'change_request_converted'],
  work_report: ['work_report_created', 'work_report_submitted_for_review', 'work_report_approved', 'work_report_ready_to_share', 'work_report_shared', 'work_report_acknowledged', 'work_report_revision_requested'],
  communication: ['email_received', 'email_sent', 'email_failed', 'whatsapp_received', 'whatsapp_sent', 'whatsapp_delivered', 'whatsapp_read', 'whatsapp_failed', 'client_reply_received', 'communication_unmatched', 'no_client_reply'],
  renewal: ['hosting_renewal_due', 'domain_renewal_due', 'maintenance_renewal_due', 'subscription_renewal_due', 'contract_expiry_approaching', 'service_expiry_approaching', 'renewal_quotation_not_approved', 'renewal_invoice_overdue'],
  scheduled: ['scheduled_daily', 'scheduled_weekly', 'scheduled_monthly', 'scheduled_yearly', 'scheduled_weekdays', 'scheduled_custom'],
} as const;

export const ACTION_TYPES = {
  client: ['create_client', 'update_client_status', 'update_service_status', 'assign_account_manager', 'add_tag', 'remove_tag', 'add_internal_note', 'create_follow_up', 'set_next_action_date'],
  quotation: ['create_quotation_draft', 'duplicate_quotation', 'update_quotation_status', 'create_quotation_follow_up', 'notify_salesperson', 'prepare_quotation_email', 'prepare_quotation_whatsapp', 'send_quotation_email', 'send_quotation_whatsapp', 'create_project_from_quotation', 'create_invoice_from_quotation', 'create_client_services_from_quotation'],
  invoice: ['create_invoice_draft', 'create_payment_link', 'prepare_invoice_email', 'prepare_invoice_whatsapp', 'send_invoice_email', 'send_invoice_whatsapp', 'create_payment_reminder', 'notify_accounts', 'generate_receipt', 'update_billing_ready', 'generate_invoice_pdf'],
  payment: ['notify_accounts_payment', 'notify_project_manager_payment', 'generate_receipt', 'update_payment_dependency', 'create_payment_note', 'create_follow_up_mismatch', 'create_reconciliation_task', 'escalate_failed_reconciliation'],
  project: ['create_project', 'assign_project_manager', 'create_milestone', 'create_task', 'update_project_status', 'update_project_health', 'add_project_note', 'create_client_requirement', 'create_approval_request', 'create_work_report_draft', 'notify_project_team', 'mark_billing_ready'],
  task: ['create_task', 'assign_task', 'set_due_date', 'update_priority', 'update_task_status', 'add_task_comment', 'create_review_request', 'notify_assignee', 'notify_project_manager', 'escalate_overdue_task'],
  communication: ['send_email', 'send_whatsapp', 'prepare_email', 'prepare_whatsapp', 'notify_user', 'create_communication_draft', 'add_communication_note'],
  renewal: ['create_renewal_opportunity', 'create_quotation_draft', 'create_invoice_draft', 'create_follow_up_task', 'notify_account_manager', 'send_renewal_email', 'send_renewal_whatsapp', 'escalate_expired_service', 'mark_service_pending_renewal'],
  system: ['add_timeline_activity', 'add_audit_log', 'send_internal_notification', 'call_webhook', 'wait', 'stop_automation', 'request_approval'],
} as const;

export const CONDITION_OPERATORS = {
  record: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'in_list', 'not_in_list', 'changed_from', 'changed_to'],
  date: ['before', 'after', 'on', 'within_next_days', 'older_than_days', 'days_overdue', 'days_since_last_activity', 'between_dates'],
  relationship: ['client_has_active_project', 'client_has_outstanding_invoice', 'client_has_unpaid_invoice', 'project_has_overdue_task', 'project_has_pending_requirement', 'project_has_pending_approval', 'quotation_has_related_project', 'invoice_has_active_payment_link', 'client_has_tag', 'user_belongs_to_role', 'service_belongs_to_category'],
} as const;

export function formatTriggerType(triggerType: string): string {
  return triggerType.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function formatActionType(actionType: string): string {
  return actionType.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export const CATEGORY_LABELS: Record<string, string> = {
  lead_management: 'Lead Management', client_onboarding: 'Client Onboarding',
  quotation: 'Quotation', invoice: 'Invoice', payment: 'Payment',
  project: 'Project', task: 'Task', client_communication: 'Client Communication',
  renewal: 'Renewal', work_report: 'Work Report',
  internal_notification: 'Internal Notification', custom: 'Custom',
};

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: Array<{ type: string; field: string; operator: string; value: unknown; logic?: 'AND' | 'OR' }>;
  actions: Array<{ type: string; config: Record<string, unknown>; branch?: 'then' | 'else' }>;
  safety_rules: {
    run_once_per_record?: boolean;
    prevent_duplicate_execution?: boolean;
    stop_on_lead_won?: boolean;
    stop_on_lead_lost?: boolean;
    stop_on_customer_reply?: boolean;
    stop_on_do_not_contact?: boolean;
    stop_on_invoice_paid?: boolean;
    stop_on_invoice_cancelled?: boolean;
  };
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'universal_lead_followup',
    name: 'Universal Lead Follow-up',
    description: 'Acknowledge leads immediately regardless of source, assign an owner, schedule follow-up, wait 1 day, and send follow-up email if customer has not replied.',
    category: 'lead_management',
    trigger_type: 'lead_created',
    trigger_config: { source: 'all' },
    conditions: [],
    actions: [
      { type: 'send_email', config: { target: 'client', message: 'Thank you for reaching out! We have received your inquiry and will get in touch shortly.' }, branch: 'then' },
      { type: 'assign_lead', config: { target: 'workspace_owner' }, branch: 'then' },
      { type: 'notify_user', config: { target: 'assignee', message: 'A new lead has been assigned to you.' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Initial discovery call with new lead', due_days: 1, priority: 'high' }, branch: 'then' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 1, duration_unit: 'days' }, branch: 'then' },
      { type: 'send_email', config: { target: 'client', message: 'Hi {{lead.name}}, following up on your inquiry. Do you have 10 minutes for a brief call this week?' }, branch: 'else' },
      { type: 'notify_user', config: { target: 'assignee', message: 'Automated follow-up email was sent to your new lead.' }, branch: 'else' }
    ],
    safety_rules: {
      run_once_per_record: true,
      prevent_duplicate_execution: true,
      stop_on_lead_won: true,
      stop_on_lead_lost: true,
      stop_on_customer_reply: true,
      stop_on_do_not_contact: true,
    }
  },
  {
    id: 'universal_quotation_followup',
    name: 'Universal Quotation Follow-up',
    description: 'Automatically wait 3 days after sending any quotation. If accepted, onboard the client. If not, send follow-up email and create task.',
    category: 'quotation',
    trigger_type: 'quotation_sent',
    trigger_config: { source: 'all' },
    conditions: [
      { type: 'record', field: 'status', operator: 'equals', value: 'sent', logic: 'AND' }
    ],
    actions: [
      { type: 'wait', config: { duration_type: 'custom', duration_value: 3, duration_unit: 'days' }, branch: 'then' },
      { type: 'send_email', config: { target: 'client', message: 'Hi {{customer.first_name}},\n\nJust following up regarding the quotation we shared for {{quotation.service_summary}}.\n\nIf you have any questions, simply reply to this email.' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Follow up Quotation {{quotation.number}} — {{customer.name}}', due_days: 2, priority: 'medium' }, branch: 'then' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 4, duration_unit: 'days' }, branch: 'then' },
      { type: 'notify_user', config: { target: 'assignee', message: 'Quotation {{quotation.number}} has had no response after automated follow-up. Please follow up manually.' }, branch: 'then' },
      { type: 'send_email', config: { target: 'client', message: 'Hi {{customer.first_name}},\n\nThis is our final reminder regarding Quotation {{quotation.number}}. Please let us know if you wish to proceed.' }, branch: 'then' }
    ],
    safety_rules: {
      run_once_per_record: true,
      prevent_duplicate_execution: true,
      stop_on_lead_won: true,
      stop_on_lead_lost: true,
      stop_on_customer_reply: true,
      stop_on_do_not_contact: true,
    }
  },
  {
    id: 'new_email_enquiry_response',
    name: 'New Email Enquiry Response',
    description: 'Automatically notify assigned salesperson and create follow-up task when a new inbound email enquiry arrives.',
    category: 'client_communication',
    trigger_type: 'email_received',
    trigger_config: { source: 'email' },
    conditions: [
      { type: 'record', field: 'status', operator: 'equals', value: 'new', logic: 'AND' }
    ],
    actions: [
      { type: 'assign_lead', config: { target: 'workspace_owner' }, branch: 'then' },
      { type: 'send_email', config: { target: 'client', message: 'Hi! Thank you for your email. We have received your inquiry and a team member will be in touch shortly.' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Review and reply to inbound email enquiry', due_days: 1, priority: 'high' }, branch: 'then' },
      { type: 'notify_user', config: { target: 'assignee', message: 'New inbound email enquiry received. Auto-acknowledgement sent.' }, branch: 'then' }
    ],
    safety_rules: {
      stop_on_customer_reply: true,
      prevent_duplicate_execution: true
    }
  },

  {
    id: 'invoice_due_reminder',
    name: 'Invoice Due Reminder',
    description: 'Send payment reminder email & WhatsApp message 2 days before invoice due date.',
    category: 'invoice',
    trigger_type: 'invoice_due_soon',
    trigger_config: { days_threshold: 2 },
    conditions: [
      { type: 'record', field: 'status', operator: 'equals', value: 'unpaid', logic: 'AND' }
    ],
    actions: [
      { type: 'send_email', config: { target: 'client', message: 'Friendly reminder: Your invoice is due in 2 days. You can pay online via your client portal.' }, branch: 'then' },
      { type: 'send_whatsapp', config: { target: 'client', message: 'Hi! Friendly reminder that invoice #[invoice_number] is due in 2 days.' }, branch: 'then' }
    ],
    safety_rules: {
      prevent_duplicate_execution: true
    }
  },
  {
    id: 'overdue_invoice_reminder',
    name: 'Overdue Invoice Reminder',
    description: 'When an invoice becomes overdue, escalate to accounts team and send reminder to client every 3 days.',
    category: 'invoice',
    trigger_type: 'invoice_overdue',
    trigger_config: { days_threshold: 1 },
    conditions: [
      { type: 'record', field: 'status', operator: 'equals', value: 'overdue', logic: 'AND' }
    ],
    actions: [
      { type: 'notify_accounts', config: { target: 'accounts', message: 'Invoice overdue escalation for client.' }, branch: 'then' },
      { type: 'send_email', config: { target: 'client', message: 'Urgent: Invoice is overdue. Please process payment as soon as possible.' }, branch: 'then' }
    ],
    safety_rules: {
      prevent_duplicate_execution: true
    }
  },
  {
    id: 'inactive_lead_reengagement',
    name: 'Inactive Lead Follow-up',
    description: 'Re-engage leads with no activity for 14 days. Waits 7 days for a reply before marking dormant.',
    category: 'lead_management',
    trigger_type: 'lead_inactive',
    trigger_config: { days_threshold: 14 },
    conditions: [
      { type: 'record', field: 'status', operator: 'not_equals', value: 'converted', logic: 'AND' }
    ],
    actions: [
      { type: 'send_email', config: { target: 'client', message: 'Hi {{lead.name}},\n\nChecking in to see if you still need assistance with your project? Let us know if we can help!' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Re-engaged inactive lead - monitor response', due_days: 2, priority: 'normal' }, branch: 'then' },
      { type: 'notify_user', config: { target: 'assignee', message: 'Automated re-engagement email sent to inactive lead.' }, branch: 'then' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 7, duration_unit: 'days' }, branch: 'then' },
      { type: 'notify_user', config: { target: 'assignee', message: 'Lead did not respond after 7 days. Marking as dormant.' }, branch: 'else' },
      { type: 'update_lead_stage', config: { new_stage: 'lost' }, branch: 'else' }
    ],
    safety_rules: {
      stop_on_lead_won: true,
      stop_on_lead_lost: true,
      stop_on_customer_reply: true,
      prevent_duplicate_execution: true,
      run_once_per_record: true
    }
  },
  {
    id: 'new_client_onboarding',
    name: 'New Client Onboarding',
    description: 'Advanced onboarding flow: sends welcome comms, creates onboarding project, internal tasks, and notifies the team.',
    category: 'client_onboarding',
    trigger_type: 'client_activated',
    trigger_config: {},
    conditions: [],
    actions: [
      { type: 'send_email', config: { target: 'client', message: 'Welcome aboard {{client.name}}! We are thrilled to start working together on your project.' }, branch: 'then' },
      { type: 'send_whatsapp', config: { target: 'client', message: 'Welcome to the Kanishk CRM family! Your dedicated client portal is now active.' }, branch: 'then' },
      { type: 'create_project', config: { title: 'New Client Onboarding & Project Setup' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Complete internal onboarding checklist', due_days: 1, priority: 'high' }, branch: 'then' },
      { type: 'create_follow_up', config: { title: 'Client Onboarding check-in call', due_days: 3 }, branch: 'then' },
      { type: 'notify_user', config: { target: 'workspace_owner', message: 'A new client has been activated! Onboarding project and tasks have been generated.' }, branch: 'then' }
    ],
    safety_rules: {
      run_once_per_record: true
    }
  },
  {
    id: 'task_due_reminder',
    name: 'Task Due Reminder',
    description: 'Notify assigned team member on the morning of a task due date.',
    category: 'task',
    trigger_type: 'task_due_today',
    trigger_config: {},
    conditions: [
      { type: 'record', field: 'status', operator: 'not_equals', value: 'completed', logic: 'AND' }
    ],
    actions: [
      { type: 'notify_user', config: { target: 'assignee', message: 'Task is due today! Please make sure to complete or update progress.' }, branch: 'then' }
    ],
    safety_rules: {
      prevent_duplicate_execution: true
    }
  },
  {
    id: 'client_relationship_followup',
    name: 'Client Relationship Follow-up',
    description: 'Trigger a relationship check when a client has no activity for 30 days. Includes escalation path.',
    category: 'client_management',
    trigger_type: 'client_inactive',
    trigger_config: { days_threshold: 30 },
    conditions: [
      { type: 'record', field: 'status', operator: 'equals', value: 'active', logic: 'AND' }
    ],
    actions: [
      { type: 'notify_user', config: { target: 'assignee', message: 'Client has had no meaningful communication for 30 days. Please reach out.' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Client Relationship Check-in', due_days: 2, priority: 'normal' }, branch: 'then' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 7, duration_unit: 'days' }, branch: 'then' },
      { type: 'notify_user', config: { target: 'assignee', message: 'Reminder: Client relationship check-in is still pending.' }, branch: 'else' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 3, duration_unit: 'days' }, branch: 'else' },
      { type: 'notify_user', config: { target: 'workspace_owner', message: 'ESCALATION: Client relationship check-in has been ignored for 10 days.' }, branch: 'else' }
    ],
    safety_rules: {
      stop_on_customer_reply: true,
      prevent_duplicate_execution: true,
      run_once_per_record: false
    }
  },
  {
    id: 'service_renewal_reminder',
    name: 'Service Renewal Reminder',
    description: '30-day escalation path for expiring client services. Creates tasks, sends client reminders, and alerts managers if ignored.',
    category: 'renewal',
    trigger_type: 'service_expiry_approaching',
    trigger_config: { days_threshold: 30 },
    conditions: [
      { type: 'record', field: 'status', operator: 'equals', value: 'active', logic: 'AND' }
    ],
    actions: [
      { type: 'notify_user', config: { target: 'assignee', message: 'Service expiring in 30 days. Please initiate renewal.' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Prepare Renewal Quotation & Follow-up', due_days: 2, priority: 'normal' }, branch: 'then' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 15, duration_unit: 'days' }, branch: 'then' },
      { type: 'send_email', config: { target: 'client', message: 'Hi {{client.name}},\n\nFriendly reminder that your service is expiring in 15 days. Please reach out to process your renewal to avoid interruption.' }, branch: 'else' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 8, duration_unit: 'days' }, branch: 'else' },
      { type: 'notify_user', config: { target: 'assignee', message: 'URGENT: Service expiring in 7 days! Follow up with client immediately.' }, branch: 'else' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 7, duration_unit: 'days' }, branch: 'else' },
      { type: 'notify_user', config: { target: 'workspace_owner', message: 'Service has EXPIRED. Marking renewal as pending/lost.' }, branch: 'else' }
    ],
    safety_rules: {
      stop_on_customer_reply: true,
      prevent_duplicate_execution: true,
      run_once_per_record: true
    }
  },
  {
    id: 'new_service_activation',
    name: 'New Service Activation',
    description: 'Prepare new service for delivery by verifying commercial details, assigning ownership, checking requirements, and spinning up delivery tasks.',
    category: 'client_onboarding',
    trigger_type: 'client_service_added',
    trigger_config: {},
    conditions: [
      { type: 'record', field: 'status', operator: 'not_equals', value: 'active', logic: 'AND' }
    ],
    actions: [
      { type: 'notify_user', config: { target: 'workspace_owner', message: 'New Client Service added. Validating commercial details from accepted quotation.' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Assign Service Owner & Collect Missing Requirements', due_days: 1, priority: 'high' }, branch: 'then' },
      { type: 'create_project', config: { title: 'Service Delivery & Implementation' }, branch: 'then' },
      { type: 'update_client_status', config: { new_status: 'active' }, branch: 'then' },
      { type: 'send_email', config: { target: 'client', message: 'Hi {{client.name}},\n\nYour new service is officially being set up by our delivery team. We will be in touch shortly.' }, branch: 'then' }
    ],
    safety_rules: {
      prevent_duplicate_execution: true,
      run_once_per_record: true
    }
  },
  {
    id: 'service_delivery_followup',
    name: 'Service Delivery Follow-up',
    description: 'Monitor active services for delivery delays. Creates internal tasks and escalates to management if progress stalls.',
    category: 'service_management',
    trigger_type: 'project_inactive',
    trigger_config: { days_threshold: 7 },
    conditions: [
      { type: 'record', field: 'status', operator: 'equals', value: 'active', logic: 'AND' }
    ],
    actions: [
      { type: 'notify_user', config: { target: 'assignee', message: 'No meaningful progress detected for 7 days. Please update delivery status.' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Update Delivery Progress & Resolve Blockers', due_days: 1, priority: 'medium' }, branch: 'then' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 3, duration_unit: 'days' }, branch: 'then' },
      { type: 'notify_user', config: { target: 'project_manager', message: 'ESCALATION: Service inactive for 10 days. Please intervene.' }, branch: 'else' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 2, duration_unit: 'days' }, branch: 'else' },
      { type: 'update_project_health', config: { new_health: 'at_risk' }, branch: 'else' },
      { type: 'notify_user', config: { target: 'workspace_owner', message: 'CRITICAL ESCALATION: Service At Risk due to 12 days inactivity.' }, branch: 'else' }
    ],
    safety_rules: {
      prevent_duplicate_execution: true,
      run_once_per_record: false
    }
  },
  {
    id: 'quotation_accepted_processing',
    name: 'Quotation Accepted → Client / Service Activation',
    description: 'When a quotation is accepted, convert the Lead to a Client (if applicable) and automatically create Client Services from the accepted quotation items.',
    category: 'quotation',
    trigger_type: 'quotation_approved_by_client',
    trigger_config: {},
    conditions: [
      { type: 'record', field: 'status', operator: 'equals', value: 'accepted', logic: 'AND' }
    ],
    actions: [
      { type: 'update_lead_stage', config: { new_stage: 'won' }, branch: 'then' },
      { type: 'create_client', config: { copy_from: 'lead' }, branch: 'then' },
      { type: 'assign_account_manager', config: { target: 'lead_owner' }, branch: 'then' },
      { type: 'create_client_services_from_quotation', config: { lock_commercials: true }, branch: 'then' },
      { type: 'notify_user', config: { target: 'workspace_owner', message: 'Quotation Accepted! Services have been securely provisioned.' }, branch: 'then' }
    ],
    safety_rules: {
      prevent_duplicate_execution: true,
      run_once_per_record: true,
      stop_on_customer_reply: false
    }
  },
  {
    id: 'quotation_expiry_reminder',
    name: 'Quotation Expiry Reminder',
    description: 'Triggered 3 days before a quotation expires. Notifies the salesperson, reminds the customer, and manages the expired state if ignored.',
    category: 'quotation',
    trigger_type: 'quotation_expiring_soon',
    trigger_config: { days_threshold: 3 },
    conditions: [
      { type: 'record', field: 'status', operator: 'not_equals', value: 'accepted', logic: 'AND' }
    ],
    actions: [
      { type: 'notify_user', config: { target: 'assignee', message: 'Quotation {{quotation.number}} expires in 3 days. Please follow up.' }, branch: 'then' },
      { type: 'send_email', config: { target: 'client', message: 'Hi {{customer.first_name}},\n\nJust a quick reminder that quotation {{quotation.number}} for {{quotation.service_summary}} is valid until {{quotation.valid_until}}.\n\nPlease let us know if you have any questions!' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Follow up expiring quotation {{quotation.number}}', due_days: 3, priority: 'high' }, branch: 'then' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 3, duration_unit: 'days' }, branch: 'then' },
      { type: 'update_quotation_status', config: { new_status: 'expired' }, branch: 'else' },
      { type: 'notify_user', config: { target: 'assignee', message: 'Quotation {{quotation.number}} has expired. Please review and extend, revise, or close.' }, branch: 'else' },
      { type: 'create_task', config: { title: 'Review expired quotation {{quotation.number}}', due_days: 1, priority: 'high' }, branch: 'else' }
    ],
    safety_rules: {
      prevent_duplicate_execution: true,
      run_once_per_record: false,
      stop_on_customer_reply: true,
      stop_on_lead_won: true,
      stop_on_lead_lost: true
    }
  },
  {
    id: 'quotation_rejected_followup',
    name: 'Quotation Rejected / Lost Follow-up',
    description: 'When a quotation is rejected, alert the salesperson to record the reason and decide whether to close the lead or schedule a future follow-up.',
    category: 'quotation',
    trigger_type: 'quotation_rejected',
    trigger_config: {},
    conditions: [],
    actions: [
      { type: 'notify_user', config: { target: 'assignee', message: 'Quotation {{quotation.number}} was REJECTED. Please record the reason and determine next steps.' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Record Rejection Reason & Determine Next Steps for {{quotation.number}}', due_days: 1, priority: 'high' }, branch: 'then' }
    ],
    safety_rules: {
      prevent_duplicate_execution: true,
      run_once_per_record: true
    }
  },
  {
    id: 'invoice_created_sent',
    name: 'Invoice Created / Sent',
    description: 'When an invoice is finalized, generate the PDF, validate billing details, send the invoice to the customer, and alert accounts.',
    category: 'invoice',
    trigger_type: 'invoice_approved',
    trigger_config: {},
    conditions: [
      { type: 'record', field: 'status', operator: 'equals', value: 'finalized', logic: 'AND' }
    ],
    actions: [
      { type: 'generate_invoice_pdf', config: { attach_to_record: true }, branch: 'then' },
      { type: 'send_invoice_email', config: { target: 'billing_email', message: 'Hi {{client.contact_name}},\n\nPlease find attached Invoice {{invoice.number}} for {{invoice.service_summary}}.\n\nDue Date: {{invoice.due_date}}\nAmount Due: {{invoice.balance_due}}' }, branch: 'then' },
      { type: 'notify_user', config: { target: 'assignee', message: 'Invoice {{invoice.number}} for {{invoice.total}} has been successfully generated and sent to the client.' }, branch: 'then' },
      { type: 'notify_accounts', config: { message: 'New invoice sent and awaiting payment: {{invoice.number}} for {{invoice.total}}.' }, branch: 'then' }
    ],
    safety_rules: {
      prevent_duplicate_execution: true,
      run_once_per_record: true
    }
  },
  {
    id: 'invoice_due_reminder',
    name: 'Invoice Due Reminder',
    description: 'Triggered 2 days before an invoice is due. Checks current outstanding balance and sends a polite payment reminder to the client.',
    category: 'invoice',
    trigger_type: 'invoice_due_soon',
    trigger_config: { days_threshold: 2 },
    conditions: [
      { type: 'record', field: 'status', operator: 'not_equals', value: 'cancelled', logic: 'AND' },
      { type: 'record', field: 'balance_due', operator: 'greater_than', value: 0, logic: 'AND' }
    ],
    actions: [
      { type: 'send_invoice_email', config: { target: 'billing_email', message: 'Hi {{client.contact_name}},\n\nThis is a friendly reminder that Invoice {{invoice.number}} is due on {{invoice.due_date}}.\n\nAmount Due: {{invoice.balance_due}}\n\nIf payment has already been made, please disregard this reminder.' }, branch: 'then' },
      { type: 'notify_accounts', config: { message: 'Automated due reminder sent to client for Invoice {{invoice.number}}. Outstanding: {{invoice.balance_due}}' }, branch: 'then' },
      { type: 'notify_user', config: { target: 'assignee', message: 'Invoice {{invoice.number}} is due in 2 days. Reminder sent to client.' }, branch: 'then' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 2, duration_unit: 'days' }, branch: 'then' },
      { type: 'update_invoice_status', config: { new_status: 'overdue' }, branch: 'else' }
    ],
    safety_rules: {
      prevent_duplicate_execution: true,
      run_once_per_record: false,
      stop_on_invoice_paid: true,
      stop_on_invoice_cancelled: true
    }
  },
  {
    id: 'overdue_invoice_reminder',
    name: 'Overdue Invoice Reminder',
    description: 'Triggered when an invoice becomes overdue. Sends controlled automated reminders, tracks partial payments, and escalates to management if ignored.',
    category: 'invoice',
    trigger_type: 'invoice_overdue',
    trigger_config: {},
    conditions: [
      { type: 'record', field: 'status', operator: 'not_equals', value: 'cancelled', logic: 'AND' },
      { type: 'record', field: 'balance_due', operator: 'greater_than', value: 0, logic: 'AND' }
    ],
    actions: [
      { type: 'send_invoice_email', config: { target: 'billing_email', message: 'Hi {{client.contact_name}},\n\nThis is a reminder regarding Invoice {{invoice.number}}, which is now overdue. It was due on {{invoice.due_date}}.\n\nOutstanding Amount: {{invoice.balance_due}}\n\nIf you have already paid, please share the reference with us.' }, branch: 'then' },
      { type: 'create_task', config: { title: 'Follow up overdue Invoice {{invoice.number}} — {{client.name}}', due_days: 2, priority: 'high' }, branch: 'then' },
      { type: 'notify_accounts', config: { message: 'Invoice {{invoice.number}} is now OVERDUE. Outstanding: {{invoice.balance_due}}. First reminder sent.' }, branch: 'then' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 3, duration_unit: 'days' }, branch: 'then' },
      { type: 'send_invoice_email', config: { target: 'billing_email', message: 'Hi {{client.contact_name}},\n\nThis is a follow-up regarding Invoice {{invoice.number}}, which remains outstanding.\n\nOutstanding Amount: {{invoice.balance_due}}\n\nPlease let us know when we can expect payment.' }, branch: 'then' },
      { type: 'wait', config: { duration_type: 'custom', duration_value: 3, duration_unit: 'days' }, branch: 'then' },
      { type: 'notify_user', config: { target: 'workspace_owner', message: 'ESCALATION: Invoice {{invoice.number}} is 7 days overdue ({{invoice.balance_due}}). Manual collection required.' }, branch: 'else' },
      { type: 'update_task_status', config: { priority: 'urgent' }, branch: 'else' }
    ],
    safety_rules: {
      prevent_duplicate_execution: true,
      run_once_per_record: true,
      stop_on_invoice_paid: true,
      stop_on_invoice_cancelled: true
    }
  }
];
