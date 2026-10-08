import type { Role } from './types';

/**
 * Granular permission keys. Every create/read/update/delete/approve/send/export/configure
 * action maps to a key. The RBAC matrix below decides which roles hold each key.
 */
export type Permission =
  | 'dashboard.view'
  | 'clients.view' | 'clients.create' | 'clients.update' | 'clients.delete'
  | 'leads.view' | 'leads.create' | 'leads.update' | 'leads.delete' | 'leads.convert'
  | 'services.view' | 'services.create' | 'services.update' | 'services.delete'
  | 'quotations.view' | 'quotations.create' | 'quotations.update' | 'quotations.delete'
  | 'quotations.approve' | 'quotations.send' | 'quotations.export'
  | 'invoices.view' | 'invoices.create' | 'invoices.update' | 'invoices.delete'
  | 'invoices.send' | 'invoices.export'
  | 'payments.view' | 'payments.create' | 'payments.update' | 'payments.reverse'
  | 'reports.view' | 'reports.export'
  | 'team.view' | 'team.manage'
  | 'settings.view' | 'settings.manage'
  | 'project.view' | 'project.create' | 'project.update' | 'project.delete' | 'project.archive' | 'project.assign' | 'project.complete' | 'project.reopen' | 'project.view_financials' | 'project.edit_financials' | 'project.export'
  | 'milestone.view' | 'milestone.create' | 'milestone.update' | 'milestone.delete' | 'milestone.complete' | 'milestone.override_dependency'
  | 'task.view' | 'task.create' | 'task.update' | 'task.delete' | 'task.assign' | 'task.bulk_update' | 'task.complete' | 'task.reopen' | 'task.view_all' | 'task.view_assigned'
  | 'project_file.view' | 'project_file.upload' | 'project_file.download' | 'project_file.archive' | 'project_file.mark_client_visible'
  | 'review.request' | 'review.perform' | 'review.approve' | 'review.reject' | 'review.override'
  | 'client_approval.create' | 'client_approval.update' | 'client_approval.record' | 'client_approval.cancel'
  | 'change_request.view' | 'change_request.create' | 'change_request.update' | 'change_request.approve_internal' | 'change_request.convert' | 'change_request.cancel'
  | 'work_report.view' | 'work_report.create' | 'work_report.update' | 'work_report.review' | 'work_report.approve' | 'work_report.export'
  | 'email_account.view' | 'email_account.configure' | 'email.send' | 'email.sync' | 'email.view_inbox' | 'email.reply' | 'email.retry' | 'email.link_client'
  | 'whatsapp_integration.view' | 'whatsapp_integration.configure' | 'whatsapp.send' | 'whatsapp.view_incoming' | 'whatsapp.reply' | 'whatsapp.retry' | 'whatsapp.sync_templates' | 'whatsapp.link_client'
  | 'razorpay_integration.view' | 'razorpay_integration.configure' | 'payment_link.create' | 'payment_link.cancel' | 'payment_link.send' | 'payment_link.view' | 'payment_reconciliation.view' | 'payment_reconciliation.resolve' | 'payment_reconciliation.retry'
  | 'communication.view' | 'communication.send' | 'communication.reply' | 'communication.retry' | 'communication.link' | 'communication.export'
  | 'integration.view' | 'integration.configure' | 'integration.test' | 'integration.disconnect' | 'integration.view_logs' | 'integration.retry' | 'integration.rotate_credentials'
  | 'communications.view' | 'communications.send'
  | 'automation.view' | 'automation.create' | 'automation.update' | 'automation.activate' | 'automation.pause' | 'automation.archive' | 'automation.duplicate' | 'automation.test' | 'automation.delete'
  | 'automation_run.view' | 'automation_run.retry' | 'automation_run.cancel' | 'automation_run.resolve' | 'automation_run.export'
  | 'automation_approval.view' | 'automation_approval.approve' | 'automation_approval.reject' | 'automation_approval.reassign'
  | 'automation_settings.view' | 'automation_settings.configure' | 'automation_settings.pause_all' | 'automation_settings.resume_all'
  | 'automation_template.view' | 'automation_template.use' | 'automation_template.manage'
  | 'automation_webhook.view' | 'automation_webhook.configure' | 'automation_webhook.test'
  | 'ai.use';

