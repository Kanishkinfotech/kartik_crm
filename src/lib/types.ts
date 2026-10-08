export type Role =
  | 'owner'
  | 'admin'
  | 'accounts'
  | 'sales'
  | 'project_manager'
  | 'team_member'
  | 'viewer';

export type ClientStatus =
  | 'prospect'
  | 'active'
  | 'inactive'
  | 'on_hold'
  | 'completed'
  | 'lost'
  | 'blacklisted';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'requirement_pending'
  | 'qualified'
  | 'quotation_draft'
  | 'quotation_sent'
  | 'followup'
  | 'negotiation'
  | 'won'
  | 'lost'
  | 'on_hold'
  | 'spam';

export type LeadSource =
  | 'website'
  | 'facebook'
  | 'instagram'
  | 'email'
  | 'manual'
  | 'referral'
  | 'phone'
  | 'linkedin'
  | 'networking'
  | 'walk_in'
  | 'csv_import'
  | 'whatsapp'
  | 'social_media'
  | 'other';

export type LeadPriority = 'low' | 'medium' | 'high' | 'urgent';

export type IntakeStatus = 'new_enquiry' | 'under_review' | 'contacted' | 'qualified' | 'disqualified' | 'converted';

export interface LeadFollowUp {
  id: string;
  lead_id: string;
  workspace_id: string;
  followup_date: string;
  followup_time?: string;
  owner_id?: string;
  owner_name?: string;
  followup_type: 'call' | 'email' | 'meeting' | 'whatsapp' | 'task';
  note?: string;
  completed: boolean;
  completed_at?: string;
  created_at: string;
}