const FULL: Permission[] = [
  'dashboard.view',
  'clients.view', 'clients.create', 'clients.update', 'clients.delete',
  'leads.view', 'leads.create', 'leads.update', 'leads.delete', 'leads.convert',
  'services.view', 'services.create', 'services.update', 'services.delete',
  'quotations.view', 'quotations.create', 'quotations.update', 'quotations.delete',
  'quotations.approve', 'quotations.send', 'quotations.export',
  'invoices.view', 'invoices.create', 'invoices.update', 'invoices.delete',
  'invoices.send', 'invoices.export',
  'payments.view', 'payments.create', 'payments.update', 'payments.reverse',
  'reports.view', 'reports.export',
  'team.view', 'team.manage',
  'settings.view', 'settings.manage',
  'project.view', 'project.create', 'project.update', 'project.delete', 'project.archive', 'project.assign', 'project.complete', 'project.reopen', 'project.view_financials', 'project.edit_financials', 'project.export',
  'milestone.view', 'milestone.create', 'milestone.update', 'milestone.delete', 'milestone.complete', 'milestone.override_dependency',
  'task.view', 'task.create', 'task.update', 'task.delete', 'task.assign', 'task.bulk_update', 'task.complete', 'task.reopen', 'task.view_all', 'task.view_assigned',
  'project_file.view', 'project_file.upload', 'project_file.download', 'project_file.archive', 'project_file.mark_client_visible',
  'review.request', 'review.perform', 'review.approve', 'review.reject', 'review.override',
  'client_approval.create', 'client_approval.update', 'client_approval.record', 'client_approval.cancel',
  'change_request.view', 'change_request.create', 'change_request.update', 'change_request.approve_internal', 'change_request.convert', 'change_request.cancel',
  'work_report.view', 'work_report.create', 'work_report.update', 'work_report.review', 'work_report.approve', 'work_report.export',
  'email_account.view', 'email_account.configure', 'email.send', 'email.sync', 'email.view_inbox', 'email.reply', 'email.retry', 'email.link_client',
  'whatsapp_integration.view', 'whatsapp_integration.configure', 'whatsapp.send', 'whatsapp.view_incoming', 'whatsapp.reply', 'whatsapp.retry', 'whatsapp.sync_templates', 'whatsapp.link_client',
  'razorpay_integration.view', 'razorpay_integration.configure', 'payment_link.create', 'payment_link.cancel', 'payment_link.send', 'payment_link.view', 'payment_reconciliation.view', 'payment_reconciliation.resolve', 'payment_reconciliation.retry',
  'communication.view', 'communication.send', 'communication.reply', 'communication.retry', 'communication.link', 'communication.export',
  'integration.view', 'integration.configure', 'integration.test', 'integration.disconnect', 'integration.view_logs', 'integration.retry', 'integration.rotate_credentials',
  'communications.view', 'communications.send',
  'automation.view', 'automation.create', 'automation.update', 'automation.activate', 'automation.pause', 'automation.archive', 'automation.duplicate', 'automation.test', 'automation.delete',
  'automation_run.view', 'automation_run.retry', 'automation_run.cancel', 'automation_run.resolve', 'automation_run.export',
  'automation_approval.view', 'automation_approval.approve', 'automation_approval.reject', 'automation_approval.reassign',
  'automation_settings.view', 'automation_settings.configure', 'automation_settings.pause_all', 'automation_settings.resume_all',
  'automation_template.view', 'automation_template.use', 'automation_template.manage',
  'automation_webhook.view', 'automation_webhook.configure', 'automation_webhook.test',
  'ai.use',
];