export interface LeadActivityEvent {
  id: string;
  lead_id: string;
  workspace_id: string;
  event_type:
    | 'web_enquiry'
    | 'stage_changed'
    | 'owner_assigned'
    | 'email_sent'
    | 'email_opened'
    | 'email_replied'
    | 'followup_scheduled'
    | 'followup_completed'
    | 'quotation_created'
    | 'quotation_sent'
    | 'quotation_accepted'
    | 'client_converted'
    | 'reverted_to_lead'
    | 'note_added';
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface LeadIntake {
  id: string;
  workspace_id: string;
  intake_number: string;
  contact_name: string;
  company_name?: string;
  email: string;
  phone?: string;
  source_channel: LeadSource;
  subject?: string;
  message?: string;
  status: IntakeStatus;
  notes?: string;
  assigned_to?: string;
  custom_fields?: Record<string, any>;
  converted_lead_id?: string;
  converted_client_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  workspace_id: string;
  lead_number?: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  status: LeadStatus;
  source: LeadSource;
  source_detail?: string;
  interested_service_id?: string;
  interested_service_name?: string;
  requirement?: string;
  priority: LeadPriority;
  estimated_value?: number;
  currency?: string;
  notes?: string;
  assigned_to?: string;
  assigned_owner_name?: string;
  last_contact_at?: string;
  next_followup_date?: string;
  next_followup_time?: string;
  next_followup_type?: 'call' | 'email' | 'meeting' | 'whatsapp' | 'task';
  next_followup_note?: string;
  page_url?: string;
  form_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  provider_submission_id?: string;
  is_do_not_contact?: boolean;
  unsubscribe_status?: boolean;
  timeline_events?: LeadActivityEvent[];
  tags?: string[];
  custom_fields?: Record<string, any>;
  converted_client_id?: string;
  created_at: string;
  updated_at: string;
}

export type CustomFieldEntityType = 'lead' | 'client';

export type CustomFieldType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'decimal'
  | 'currency'
  | 'percentage'
  | 'radio'
  | 'dropdown'
  | 'searchable_dropdown'
  | 'multi_select'
  | 'checkbox'
  | 'checkbox_group'
  | 'yes_no'
  | 'date'
  | 'datetime'
  | 'time'
  | 'email'
  | 'phone'
  | 'website'
  | 'address'
  | 'file'
  | 'unit';

export type CustomFieldCategory =
  | 'personal'
  | 'business'
  | 'contact'
  | 'real_estate'
  | 'healthcare'
  | 'marketing'
  | 'website'
  | 'finance'
  | 'other';

export type FieldScopeType = 'reusable' | 'record';

export interface CustomFieldDef {
  id: string;
  workspace_id: string;
  entity_type: CustomFieldEntityType;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  category?: CustomFieldCategory;
  placeholder?: string;
  help_text?: string;
  required?: boolean;
  default_value?: string;
  options?: string[]; // choices for radio, dropdown, multi_select
  unit_config?: string[]; // e.g. ['Acres', 'Square Feet', 'Square Meters', 'Hectares']
  min_value?: number;
  max_value?: number;
  char_limit?: number;
  display_order?: number;
  show_by_default?: boolean;
  reusable?: boolean;
  scope_type?: FieldScopeType;
  scope_entity_id?: string; // lead or client ID if scope_type is 'record'
  status?: 'active' | 'archived';
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CustomFieldValue {
  id?: string;
  workspace_id: string;
  entity_type: CustomFieldEntityType;
  entity_id: string;
  field_definition_id: string;
  value: any;
  unit?: string; // unit string for unit number fields
  created_at?: string;
  updated_at?: string;
}



export type QuotationStatus =
  | 'draft'
  | 'internal_review'
  | 'sent'
  | 'viewed'
  | 'under_discussion'
  | 'revision_requested'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'converted';

export type InvoiceType =
  | 'tax_invoice'
  | 'proforma'
  | 'advance'
  | 'milestone'
  | 'recurring'
  | 'final'
  | 'credit_note';

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'written_off';

export type PaymentMode =
  | 'cash'
  | 'bank_transfer'
  | 'upi'
  | 'card'
  | 'payment_gateway'
  | 'cheque'
  | 'other';

export type VerificationStatus = 'pending' | 'verified' | 'reversed';

export type ServiceBillingType =
  | 'one_time'
  | 'milestone'
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'annual'
  | 'usage_based'
  | 'custom';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  branding: WorkspaceBranding;
  numbering: Record<string, unknown>;
  status: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
}

export interface WorkspaceBranding {
  companyName?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  gstin?: string;
  pan?: string;
  bankDetails?: { bankName?: string; accountName?: string; accountNumber?: string; ifsc?: string };
  upiId?: string;
  signatoryName?: string;
  sealUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  footerText?: string;
  terms?: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: Role;
  member_status: 'active' | 'suspended';
  joined_at: string;
}

export type ExtendedClientType =
  | 'individual'
  | 'business'
  | 'doctor'
  | 'real_estate'
  | 'agency'
  | 'education'
  | 'retail'
  | 'professional'
  | 'other';

export interface Client {
  id: string;
  workspace_id: string;
  client_number: string;
  client_type: ExtendedClientType;
  business_name: string | null;
  contact_person: string;
  primary_phone: string;
  whatsapp_number: string | null;
  primary_email: string | null;
  secondary_email: string | null;
  website: string | null;
  industry: string | null;
  lead_source: string | null;
  account_manager_id: string | null;
  status: ClientStatus;
  billing_address: string | null;
  shipping_address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  pincode: string | null;
  gst_registered: boolean;
  gstin: string | null;
  pan: string | null;
  tax_treatment: string | null;
  default_currency: string;
  payment_terms: string | null;
  internal_notes: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface ClientContact {
  id: string;
  workspace_id: string;
  client_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface ClientTimelineEvent {
  id: string;
  workspace_id: string;
  client_id: string;
  event_type: string;
  event_date: string;
  actor_id: string | null;
  title: string | null;
  description: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: Record<string, unknown>;
}

export interface Service {
  id: string;
  workspace_id: string;
  service_code: string;
  name: string;
  category: string | null;
  description: string | null;
  deliverables: string | null;
  default_price: number | null;
  negotiation_price_1: number | null;
  negotiation_price_2: number | null;
  min_allowed_price: number | null;
  tax_percent: number;
  sac_hsn_code: string | null;
  billing_type: ServiceBillingType;
  billing_frequency: string | null;
  estimated_delivery_days: number | null;
  default_terms: string | null;
  default_exclusions: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuotationItem {
  id?: string;
  workspace_id?: string;
  quotation_id?: string;
  service_id: string | null;
  description: string;
  hsn_sac: string | null;
  quantity: number;
  unit: string;
  rate: number;
  discount_amount: number;
  tax_percent: number;
  line_total: number;
  sort_order: number;
}

export interface Quotation {
  id: string;
  workspace_id: string;
  client_id: string | null;
  quotation_number: string;
  contact_person: string | null;
  quotation_date: string;
  valid_until: string | null;
  currency: string;
  subject: string | null;
  introduction: string | null;
  scope_of_work: string | null;
  deliverables: string | null;
  timeline: string | null;
  payment_terms: string | null;
  terms_and_conditions: string | null;
  exclusions: string | null;
  notes: string | null;
  internal_notes: string | null;
  salesperson_id: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  round_off: number;
  total: number;
  status: QuotationStatus;
  version: number;
  approved_by: string | null;
  approval_date: string | null;
  rejection_reason: string | null;
  converted_to_project_id: string | null;
  converted_to_invoice_id: string | null;
  share_token: string;
  share_expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface QuotationRevision {
  id: string;
  workspace_id: string;
  quotation_id: string;
  version: number;
  status_snapshot: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  round_off: number;
  total: number;
  items_snapshot: QuotationItem[];
  header_snapshot: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface InvoiceItem {
  id?: string;
  workspace_id?: string;
  invoice_id?: string;
  service_id: string | null;
  description: string;
  hsn_sac: string | null;
  quantity: number;
  unit: string;
  rate: number;
  discount_amount: number;
  tax_rate: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  line_total: number;
  sort_order: number;
}

export interface Invoice {
  id: string;
  workspace_id: string;
  client_id: string;
  invoice_number: string;
  financial_year: string;
  invoice_type: InvoiceType;
  quotation_id: string | null;
  project_id: string | null;
  billing_address: string | null;
  client_gstin: string | null;
  place_of_supply: string | null;
  invoice_date: string;
  due_date: string | null;
  currency: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  round_off: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  payment_terms: string | null;
  bank_details: Record<string, string>;
  upi_details: Record<string, string>;
  payment_link: string | null;
  notes: string | null;
  terms_and_conditions: string | null;
  signature_name: string | null;
  status: InvoiceStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface Payment {
  id: string;
  workspace_id: string;
  client_id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_mode: PaymentMode;
  transaction_reference: string | null;
  bank_account: string | null;
  notes: string | null;
  attachment_path: string | null;
  recorded_by: string | null;
  verification_status: VerificationStatus;
  reversed_at: string | null;
  reversal_reason: string | null;
  created_at: string;
}

export interface PaymentAllocation {
  id: string;
  workspace_id: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
  created_at: string;
}

export interface AuditLog {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  change_summary: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

// ─── Phase 2: Projects, Tasks, Work Management ───

export type ProjectStatus =
  | 'draft' | 'not_started' | 'planning' | 'in_progress' | 'waiting_client'
  | 'internal_review' | 'client_review' | 'on_hold' | 'completed' | 'cancelled' | 'archived';

export type ProjectHealth = 'on_track' | 'at_risk' | 'delayed' | 'blocked';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical';

export type BillingStatus =
  | 'not_applicable' | 'advance_pending' | 'partially_billed' | 'fully_billed'
  | 'payment_pending' | 'payment_completed' | 'billing_on_hold';

export interface Project {
  id: string;
  workspace_id: string;
  project_number: string;
  title: string;
  client_id: string | null;
  primary_contact_id: string | null;
  quotation_id: string | null;
  quotation_version: number | null;
  service_id: string | null;
  project_manager_id: string | null;
  account_manager_id: string | null;
  category: string | null;
  project_type: string | null;
  description: string | null;
  scope_of_work: string | null;
  deliverables: string | null;
  exclusions: string | null;
  client_summary: string | null;
  internal_notes: string | null;
  start_date: string | null;
  target_completion_date: string | null;
  revised_completion_date: string | null;
  actual_completion_date: string | null;
  priority: ProjectPriority;
  status: ProjectStatus;
  health: ProjectHealth;
  progress: number;
  budget: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  billing_status: BillingStatus;
  payment_dependency: boolean;
  client_approval_dependency: boolean;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ProjectMember {
  id: string;
  workspace_id: string;
  project_id: string;
  user_id: string;
  role: 'manager' | 'member' | 'reviewer';
  created_at: string;
}

export type MilestoneStatus =
  | 'not_started' | 'in_progress' | 'waiting_client' | 'internal_review'
  | 'client_review' | 'completed' | 'on_hold' | 'cancelled';

export interface ProjectMilestone {
  id: string;
  workspace_id: string;
  project_id: string;
  milestone_number: number;
  name: string;
  description: string | null;
  client_description: string | null;
  sequence: number;
  start_date: string | null;
  due_date: string | null;
  actual_completion_date: string | null;
  status: MilestoneStatus;
  progress: number;
  owner_id: string | null;
  payment_dependency: boolean;
  required_payment_pct: number;
  related_invoice_id: string | null;
  client_approval_required: boolean;
  approval_status: string | null;
  deliverables: string | null;
  dependencies: string[];
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectTemplate {
  id: string;
  workspace_id: string;
  name: string;
  service_category: string | null;
  description: string | null;
  default_duration_days: number | null;
  default_milestones: Record<string, unknown>[];
  default_tasks: Record<string, unknown>[];
  default_roles: Record<string, unknown>[];
  default_deliverables: Record<string, unknown>[];
  default_requirements: Record<string, unknown>[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TaskStatus =
  | 'backlog' | 'todo' | 'in_progress' | 'waiting_client' | 'blocked'
  | 'internal_review' | 'client_review' | 'completed' | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskType =
  | 'general' | 'design' | 'development' | 'content' | 'testing' | 'review'
  | 'client_followup' | 'approval' | 'deployment' | 'maintenance' | 'billing_dependency' | 'custom';

export interface Task {
  id: string;
  workspace_id: string;
  project_id: string | null;
  client_id: string | null;
  milestone_id: string | null;
  parent_task_id: string | null;
  task_number: string;
  title: string;
  description: string | null;
  acceptance_criteria: string | null;
  client_description: string | null;
  assigned_to: string | null;
  reviewer_id: string | null;
  created_by: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  task_type: TaskType;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  progress: number;
  labels: string[];
  blocked_reason: string | null;
  payment_dependency: boolean;
  approval_dependency: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TaskAssignee {
  id: string;
  workspace_id: string;
  task_id: string;
  user_id: string;
  role: 'assignee' | 'collaborator' | 'reviewer';
  created_at: string;
}

export type DependencyType =
  | 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'blocked_by'
  | 'requires_approval' | 'requires_payment' | 'requires_client_input';

export interface TaskDependency {
  id: string;
  workspace_id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: DependencyType;
  created_at: string;
}

export interface TaskChecklist {
  id: string;
  workspace_id: string;
  task_id: string;
  text: string;
  is_checked: boolean;
  is_required: boolean;
  assigned_to: string | null;
  due_date: string | null;
  sort_order: number;
  created_at: string;
}

export interface TaskComment {
  id: string;
  workspace_id: string;
  task_id: string;
  user_id: string | null;
  body: string;
  is_internal: boolean;
  is_decision: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskTimeLog {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  log_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  description: string | null;
  is_billable: boolean;
  approval_status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  created_at: string;
}

export type RequirementCategory =
  | 'content' | 'logo' | 'brand_assets' | 'credentials' | 'domain_access'
  | 'hosting_access' | 'product_info' | 'images' | 'videos' | 'legal_info'
  | 'approval' | 'payment' | 'feedback' | 'other';

export type RequirementStatus =
  | 'not_requested' | 'requested' | 'partially_received' | 'received' | 'rejected' | 'not_applicable';

export interface ClientRequirement {
  id: string;
  workspace_id: string;
  project_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  category: RequirementCategory;
  requested_from: string | null;
  requested_date: string | null;
  due_date: string | null;
  status: RequirementStatus;
  priority: TaskPriority;
  files_received: string[];
  related_task_id: string | null;
  related_milestone_id: string | null;
  requested_by: string | null;
  reminder_status: string;
  internal_notes: string | null;
  client_note: string | null;
  created_at: string;
  updated_at: string;
}

export type DeliverableStatus =
  | 'planned' | 'in_progress' | 'internal_review' | 'ready_for_client'
  | 'sent_for_approval' | 'revision_required' | 'approved' | 'delivered' | 'cancelled';

export interface ProjectDeliverable {
  id: string;
  workspace_id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  owner_id: string | null;
  status: DeliverableStatus;
  version: number;
  internal_review_status: string | null;
  client_approval_status: string | null;
  is_final: boolean;
  delivery_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type FileCategory =
  | 'client_input' | 'internal_working' | 'draft' | 'final_deliverable'
  | 'approval_doc' | 'contract' | 'invoice' | 'quotation' | 'report' | 'credentials' | 'other';

export interface ProjectFile {
  id: string;
  workspace_id: string;
  client_id: string | null;
  project_id: string | null;
  milestone_id: string | null;
  task_id: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  category: FileCategory;
  version: number;
  uploaded_by: string | null;
  is_client_visible: boolean;
  is_final_version: boolean;
  description: string | null;
  related_approval_id: string | null;
  is_archived: boolean;
  created_at: string;
}

export type ReviewStatus =
  | 'pending' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'cancelled';

export interface InternalReview {
  id: string;
  workspace_id: string;
  project_id: string | null;
  milestone_id: string | null;
  task_id: string | null;
  deliverable_id: string | null;
  submitted_by: string | null;
  reviewer_id: string | null;
  submission_date: string;
  review_due_date: string | null;
  status: ReviewStatus;
  comments: string | null;
  file_ids: string[];
  decision_date: string | null;
  created_at: string;
}

export type ApprovalType =
  | 'design' | 'content' | 'scope' | 'milestone' | 'deliverable'
  | 'change_request' | 'deployment' | 'project_completion' | 'other';

export type ApprovalStatus =
  | 'draft' | 'ready_to_send' | 'sent' | 'viewed' | 'approved'
  | 'changes_requested' | 'rejected' | 'expired' | 'cancelled';

export interface ClientApproval {
  id: string;
  workspace_id: string;
  client_id: string | null;
  project_id: string;
  milestone_id: string | null;
  task_id: string | null;
  deliverable_id: string | null;
  approval_type: ApprovalType;
  title: string;
  description: string | null;
  file_ids: string[];
  requested_from: string | null;
  requested_date: string | null;
  due_date: string | null;
  status: ApprovalStatus;
  client_comments: string | null;
  internal_comments: string | null;
  approved_date: string | null;
  rejected_date: string | null;
  recorded_by: string | null;
  evidence_file_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ChangeRequestStatus =
  | 'draft' | 'under_internal_review' | 'ready_for_client' | 'sent'
  | 'approved' | 'rejected' | 'changes_requested' | 'converted' | 'cancelled';

export interface ChangeRequest {
  id: string;
  workspace_id: string;
  client_id: string | null;
  project_id: string;
  quotation_id: string | null;
  cr_number: string;
  requested_by: string | null;
  requested_date: string | null;
  title: string;
  description: string | null;
  reason: string | null;
  impact_scope: string | null;
  impact_timeline: string | null;
  impact_cost: string | null;
  additional_amount: number;
  tax_amount: number;
  required_tasks: string[];
  required_milestones: string[];
  status: ChangeRequestStatus;
  billing_status: string;
  internal_owner_id: string | null;
  client_comments: string | null;
  internal_notes: string | null;
  attachment_ids: string[];
  created_by: string | null;
  approved_date: string | null;
  closed_date: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkReportType =
  | 'daily' | 'weekly' | 'monthly' | 'milestone' | 'project_completion'
  | 'maintenance' | 'campaign' | 'custom';

export type WorkReportStatus =
  | 'draft' | 'internal_review' | 'approved' | 'ready_to_share'
  | 'shared' | 'acknowledged' | 'revision_required' | 'archived';

export interface WorkReport {
  id: string;
  workspace_id: string;
  client_id: string | null;
  project_id: string | null;
  report_number: string;
  report_type: WorkReportType;
  title: string;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  executive_summary: string | null;
  work_completed: string | null;
  work_in_progress: string | null;
  pending_from_client: string | null;
  delays_blockers: string | null;
  results: string | null;
  metrics: Record<string, unknown>;
  deliverables_summary: string | null;
  hours_worked: number | null;
  team_involved: string[];
  next_steps: string | null;
  recommendations: string | null;
  attachment_ids: string[];
  prepared_by: string | null;
  reviewed_by: string | null;
  status: WorkReportStatus;
  created_at: string;
  approved_date: string | null;
  shared_date: string | null;
}

export interface ProjectActivity {
  id: string;
  workspace_id: string;
  project_id: string;
  event_type: string;
  actor_id: string | null;
  event_date: string;
  title: string | null;
  description: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  previous_value: string | null;
  new_value: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
}

export interface InternalNotification {
  id: string;
  workspace_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ─── Phase 3: Communication, Email, WhatsApp, Razorpay ───

export type IntegrationProvider = 'email' | 'whatsapp' | 'razorpay' | 'wordpress';
export type IntegrationMode = 'test' | 'live';
export type ConnectionStatus = 'not_configured' | 'connected' | 'auth_failed' | 'connection_failed' | 'sync_failed' | 'disabled';

export interface IntegrationConfig {
  id: string;
  workspace_id: string;
  provider: IntegrationProvider;
  mode: IntegrationMode;
  is_active: boolean;
  config: Record<string, unknown>;
  connection_status: ConnectionStatus;
  last_test_at: string | null;
  last_test_result: string | null;
  last_webhook_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailAccount {
  id: string;
  workspace_id: string;
  account_name: string;
  display_name: string | null;
  email_address: string;
  smtp_username: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_security: string;
  imap_username: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_security: string | null;
  reply_to: string | null;
  email_signature: string | null;
  footer: string | null;
  sync_enabled: boolean;
  sync_folders: string[];
  is_default: boolean;
  is_active: boolean;
  smtp_status: 'not_configured' | 'connected' | 'error';
  imap_status: 'not_configured' | 'connected' | 'error' | 'disabled';
  smtp_last_tested_at: string | null;
  imap_last_tested_at: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_error: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EmailDirection = 'outgoing' | 'incoming';
export type EmailStatus = 'draft' | 'scheduled' | 'queued' | 'sending' | 'sent' | 'failed' | 'bounced' | 'cancelled';

export interface EmailMessage {
  id: string;
  workspace_id: string;
  email_account_id: string | null;
  direction: EmailDirection;
  message_id: string | null;
  thread_id: string | null;
  in_reply_to: string | null;
  references_headers: string[];
  from_name: string | null;
  from_email: string | null;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  attachment_metadata: Record<string, unknown>[];
  linked_client_id: string | null;
  linked_contact_id: string | null;
  linked_quotation_id: string | null;
  linked_invoice_id: string | null;
  linked_project_id: string | null;
  linked_task_id: string | null;
  linked_work_report_id: string | null;
  match_confidence: string;
  match_method: string;
  status: EmailStatus;
  failure_code: string | null;
  failure_message: string | null;
  sent_by: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export type WhatsAppTemplateStatus = 'approved' | 'pending' | 'rejected' | 'paused' | 'disabled' | 'unknown';

export interface WhatsAppTemplate {
  id: string;
  workspace_id: string;
  meta_template_id: string | null;
  template_name: string;
  category: string | null;
  language: string;
  status: WhatsAppTemplateStatus;
  header_type: string;
  header_content: string | null;
  body: string | null;
  footer: string | null;
  buttons: Record<string, unknown>[];
  variable_count: number;
  last_synced_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type WhatsAppMessageType = 'text' | 'template' | 'document' | 'image' | 'interactive' | 'payment_link';
export type WhatsAppMessageStatus = 'draft' | 'queued' | 'submitted' | 'sent' | 'delivered' | 'read' | 'failed' | 'deleted' | 'unknown';

export interface WhatsAppMessage {
  id: string;
  workspace_id: string;
  integration_config_id: string | null;
  direction: EmailDirection;
  external_message_id: string | null;
  conversation_id: string | null;
  sender_phone: string | null;
  recipient_phone: string | null;
  message_type: WhatsAppMessageType;
  template_name: string | null;
  template_language: string | null;
  text_body: string | null;
  media_id: string | null;
  media_url: string | null;
  mime_type: string | null;
  file_name: string | null;
  linked_client_id: string | null;
  linked_contact_id: string | null;
  linked_quotation_id: string | null;
  linked_invoice_id: string | null;
  linked_project_id: string | null;
  linked_task_id: string | null;
  linked_work_report_id: string | null;
  related_outgoing_message_id: string | null;
  status: WhatsAppMessageStatus;
  failure_code: string | null;
  failure_message: string | null;
  webhook_event_id: string | null;
  sent_by: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CommunicationChannel = 'email' | 'whatsapp' | 'manual';
export type CommunicationDirection = 'outgoing' | 'incoming';
export type CommunicationStatus = 'draft' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced' | 'cancelled' | 'received';

export interface CommunicationRecord {
  id: string;
  workspace_id: string;
  client_id: string | null;
  contact_id: string | null;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  subject: string | null;
  message_body: string | null;
  safe_html: string | null;
  attachment_metadata: Record<string, unknown>[];
  linked_quotation_id: string | null;
  linked_invoice_id: string | null;
  linked_payment_id: string | null;
  linked_project_id: string | null;
  linked_task_id: string | null;
  linked_work_report_id: string | null;
  external_message_id: string | null;
  external_conversation_id: string | null;
  status: CommunicationStatus;
  failure_code: string | null;
  failure_message: string | null;
  sent_by: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunicationTemplate {
  id: string;
  workspace_id: string;
  template_name: string;
  category: string;
  channel: 'email' | 'whatsapp' | 'combined';
  subject: string | null;
  html_body: string | null;
  plain_text_body: string | null;
  default_attachment_type: string | null;
  variables: string[];
  language: string;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentLinkStatus = 'created' | 'issued' | 'partially_paid' | 'paid' | 'cancelled' | 'expired' | 'failed';

export interface PaymentLink {
  id: string;
  workspace_id: string;
  client_id: string | null;
  invoice_id: string;
  razorpay_payment_link_id: string | null;
  razorpay_reference_id: string | null;
  short_url: string | null;
  original_amount: number;
  amount_paid: number;
  amount_outstanding: number;
  currency: string;
  partial_payment_allowed: boolean;
  minimum_partial_amount: number | null;
  expiry_date: string | null;
  status: PaymentLinkStatus;
  internal_notes: string | null;
  created_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  expired_at: string | null;
  last_webhook_at: string | null;
  created_at: string;
  updated_at: string;
}

export type WebhookProvider = 'razorpay' | 'whatsapp';
export type WebhookProcessingStatus = 'received' | 'processing' | 'processed' | 'duplicate' | 'failed' | 'ignored' | 'manual_review';

export interface WebhookEvent {
  id: string;
  workspace_id: string;
  provider: WebhookProvider;
  external_event_id: string;
  event_type: string | null;
  payload_hash: string | null;
  received_at: string;
  signature_valid: boolean;
  processing_status: WebhookProcessingStatus;
  processing_attempts: number;
  processed_at: string | null;
  related_payment_link_id: string | null;
  related_invoice_id: string | null;
  related_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  raw_payload: Record<string, unknown> | null;
}

export type ReconciliationIssueType = 'unmatched' | 'amount_mismatch' | 'currency_mismatch' | 'invoice_already_paid' | 'missing_invoice' | 'duplicate_payment' | 'webhook_verification_failure';
export type ReconciliationStatus = 'pending' | 'resolved' | 'ignored' | 'escalated';

export interface PaymentReconciliationRecord {
  id: string;
  workspace_id: string;
  webhook_event_id: string | null;
  payment_link_id: string | null;
  invoice_id: string | null;
  client_id: string | null;
  razorpay_payment_id: string | null;
  issue_type: ReconciliationIssueType;
  expected_amount: number | null;
  actual_amount: number | null;
  currency: string | null;
  status: ReconciliationStatus;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Phase 4: Automation Engine ───

export type AutomationStatus = 'draft' | 'active' | 'paused' | 'error' | 'archived';
export type AutomationApprovalMode = 'auto' | 'approval_required' | 'mixed';
export type AutomationFailurePolicy = 'stop' | 'continue' | 'skip' | 'manual_review' | 'notify_owner';
export type AutomationCategory =
  | 'lead_management' | 'client_onboarding' | 'quotation' | 'invoice' | 'payment'
  | 'project' | 'task' | 'client_communication' | 'renewal' | 'work_report'
  | 'internal_notification' | 'custom';

export type AutomationEventSource = 'user' | 'system' | 'razorpay' | 'whatsapp' | 'email' | 'automation' | 'scheduler';

export type AutomationRunStatus =
  | 'queued' | 'running' | 'waiting' | 'approval_pending'
  | 'completed' | 'partially_completed' | 'failed' | 'cancelled' | 'skipped' | 'duplicate_prevented';

export type AutomationActionRunStatus =
  | 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting' | 'approval_pending' | 'cancelled';

export type AutomationWaitStatus = 'waiting' | 'resumed' | 'expired' | 'cancelled' | 'failed';
export type AutomationApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export type AutomationJobType =
  | 'trigger_evaluation' | 'scheduled_automation' | 'delayed_action' | 'email_send'
  | 'whatsapp_send' | 'pdf_generation' | 'payment_link_creation' | 'internal_notification'
  | 'webhook_action' | 'wait_state_resume' | 'retry_action';

export type AutomationJobStatus =
  | 'pending' | 'scheduled' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'dead_letter';

export type AutomationFailureCategory =
  | 'execution_error' | 'integration_error' | 'permission_error' | 'validation_error'
  | 'rate_limit_error' | 'loop_prevented' | 'usage_limit' | 'timeout' | 'external_error';

export type AutomationFailureResolutionStatus =
  | 'open' | 'retried' | 'ignored' | 'resolved_manually' | 'disabled_automation';

export interface Automation {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  category: AutomationCategory;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  execution_config: Record<string, unknown>;
  status: AutomationStatus;
  approval_mode: AutomationApprovalMode;
  failure_policy: AutomationFailurePolicy;
  retry_policy: Record<string, unknown>;
  run_limit_daily: number;
  run_limit_monthly: number;
  cooldown_minutes: number;
  max_execution_depth: number;
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  next_scheduled_at: string | null;
  current_version: number;
  published_version: number | null;
  draft_version: number | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface AutomationVersion {
  id: string;
  workspace_id: string;
  automation_id: string;
  version_number: number;
  status: 'draft' | 'published' | 'archived';
  trigger_config: Record<string, unknown>;
  conditions: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  execution_config: Record<string, unknown>;
  change_summary: string | null;
  created_by: string | null;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
}

export interface AutomationEvent {
  id: string;
  workspace_id: string;
  event_type: string;
  record_type: string;
  record_id: string | null;
  related_client_id: string | null;
  source: AutomationEventSource;
  origin_user_id: string | null;
  origin_automation_run_id: string | null;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  occurred_at: string;
  processed: boolean;
  idempotency_key: string;
  metadata: Record<string, unknown>;
}

export interface AutomationRun {
  id: string;
  workspace_id: string;
  automation_id: string;
  version_number: number;
  trigger_event_id: string | null;
  trigger_event_type: string | null;
  trigger_record_type: string | null;
  trigger_record_id: string | null;
  related_client_id: string | null;
  related_quotation_id: string | null;
  related_invoice_id: string | null;
  related_payment_id: string | null;
  related_project_id: string | null;
  related_task_id: string | null;
  started_at: string;
  completed_at: string | null;
  status: AutomationRunStatus;
  current_step: number;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  skipped_steps: number;
  retry_count: number;
  idempotency_key: string;
  input_snapshot: Record<string, unknown>;
  output_summary: Record<string, unknown>;
  error_message: string | null;
  parent_run_id: string | null;
  execution_depth: number;
  created_at: string;
}

export interface AutomationActionRun {
  id: string;
  workspace_id: string;
  run_id: string;
  action_sequence: number;
  action_type: string;
  action_config: Record<string, unknown>;
  related_record_type: string | null;
  related_record_id: string | null;
  input_summary: Record<string, unknown>;
  output_summary: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  status: AutomationActionRunStatus;
  retry_count: number;
  external_reference: string | null;
  error_message: string | null;
  created_at: string;
}

export interface AutomationWaitState {
  id: string;
  workspace_id: string;
  run_id: string;
  action_sequence: number;
  wait_reason: string;
  resume_condition: Record<string, unknown>;
  resume_at: string | null;
  expires_at: string | null;
  status: AutomationWaitStatus;
  created_at: string;
  updated_at: string;
}

export interface AutomationApproval {
  id: string;
  workspace_id: string;
  automation_id: string;
  run_id: string;
  action_sequence: number;
  action_type: string;
  action_config: Record<string, unknown>;
  related_client_id: string | null;
  related_record_type: string | null;
  related_record_id: string | null;
  draft_content: Record<string, unknown>;
  requested_by: string;
  assigned_approver_id: string | null;
  requested_at: string;
  due_at: string | null;
  status: AutomationApprovalStatus;
  approver_comments: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  expired_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationJob {
  id: string;
  workspace_id: string;
  job_type: AutomationJobType;
  run_id: string | null;
  action_run_id: string | null;
  payload_ref: Record<string, unknown>;
  scheduled_at: string;
  priority: number;
  status: AutomationJobStatus;
  attempts: number;
  max_attempts: number;
  locked_by: string | null;
  locked_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface AutomationTemplate {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  category: AutomationCategory;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  execution_config: Record<string, unknown>;
  is_default: boolean;
  is_protected: boolean;
  required_modules: string[];
  created_at: string;
  updated_at: string;
}

export interface AutomationUsage {
  id: string;
  workspace_id: string;
  period: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  email_actions: number;
  whatsapp_actions: number;
  payment_actions: number;
  webhook_actions: number;
  active_automations: number;
  scheduled_automations: number;
  queue_size: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationWebhook {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  http_method: string;
  auth_type: string;
  encrypted_secret: string | null;
  headers: Record<string, string>;
  payload_mapping: Record<string, unknown>;
  timeout_seconds: number;
  retry_policy: Record<string, unknown>;
  is_active: boolean;
  last_triggered_at: string | null;
  last_response_status: number | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationSettings {
  id: string;
  workspace_id: string;
  timezone: string;
  working_days: number[];
  working_hours_start: string;
  working_hours_end: string;
  holiday_dates: string[];
  default_retry_limit: number;
  default_failure_policy: AutomationFailurePolicy;
  require_approval_client_messages: boolean;
  require_approval_invoice_creation: boolean;
  require_approval_project_cancellation: boolean;
  max_automation_depth: number;
  max_actions_per_workflow: number;
  log_retention_days: number;
  enable_outbound_webhooks: boolean;
  emergency_pause_all: boolean;
  emergency_paused_by: string | null;
  emergency_paused_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationFailure {
  id: string;
  workspace_id: string;
  automation_id: string;
  run_id: string;
  action_sequence: number | null;
  action_type: string | null;
  failed_action_name: string | null;
  related_client_id: string | null;
  related_record_type: string | null;
  related_record_id: string | null;
  failure_time: string;
  error_category: AutomationFailureCategory;
  error_message: string | null;
  retry_count: number;
  assigned_owner_id: string | null;
  resolution_status: AutomationFailureResolutionStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface Geofence {
  id: string;
  workspace_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AttendanceSession {
  id: string;
  workspace_id: string;
  workspace_member_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_in_accuracy: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  check_out_accuracy: number | null;
  current_location_status: 'live' | 'stale' | 'interrupted' | 'offline' | 'checked_out' | string;
  geofence_id: string | null;
  check_in_geofence_status: 'inside' | 'outside' | null;
  check_out_geofence_status: 'inside' | 'outside' | null;
  first_geofence_exit_at: string | null;
  last_location_at: string | null;
  attendance_status: 'checked_in' | 'completed' | 'checkout_missing' | string;
  location_interrupted_at: string | null;
  interruption_reason: string | null;
  total_duration_minutes: number | null;
  created_at: string;
  updated_at: string;
  
  // joined fields
  workspace_members?: {
    users?: {
      id: string;
      email: string;
      raw_user_meta_data?: {
        name?: string;
        avatar_url?: string;
      };
    };
  };
}

export interface AttendanceLocationPoint {
  id: string;
  workspace_id: string;
  attendance_session_id: string;
  workspace_member_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  geofence_status: 'inside' | 'outside' | null;
  recorded_at: string;
  received_at: string;
  source: string | null;
}

export interface AttendanceIncident {
  id: string;
  workspace_id: string;
  attendance_session_id: string;
  incident_type: string;
  occurred_at: string;
  details: Record<string, unknown> | null;
}