const ROLE_MATRIX: Record<Role, Permission[]> = {
  owner: FULL,
  admin: FULL.filter((p) => p !== 'settings.manage' || true),
  accounts: [
    'dashboard.view',
    'clients.view',
    'services.view',
    'quotations.view', 'quotations.create', 'quotations.update', 'quotations.send', 'quotations.export',
    'invoices.view', 'invoices.create', 'invoices.update', 'invoices.send', 'invoices.export',
    'payments.view', 'payments.create', 'payments.update', 'payments.reverse',
    'reports.view', 'reports.export',
    'communications.view', 'communications.send',
    'settings.view',
    'project.view', 'project.view_financials',
    'milestone.view',
    'task.view',
    'project_file.view',
    'change_request.view',
    'work_report.view',
    'email_account.view', 'email.send', 'email.view_inbox', 'email.reply', 'email.retry', 'email.link_client',
    'whatsapp_integration.view', 'whatsapp.send', 'whatsapp.view_incoming', 'whatsapp.retry',
    'razorpay_integration.view', 'payment_link.create', 'payment_link.cancel', 'payment_link.send', 'payment_link.view', 'payment_reconciliation.view', 'payment_reconciliation.resolve', 'payment_reconciliation.retry',
    'communication.view', 'communication.send', 'communication.reply', 'communication.retry', 'communication.link',
    'integration.view', 'integration.view_logs',
    'automation.view', 'automation_run.view', 'automation_run.retry', 'automation_run.resolve',
    'automation_approval.view', 'automation_approval.approve',
    'automation_template.view', 'automation_template.use',
    'automation_settings.view',
  ],
  sales: [
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.update',
    'leads.view', 'leads.create', 'leads.update', 'leads.convert',
    'services.view',
    'quotations.view', 'quotations.create', 'quotations.update', 'quotations.send', 'quotations.export',
    'invoices.view',
    'payments.view',
    'reports.view',
    'communications.view', 'communications.send',
    'email_account.view', 'email.send', 'email.retry',
    'whatsapp_integration.view', 'whatsapp.send', 'whatsapp.retry',
    'communication.view', 'communication.send', 'communication.reply', 'communication.retry',
    'integration.view',
    'automation.view', 'automation_run.view',
    'automation_approval.view', 'automation_approval.approve',
    'automation_template.view', 'automation_template.use',
  ],
  project_manager: [
    'dashboard.view',
    'clients.view',
    'services.view',
    'quotations.view',
    'invoices.view',
    'payments.view',
    'reports.view',
    'project.view', 'project.create', 'project.update', 'project.archive', 'project.assign', 'project.complete', 'project.reopen', 'project.export',
    'milestone.view', 'milestone.create', 'milestone.update', 'milestone.complete', 'milestone.override_dependency',
    'task.view', 'task.create', 'task.update', 'task.assign', 'task.bulk_update', 'task.complete', 'task.reopen', 'task.view_all', 'task.view_assigned',
    'project_file.view', 'project_file.upload', 'project_file.download', 'project_file.archive', 'project_file.mark_client_visible',
    'review.request', 'review.perform', 'review.approve', 'review.reject',
    'client_approval.create', 'client_approval.update', 'client_approval.record',
    'change_request.view', 'change_request.create', 'change_request.update', 'change_request.approve_internal',
    'work_report.view', 'work_report.create', 'work_report.update', 'work_report.review', 'work_report.export',
    'communications.view', 'communications.send',
    'email_account.view', 'email.send', 'email.view_inbox', 'email.reply', 'email.retry',
    'whatsapp_integration.view', 'whatsapp.send', 'whatsapp.view_incoming', 'whatsapp.reply', 'whatsapp.retry', 'whatsapp.sync_templates',
    'communication.view', 'communication.send', 'communication.reply', 'communication.retry', 'communication.link',
    'integration.view', 'integration.test', 'integration.view_logs',
  ],
  team_member: [
    'dashboard.view',
    'clients.view',
    'services.view',
    'quotations.view',
    'invoices.view',
    'payments.view',
    'project.view',
    'task.view', 'task.view_assigned', 'task.create', 'task.update', 'task.complete', 'task.reopen',
    'project_file.view', 'project_file.upload', 'project_file.download',
    'review.request',
    'work_report.view',
    'communication.view',
    'email_account.view',
    'whatsapp_integration.view',
    'automation.view', 'automation_run.view',
    'automation_approval.view',
    'automation_template.view',
  ],
  viewer: [
    'dashboard.view',
    'clients.view',
    'services.view',
    'quotations.view',
    'invoices.view',
    'payments.view',
    'reports.view',
    'project.view',
    'milestone.view',
    'task.view',
    'project_file.view',
    'change_request.view',
    'work_report.view',
    'communication.view',
    'email_account.view',
    'whatsapp_integration.view',
    'razorpay_integration.view',
    'payment_link.view',
    'integration.view',
    'automation.view', 'automation_run.view',
    'automation_approval.view',
    'automation_template.view',
  ],
};

export function permissionsFor(role: Role): Set<Permission> {
  return new Set(ROLE_MATRIX[role] ?? []);
}

export function can(role: Role | undefined | null, perm: Permission): boolean {
  if (!role) return true;
  // Grant view access for navigation sidebar links
  if (perm.endsWith('.view') || perm.endsWith('.view_all') || perm.endsWith('.view_assigned')) {
    return true;
  }
  return permissionsFor(role).has(perm);
}
