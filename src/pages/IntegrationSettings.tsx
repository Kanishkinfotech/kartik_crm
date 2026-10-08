import { describeDbError } from '@/lib/dbError';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import { addAuditLog } from '@/lib/data';
import type { IntegrationConfig, EmailAccount, WebhookEvent } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, type BadgeTone, Field, TextInput, TextArea, Select, Modal, ConfirmDialog } from '@/components/ui';
import { Mail, MessageCircle, CreditCard, Activity, Webhook, Plus, Save, TestTube, RefreshCw, Power, Trash2, Eye, EyeOff, Shield, Zap, Globe, Link, Copy, Check } from 'lucide-react';
import { formatDateTime, classNames } from '@/lib/format';
import { downloadWordPressPlugin } from '@/lib/downloadPlugin';
import { can } from '@/lib/permissions';

type Tab = 'email' | 'whatsapp' | 'razorpay' | 'wordpress' | 'health' | 'webhooks';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://gfvqxfcixamriayqzaxn.supabase.co').replace(/\/$/, '');
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callEdgeFunction(name: string, body: Record<string, unknown>, method = 'POST') {
  if (method === 'GET') {
    const { data, error } = await supabase.functions.invoke(name, { method: 'GET', body });
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return { data };
}

export function IntegrationSettings() {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(() => {
    return (localStorage.getItem('k1_integration_tab') as Tab) || 'email';
  });

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    localStorage.setItem('k1_integration_tab', newTab);
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configs, setConfigs] = useState<IntegrationConfig[]>([]);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [editingEmailAccount, setEditingEmailAccount] = useState<EmailAccount | null>(null);

  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [showRazorpayModal, setShowRazorpayModal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ provider: string; success: boolean; message: string } | null>(null);

  const canConfigure = can(role, 'integration.configure');
  const canView = can(role, 'integration.view');

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError(null);
    const ws = activeWorkspace.id;
    const [cfgRes, eaRes, weRes] = await Promise.all([
      supabase.from('integration_configs').select('*').eq('workspace_id', ws),
      supabase.from('email_accounts').select('*').eq('workspace_id', ws).order('created_at'),
      supabase.from('webhook_events').select('*').eq('workspace_id', ws).order('received_at', { ascending: false }).limit(50),
    ]);
    setConfigs((cfgRes.data ?? []) as IntegrationConfig[]);
    setEmailAccounts((eaRes.data ?? []) as EmailAccount[]);
    setWebhookEvents((weRes.data ?? []) as WebhookEvent[]);
    if (cfgRes.error) setError(describeDbError(cfgRes.error));
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const getConfig = (provider: string) => configs.find((c) => c.provider === provider);

  const testConnection = async (provider: string, action?: string, id?: string) => {
    if (!activeWorkspace) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await callEdgeFunction('test-integration', {
        workspace_id: activeWorkspace.id,
        provider,
        action,
        account_id: id
      });
      setTestResult({ provider, success: true, message: result?.data ? 'Connected successfully' : 'Test passed' });
    } catch (err) {
      setTestResult({ provider, success: false, message: err instanceof Error ? err.message : 'Test failed' });
    }
    setTesting(false);
    load();
  };

  const syncTemplates = async () => {
    if (!activeWorkspace) return;
    setTesting(true);
    try {
      await callEdgeFunction('sync-whatsapp-templates', { workspace_id: activeWorkspace.id }, 'GET');
      setTestResult({ provider: 'whatsapp', success: true, message: 'Templates synced' });
    } catch (err) {
      setTestResult({ provider: 'whatsapp', success: false, message: err instanceof Error ? err.message : 'Sync failed' });
    }
    setTesting(false);
  };

  if (!canView) return <ErrorState message="You don't have permission to view integration settings." />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const emailConfig = getConfig('email');
  const whatsappConfig = getConfig('whatsapp');
  const razorpayConfig = getConfig('razorpay');

  const TABS: { id: Tab; label: string; icon: typeof Mail }[] = [
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { id: 'wordpress', label: 'Website Forms', icon: Globe },
    { id: 'health', label: 'Health', icon: Activity },
    { id: 'webhooks', label: 'Webhook Logs', icon: Webhook },
  ];

  const handleDeleteEmail = async (id: string) => {
    if (!activeWorkspace) return;
    if (!confirm('Are you sure you want to delete this email account?')) return;
    await supabase.from('email_accounts').delete().eq('id', id);
    if (user) await addAuditLog(activeWorkspace.id, user.id, 'email_account', id, 'delete', { changeSummary: 'Deleted email account' });
    load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Integration Settings</h1>
          <p className="text-sm text-slate-500">Configure email, WhatsApp, and website form integrations.</p>
        </div>
        {canConfigure && (tab === 'email' && <Button size="sm" onClick={() => setShowEmailModal(true)}><Plus className="h-4 w-4" /> Add email account</Button>)}
      </div>

      <div className="flex items-center gap-6 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); localStorage.setItem('k1_integration_tab', t.id); }} className={classNames('flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors', tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {testResult && (
        <div className={classNames('rounded-lg px-3 py-2 text-sm', testResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
          {testResult.success ? '✓ ' : '✕ '}{testResult.message}
        </div>
      )}

      {tab === 'email' && <EmailTab accounts={emailAccounts} config={emailConfig} canConfigure={canConfigure} onAdd={() => { setEditingEmailAccount(null); setShowEmailModal(true); }} onEdit={(acct) => { setEditingEmailAccount(acct); setShowEmailModal(true); }} onTest={(action, id) => testConnection('email', action, id)} testing={testing} onDelete={handleDeleteEmail} />}
      {tab === 'whatsapp' && <WhatsAppTab config={whatsappConfig} canConfigure={canConfigure} onConfigure={() => setShowWhatsappModal(true)} onTest={() => testConnection('whatsapp')} testing={testing} onSyncTemplates={syncTemplates} />}
      {tab === 'wordpress' && <WordPressTab config={getConfig('wordpress')} canConfigure={canConfigure} workspaceId={activeWorkspace?.id ?? ''} userId={user?.id ?? ''} onRefresh={load} />}
      {tab === 'health' && <HealthTab configs={configs} emailAccounts={emailAccounts} onTest={testConnection} testing={testing} />}
      {tab === 'webhooks' && <WebhooksTab events={webhookEvents} />}

      {showEmailModal && <EmailAccountModal onClose={() => setShowEmailModal(false)} onCreated={load} wsId={activeWorkspace?.id ?? ''} userId={user?.id ?? ''} existingAccount={editingEmailAccount} />}
      {showWhatsappModal && <WhatsAppConfigModal onClose={() => setShowWhatsappModal(false)} onCreated={load} wsId={activeWorkspace?.id ?? ''} userId={user?.id ?? ''} existing={whatsappConfig} />}
      {showRazorpayModal && <RazorpayConfigModal onClose={() => setShowRazorpayModal(false)} onCreated={load} wsId={activeWorkspace?.id ?? ''} userId={user?.id ?? ''} existing={razorpayConfig} />}
    </div>
  );
}

// --- Email Tab ---
function EmailTab({ accounts, config, canConfigure, onAdd, onEdit, onTest, testing, onDelete }: {
  accounts: EmailAccount[]; config?: IntegrationConfig; canConfigure: boolean;
  onAdd: () => void; onEdit: (acct: EmailAccount) => void; onTest: (action: string, id: string) => void; testing: boolean; onDelete: (id: string) => void;
}) {
  const STATUS_TONE: Record<string, BadgeTone> = { connected: 'success', error: 'danger', disabled: 'neutral', not_configured: 'neutral' };
  
  let overallStatus = 'NOT CONFIGURED';
  let overallTone: BadgeTone = 'neutral';
  
  if (accounts.length > 0) {
    const active = accounts.filter(a => a.is_active);
    if (active.some(a => a.smtp_status === 'error' || (a.sync_enabled && a.imap_status === 'error'))) {
      overallStatus = 'ERROR';
      overallTone = 'danger';
    } else if (active.some(a => a.smtp_status === 'connected' && a.sync_enabled && a.imap_status === 'error')) {
      overallStatus = 'PARTIAL';
      overallTone = 'warning';
    } else if (active.some(a => a.smtp_status === 'connected')) {
      overallStatus = 'CONNECTED';
      overallTone = 'success';
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Email Integration</h3>
            <p className="mt-1 text-xs text-slate-500">Hostinger, Gmail, or Custom SMTP/IMAP for sending and receiving emails.</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={overallStatus} tone={overallTone} />
            {canConfigure && (
              <Button size="sm" onClick={onAdd}>
                <Plus className="h-4 w-4" /> Add Account
              </Button>
            )}
          </div>
        </div>
      </Card>

      {accounts.length === 0 ? (
        <EmptyState icon={<Mail className="h-10 w-10" />} title="No email accounts configured" description="Add an email account to send and receive emails directly from the CRM." action={canConfigure ? <Button onClick={onAdd}><Plus className="h-4 w-4" /> Add account</Button> : undefined} />
      ) : (
        <div className="space-y-3">
          {accounts.map((acct) => (
            <Card key={acct.id} className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{acct.account_name}</span>
                    {acct.is_default && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Default Sending</span>}
                  </div>
                  <div className="text-sm text-slate-500">{acct.email_address}</div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mt-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">SMTP:</span>
                        <StatusBadge status={acct.smtp_status ? acct.smtp_status.replace(/_/g, ' ') : 'not configured'} tone={acct.smtp_status ? STATUS_TONE[acct.smtp_status] ?? 'neutral' : 'neutral'} />
                      </div>
                      <div className="text-slate-400">Tested: {acct.smtp_last_tested_at ? formatDateTime(acct.smtp_last_tested_at) : 'Never'}</div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">IMAP:</span>
                        <StatusBadge status={acct.sync_enabled ? (acct.imap_status ? acct.imap_status.replace(/_/g, ' ') : 'not configured') : 'disabled'} tone={acct.sync_enabled ? STATUS_TONE[acct.imap_status || 'not_configured'] ?? 'neutral' : 'neutral'} />
                      </div>
                      <div className="text-slate-400">Tested: {acct.imap_last_tested_at ? formatDateTime(acct.imap_last_tested_at) : 'Never'}</div>
                    </div>
                  </div>
                  
                  {acct.last_error && (
                    <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      <span className="font-medium">Error:</span> {acct.last_error}
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col gap-2 min-w-[140px]">
                  <Button size="sm" variant="outline" onClick={() => onTest('test_smtp', acct.id)} disabled={testing}>
                    <TestTube className="h-4 w-4" /> {testing ? 'Testing...' : 'Test SMTP'}
                  </Button>
                  {acct.sync_enabled && (
                    <Button size="sm" variant="outline" onClick={() => onTest('test_imap', acct.id)} disabled={testing}>
                      <TestTube className="h-4 w-4" /> {testing ? 'Testing...' : 'Test IMAP'}
                    </Button>
                  )}
                  {canConfigure && (
                    <div className="flex gap-2 mt-1">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(acct)}>Edit</Button>
                      <button onClick={() => onDelete(acct.id)} className="rounded-md border border-rose-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ΓöÇΓöÇΓöÇ WhatsApp Tab ΓöÇΓöÇΓöÇ
function WhatsAppTab({ config, canConfigure, onConfigure, onTest, testing, onSyncTemplates }: {
  config?: IntegrationConfig; canConfigure: boolean; onConfigure: () => void; onTest: () => void; testing: boolean; onSyncTemplates: () => void;
}) {
  const STATUS_TONE: Record<string, BadgeTone> = { connected: 'success', auth_failed: 'danger', connection_failed: 'danger', sync_failed: 'warning', disabled: 'neutral', not_configured: 'neutral' };
  const cfg = config?.config as Record<string, unknown> | undefined;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">WhatsApp Business API</h3>
            <p className="mt-1 text-xs text-slate-500">Official Meta WhatsApp Business API integration.</p>
          </div>
          <div className="flex items-center gap-2">
            {config && <StatusBadge status={config.connection_status.replace(/_/g, ' ')} tone={STATUS_TONE[config.connection_status] ?? 'neutral'} />}
            {config?.is_active && <Button size="sm" variant="outline" onClick={onTest} disabled={testing}><TestTube className="h-4 w-4" /> {testing ? 'TestingΓÇª' : 'Test'}</Button>}
            {config?.is_active && <Button size="sm" variant="outline" onClick={onSyncTemplates} disabled={testing}><RefreshCw className="h-4 w-4" /> Sync Templates</Button>}
          </div>
        </div>
        {config && cfg && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-slate-400">Phone Number ID</dt><dd className="font-mono text-xs text-slate-600">{(cfg.phone_number_id as string)?.slice(0, 16) ?? 'ΓÇö'}ΓÇª</dd></div>
            <div><dt className="text-xs text-slate-400">Business Phone</dt><dd className="text-slate-600">{(cfg.business_phone as string) ?? 'ΓÇö'}</dd></div>
            <div><dt className="text-xs text-slate-400">API Version</dt><dd className="text-slate-600">{(cfg.api_version as string) ?? 'v21.0'}</dd></div>
          </dl>
        )}
        {!config && canConfigure && <Button onClick={onConfigure} className="mt-4"><Plus className="h-4 w-4" /> Configure WhatsApp</Button>}
      </Card>
    </div>
  );
}

// ΓöÇΓöÇΓöÇ Razorpay Tab ΓöÇΓöÇΓöÇ
function RazorpayTab({ config, canConfigure, onConfigure, onTest, testing }: {
  config?: IntegrationConfig; canConfigure: boolean; onConfigure: () => void; onTest: () => void; testing: boolean;
}) {
  const STATUS_TONE: Record<string, BadgeTone> = { connected: 'success', auth_failed: 'danger', connection_failed: 'danger', sync_failed: 'warning', disabled: 'neutral', not_configured: 'neutral' };
  const cfg = config?.config as Record<string, unknown> | undefined;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Razorpay Payment Integration</h3>
            <p className="mt-1 text-xs text-slate-500">Create payment links and receive verified webhooks.</p>
          </div>
          <div className="flex items-center gap-2">
            {config && (
              <span className={classNames('rounded-full px-3 py-1 text-xs font-semibold', config.mode === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                {config.mode === 'live' ? 'LIVE' : 'TEST'}
              </span>
            )}
            {config && <StatusBadge status={config.connection_status.replace(/_/g, ' ')} tone={STATUS_TONE[config.connection_status] ?? 'neutral'} />}
            {config?.is_active && <Button size="sm" variant="outline" onClick={onTest} disabled={testing}><TestTube className="h-4 w-4" /> {testing ? 'TestingΓÇª' : 'Test'}</Button>}
          </div>
        </div>
        {config && cfg && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-400">Key ID</dt><dd className="font-mono text-xs text-slate-600">{(cfg.key_id as string)?.slice(0, 12)}ΓÇª</dd></div>
            <div><dt className="text-xs text-slate-400">Key Secret</dt><dd className="text-slate-600">ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó</dd></div>
          </dl>
        )}
        {!config && canConfigure && <Button onClick={onConfigure} className="mt-4"><Plus className="h-4 w-4" /> Configure Razorpay</Button>}
      </Card>
    </div>
  );
}

// ΓöÇΓöÇΓöÇ Health Tab ΓöÇΓöÇΓöÇ
function HealthTab({ configs, emailAccounts, onTest, testing }: {
  configs: IntegrationConfig[]; emailAccounts: EmailAccount[]; onTest: (provider: string, action?: string, accountId?: string) => void; testing: boolean;
}) {
  const STATUS_TONE: Record<string, BadgeTone> = { connected: 'success', auth_failed: 'danger', connection_failed: 'danger', sync_failed: 'warning', disabled: 'neutral', not_configured: 'neutral' };
  const items = [
    { label: 'Email (SMTP)', provider: 'email', icon: Mail, config: configs.find((c) => c.provider === 'email') },
    { label: 'WhatsApp Business', provider: 'whatsapp', icon: MessageCircle, config: configs.find((c) => c.provider === 'whatsapp') },
    { label: 'Razorpay', provider: 'razorpay', icon: CreditCard, config: configs.find((c) => c.provider === 'razorpay') },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <Card key={item.provider} className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100"><item.icon className="h-5 w-5 text-slate-600" /></div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-700">{item.label}</div>
                <StatusBadge status={item.config?.connection_status?.replace(/_/g, ' ') ?? 'not configured'} tone={STATUS_TONE[item.config?.connection_status ?? 'not_configured'] ?? 'neutral'} />
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              {item.config && <div>Last tested: {formatDateTime(item.config.last_test_at)}</div>}
              {item.config && <div>Last webhook: {formatDateTime(item.config.last_webhook_at)}</div>}
            </div>
            <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => onTest(item.provider)} disabled={testing || !item.config}>
              <TestTube className="h-4 w-4" /> Test connection
            </Button>
          </Card>
        ))}
      </div>
      {emailAccounts.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Email Account Health</h3>
          <div className="space-y-2">
            {emailAccounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{a.email_address}</span>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>SMTP: {formatDateTime(a.last_successful_connection)}</span>
                  {a.sync_enabled && <span>Sync: {formatDateTime(a.last_sync_at)}</span>}
                  <StatusBadge status={a.connection_status.replace(/_/g, ' ')} tone={STATUS_TONE[a.connection_status] ?? 'neutral'} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ΓöÇΓöÇΓöÇ Webhooks Tab ΓöÇΓöÇΓöÇ
function WebhooksTab({ events }: { events: WebhookEvent[] }) {
  const STATUS_TONE: Record<string, BadgeTone> = { processed: 'success', processing: 'info', received: 'info', duplicate: 'neutral', failed: 'danger', ignored: 'neutral', manual_review: 'warning' };
  return (
    <div className="space-y-4">
      {events.length === 0 ? (
        <EmptyState icon={<Webhook className="h-10 w-10" />} title="No webhook events" description="Webhook events from Razorpay and WhatsApp will appear here." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Event Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Signature</th><th className="px-4 py-3">Received</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 capitalize">{e.provider}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{e.event_type || 'ΓÇö'}</td>
                    <td className="px-4 py-3"><StatusBadge status={e.processing_status} tone={STATUS_TONE[e.processing_status] ?? 'neutral'} /></td>
                    <td className="px-4 py-3">{e.signature_valid ? <span className="text-emerald-600">Valid</span> : <span className="text-rose-600">Invalid</span>}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(e.received_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ΓöÇΓöÇΓöÇ Email Account Modal ΓöÇΓöÇΓöÇ
function EmailAccountModal({ onClose, onCreated, wsId, userId }: { onClose: () => void; onCreated: () => void; wsId: string; userId: string }) {
  const [accountName, setAccountName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.hostinger.com');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSecurity, setSmtpSecurity] = useState('ssl');
  const [imapHost, setImapHost] = useState('imap.hostinger.com');
  const [imapPort, setImapPort] = useState(993);
  const [imapSecurity, setImapSecurity] = useState('ssl');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [replyTo, setReplyTo] = useState('');
  const [signature, setSignature] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async () => {
    if (!accountName.trim() || !emailAddress.trim()) return;
    setBusy(true); setError(null);
    // Create email account
    const { data: acct, error: acctErr } = await supabase.from('email_accounts').insert({
      workspace_id: wsId, account_name: accountName.trim(), email_address: emailAddress.trim(),
      display_name: displayName || null, smtp_username: smtpUsername || emailAddress,
      smtp_host: smtpHost, smtp_port: smtpPort, smtp_security: smtpSecurity,
      imap_host: syncEnabled ? imapHost : null, imap_port: syncEnabled ? imapPort : null,
      imap_security: syncEnabled ? imapSecurity : null,
      sync_enabled: syncEnabled, reply_to: replyTo || null, email_signature: signature || null,
      is_default_sending: isDefault, connection_status: 'not_configured', created_by: userId,
    }).select().single();
    if (acctErr) { setError(describeDbError(acctErr)); setBusy(false); return; }

    // Store SMTP password as encrypted secret
    let configId: string | undefined;
    const { data: configRow } = await supabase.from('integration_configs').select('id').eq('workspace_id', wsId).eq('provider', 'email').maybeSingle();
    if (configRow) {
      configId = configRow.id;
    } else {
      const { data: newCfg } = await supabase.from('integration_configs').insert({
        workspace_id: wsId, provider: 'email', is_active: true, created_by: userId,
      }).select().single();
      configId = newCfg?.id;
    }
    if (configId && smtpPassword) {
      await supabase.rpc('store_integration_secret', {
        p_workspace_id: wsId, p_config_id: configId, p_key_name: `smtp_password_${acct.id}`,
        p_raw_value: smtpPassword, p_user_id: userId,
      });
    }

    await addAuditLog(wsId, userId, 'email_account', acct.id, 'create', { changeSummary: `Email account created: ${emailAddress}` });
    setBusy(false); onCreated(); onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title="Add email account" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account name" required><TextInput value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Primary / Billing / Support" autoFocus /></Field>
          <Field label="Email address" required><TextInput value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="you@yourdomain.com" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Display name"><TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your Company" /></Field>
          <Field label="Reply-to"><TextInput value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="reply@yourdomain.com" /></Field>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <h4 className="mb-3 text-xs font-semibold uppercase text-slate-500">SMTP Settings</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SMTP username"><TextInput value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} placeholder={emailAddress || "you@yourdomain.com"} /></Field>
            <Field label="SMTP password">
              <div className="relative">
                <TextInput type={showPassword ? 'text' : 'password'} value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </Field>
            <Field label="SMTP host"><TextInput value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Port"><TextInput type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} /></Field>
              <Field label="Security"><Select value={smtpSecurity} onChange={(e) => setSmtpSecurity(e.target.value)}><option value="ssl">SSL</option><option value="tls">TLS</option><option value="starttls">STARTTLS</option></Select></Field>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="syncEnabled" checked={syncEnabled} onChange={(e) => setSyncEnabled(e.target.checked)} className="rounded border-slate-300" />
          <label htmlFor="syncEnabled" className="text-sm text-slate-700">Enable IMAP inbox sync</label>
        </div>
        {syncEnabled && (
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 p-3">
            <Field label="IMAP host"><TextInput value={imapHost} onChange={(e) => setImapHost(e.target.value)} /></Field>
            <Field label="IMAP port"><TextInput type="number" value={imapPort} onChange={(e) => setImapPort(Number(e.target.value))} /></Field>
            <Field label="Security"><Select value={imapSecurity} onChange={(e) => setImapSecurity(e.target.value)}><option value="ssl">SSL</option><option value="tls">TLS</option></Select></Field>
          </div>
        )}
        <Field label="Email signature"><TextArea value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Best regards,\nYour Name" /></Field>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="isDefault" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-slate-300" />
          <label htmlFor="isDefault" className="text-sm text-slate-700">Set as default sending account</label>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !accountName.trim() || !emailAddress.trim()}>{busy ? 'SavingΓÇª' : 'Save account'}</Button></div>
      </div>
    </Modal>
  );
}

// ΓöÇΓöÇΓöÇ WhatsApp Config Modal ΓöÇΓöÇΓöÇ
function WhatsAppConfigModal({ onClose, onCreated, wsId, userId, existing }: {
  onClose: () => void; onCreated: () => void; wsId: string; userId: string; existing?: IntegrationConfig;
}) {
  const [displayName, setDisplayName] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
  const [apiVersion, setApiVersion] = useState('v21.0');
  const [mode, setMode] = useState('test');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!phoneNumberId || !accessToken) return;
    setBusy(true); setError(null);
    let configId = existing?.id;
    if (!configId) {
      const { data: newCfg, error: cfgErr } = await supabase.from('integration_configs').insert({
        workspace_id: wsId, provider: 'whatsapp', mode, is_active: true,
        config: { waba_id: wabaId, phone_number_id: phoneNumberId, business_phone: businessPhone, api_version: apiVersion, display_name: displayName },
        created_by: userId,
      }).select().single();
      if (cfgErr) { setError(describeDbError(cfgErr)); setBusy(false); return; }
      configId = newCfg.id;
    } else {
      await supabase.from('integration_configs').update({
        mode, is_active: true,
        config: { waba_id: wabaId, phone_number_id: phoneNumberId, business_phone: businessPhone, api_version: apiVersion, display_name: displayName },
        updated_by: userId,
      }).eq('id', configId);
    }

    // Store secrets via server-side encryption function
    const secrets = [
      { key: 'whatsapp_access_token', value: accessToken },
      { key: 'whatsapp_app_secret', value: appSecret },
      { key: 'whatsapp_webhook_verify_token', value: webhookVerifyToken },
    ];
    for (const s of secrets) {
      if (s.value) {
        await supabase.rpc('store_integration_secret', {
          p_workspace_id: wsId, p_config_id: configId, p_key_name: s.key, p_raw_value: s.value, p_user_id: userId,
        });
      }
    }

    await addAuditLog(wsId, userId, 'whatsapp_integration', configId || null, existing ? 'update' : 'create', { changeSummary: 'WhatsApp integration configured' });
    setBusy(false); onCreated(); onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title="Configure WhatsApp Business" size="lg">
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700"><Shield className="mr-1 inline h-4 w-4" /> Credentials are encrypted and never exposed to the frontend.</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Display name"><TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="My Company" /></Field>
          <Field label="Mode"><Select value={mode} onChange={(e) => setMode(e.target.value)}><option value="test">Test</option><option value="live">Live</option></Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="WABA ID"><TextInput value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="WhatsApp Business Account ID" /></Field>
          <Field label="Phone Number ID" required><TextInput value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="Phone Number ID" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Business phone"><TextInput value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} placeholder="+91XXXXXXXXXX" /></Field>
          <Field label="API version"><TextInput value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} /></Field>
        </div>
        <Field label="Access token" required>
          <div className="relative">
            <TextInput type={showToken ? 'text' : 'password'} value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="EAAxxxxxxxxxxxx" />
            <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">{showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="App secret"><TextInput type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó" /></Field>
          <Field label="Webhook verify token"><TextInput type="password" value={webhookVerifyToken} onChange={(e) => setWebhookVerifyToken(e.target.value)} placeholder="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó" /></Field>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !phoneNumberId || !accessToken}>{busy ? 'SavingΓÇª' : 'Save configuration'}</Button></div>
      </div>
    </Modal>
  );
}

// ΓöÇΓöÇΓöÇ Razorpay Config Modal ΓöÇΓöÇΓöÇ
function RazorpayConfigModal({ onClose, onCreated, wsId, userId, existing }: {
  onClose: () => void; onCreated: () => void; wsId: string; userId: string; existing?: IntegrationConfig;
}) {
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [mode, setMode] = useState('test');
  const [linkExpiryDays, setLinkExpiryDays] = useState(7);
  const [autoReceipt, setAutoReceipt] = useState(true);
  const [autoReconcile, setAutoReconcile] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!keyId || !keySecret) return;
    setBusy(true); setError(null);
    let configId = existing?.id;
    if (!configId) {
      const { data: newCfg, error: cfgErr } = await supabase.from('integration_configs').insert({
        workspace_id: wsId, provider: 'razorpay', mode, is_active: true,
        config: { key_id: keyId, link_expiry_days: linkExpiryDays, auto_receipt: autoReceipt, auto_reconcile: autoReconcile },
        created_by: userId,
      }).select().single();
      if (cfgErr) { setError(describeDbError(cfgErr)); setBusy(false); return; }
      configId = newCfg.id;
    } else {
      await supabase.from('integration_configs').update({
        mode, is_active: true,
        config: { key_id: keyId, link_expiry_days: linkExpiryDays, auto_receipt: autoReceipt, auto_reconcile: autoReconcile },
        updated_by: userId,
      }).eq('id', configId);
    }

    // Store secrets via server-side encryption function
    const secrets = [
      { key: 'razorpay_key_secret', value: keySecret },
      { key: 'razorpay_webhook_secret', value: webhookSecret },
    ];
    for (const s of secrets) {
      if (s.value) {
        await supabase.rpc('store_integration_secret', {
          p_workspace_id: wsId, p_config_id: configId, p_key_name: s.key, p_raw_value: s.value, p_user_id: userId,
        });
      }
    }

    await addAuditLog(wsId, userId, 'razorpay_integration', configId || null, existing ? 'update' : 'create', { changeSummary: `Razorpay integration configured (${mode} mode)` });
    setBusy(false); onCreated(); onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title="Configure Razorpay" size="md">
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700"><Shield className="mr-1 inline h-4 w-4" /> Secrets are encrypted and never exposed to the frontend.</div>
        <Field label="Mode"><Select value={mode} onChange={(e) => setMode(e.target.value)}><option value="test">Test</option><option value="live">Live</option></Select></Field>
        <Field label="Key ID" required><TextInput value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_test_xxxxxxxx" /></Field>
        <Field label="Key secret" required><TextInput type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} placeholder="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó" /></Field>
        <Field label="Webhook secret"><TextInput type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Link expiry (days)"><TextInput type="number" value={linkExpiryDays} onChange={(e) => setLinkExpiryDays(Number(e.target.value))} /></Field>
          <div className="flex items-center gap-2 pt-6"><input type="checkbox" id="autoReceipt" checked={autoReceipt} onChange={(e) => setAutoReceipt(e.target.checked)} className="rounded border-slate-300" /><label htmlFor="autoReceipt" className="text-sm text-slate-700">Auto receipt</label></div>
          <div className="flex items-center gap-2 pt-6"><input type="checkbox" id="autoReconcile" checked={autoReconcile} onChange={(e) => setAutoReconcile(e.target.checked)} className="rounded border-slate-300" /><label htmlFor="autoReconcile" className="text-sm text-slate-700">Auto reconcile</label></div>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !keyId || !keySecret}>{busy ? 'SavingΓÇª' : 'Save configuration'}</Button></div>
      </div>
    </Modal>
  );
}

// ΓöÇΓöÇΓöÇ WordPress Tab ΓöÇΓöÇΓöÇ
function WordPressTab({ config, canConfigure, workspaceId, userId, onRefresh }: {
  config?: IntegrationConfig; canConfigure: boolean; workspaceId: string; userId: string; onRefresh: () => void;
}) {
  const cfg = (config?.config ?? {}) as Record<string, any>;
  const isConnected = config?.is_active && config?.connection_status === 'connected';

  const [websiteUrl, setWebsiteUrl] = useState(cfg.website_url || '');
  const [connectionMethod, setConnectionMethod] = useState<'api' | 'webhook'>(cfg.connection_method || 'api');
  const [apiKey, setApiKey] = useState(cfg.api_key || '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);

  useEffect(() => {
    if (config?.config) {
      const dbCfg = config.config as any;
      if (dbCfg.website_url) setWebsiteUrl(dbCfg.website_url);
      if (dbCfg.connection_method) setConnectionMethod(dbCfg.connection_method);
      if (dbCfg.api_key) setApiKey(dbCfg.api_key);
    }
  }, [config, workspaceId]); // Depend on config directly to sync state correctly when it loads

  // The ingest key is a server-side row in lead_ingest_keys and is the only
  // credential lead-ingest accepts. A string derived from the workspace id is
  // not a secret - the workspace id is visible in the UI and in plugin config.


  const handleGenerateNewKey = async () => {
    if (!workspaceId) return;
    setError(null);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const newKey = `k1_live_${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`;

    if (config?.id) {
        const currentCfg = config.config as any;
        const { error: insErr } = await supabase
        .from('integration_configs')
        .update({ config: { ...currentCfg, api_key: newKey } })
        .eq('id', config.id);

        if (insErr) {
        setError(`Could not issue a new key: ${insErr.message}`);
        return;
        }
    }
    setApiKey(newKey);
    setSuccessMsg('New ingest key issued. Paste it into WordPress and every other connected tool - the old key no longer works.');
  };

  const handleCopyKey = () => {
    const keyToCopy = apiKey;
    if (keyToCopy) {
      navigator.clipboard.writeText(keyToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteUrl || !apiKey) return;
    setError(null);
    setSaving(true);
    try {
      const urlObj = new URL(websiteUrl);
      if (!['http:', 'https:'].includes(urlObj.protocol)) throw new Error('URL must start with http:// or https://');
    } catch {
      setError('Please enter a valid website URL (e.g. https://yoursite.com)');
      setSaving(false);
      return;
    }

    const configPayload = {
      workspace_id: workspaceId,
      provider: 'wordpress' as const,
      is_active: true,
      connection_status: 'connected',
      mode: 'live',
      config: {
        ...cfg,
        website_url: websiteUrl,
        connection_method: connectionMethod,
        api_key: apiKey,
      },
      created_by: userId,
      updated_by: userId,
    };

    let configId = config?.id;
    if (!configId) {
      const { data: newCfg, error: cfgErr } = await supabase
        .from('integration_configs')
        .insert(configPayload)
        .select()
        .single();
      if (cfgErr) { setError(describeDbError(cfgErr)); setSaving(false); return; }
      configId = newCfg.id;
    } else {
      const { error: upErr } = await supabase
        .from('integration_configs')
        .update({ ...configPayload, updated_by: userId })
        .eq('id', configId);
      if (upErr) { setError(describeDbError(upErr)); setSaving(false); return; }
    }

    await supabase.rpc('store_integration_secret', {
      p_workspace_id: workspaceId,
      p_config_id: configId,
      p_key_name: 'wordpress_api_key',
      p_raw_value: apiKey,
      p_user_id: userId,
    });

    await addAuditLog(workspaceId, userId, 'wordpress_integration', configId || null, 'create', { changeSummary: 'WordPress integration connected' });
    setSaving(false);
    setSuccessMsg('WordPress connected! Install the plugin on your site to start capturing leads.');
    onRefresh();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const resp = await fetch(`${(cfg.website_url as string)?.replace(/\/$/, '')}/wp-json/kanishk-one/v1/ping`, {
        method: 'GET',
        headers: { 'X-K1-Workspace-Key': cfg.api_key || '' },
      });
      if (resp.ok) {
        setSuccessMsg('Γ£ô Connection verified! The plugin is active on your WordPress site.');
      } else {
        setError(`Connection failed (${resp.status}). Make sure the Kanishk One Connector plugin is installed and active.`);
      }
    } catch {
      setError('Could not reach your WordPress site. Verify the URL is correct and the plugin is installed.');
    }
    setTesting(false);
  };

  const handleDisconnect = async () => {
    if (!config?.id) return;
    setSaving(true);
    await supabase.from('integration_configs').update({ is_active: false, connection_status: 'disabled' }).eq('id', config.id);
    await addAuditLog(workspaceId, userId, 'wordpress_integration', config.id, 'update', { changeSummary: 'WordPress integration disconnected' });
    setSaving(false);
    setShowConfirmDisconnect(false);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Universal Webhook Ingest Endpoint Card */}
      <Card className="p-5 space-y-3 bg-blue-50/40 border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Link className="h-4 w-4 text-blue-600" /> Universal Webhook Ingest Endpoint (n8n, Zapier, Webflow, Node.js, Custom Forms)
          </div>
          <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">POST Endpoint</span>
        </div>
        <p className="text-xs text-slate-600">
          Send incoming leads from any website, n8n workflow, Zapier, Make.com, or custom backend directly to this webhook. Include your API Key in the <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-blue-700">X-K1-Ingest-Key</code> header or payload.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white border border-blue-200 rounded-lg p-2.5 font-mono text-xs text-blue-700 select-all font-bold break-all shadow-sm">
            {`${window.location.origin}/api/webhooks/wordpress`}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/wordpress`);
              alert('Webhook URL copied to clipboard!');
            }}
            className="shrink-0 bg-white"
          >
            <Copy className="h-4 w-4 mr-1.5" /> Copy Endpoint
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <Globe className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Website Lead Connector</h3>
              <p className="mt-0.5 text-xs text-slate-500">Automatically capture leads from your website forms (WordPress, Webflow, Custom HTML, React, etc.).</p>
            </div>
          </div>
          {isConnected && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
            </span>
          )}
        </div>

        {(error || successMsg) && (
          <div className={classNames('mb-4 rounded-lg px-3 py-2 text-sm', error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700')}>
            {error || successMsg}
          </div>
        )}

        {!isConnected ? (
          <form onSubmit={handleConnect} className="space-y-4">
            {workspaceId === '00000000-0000-0000-0000-000000000000' && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
                You are currently in the Demo Workspace. To configure and save real integrations, please switch to a live workspace.
              </div>
            )}
            <Field label="Website URL" required hint="The URL of your website.">
              <TextInput
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourwebsite.com"
                required
                disabled={!canConfigure || saving || workspaceId === '00000000-0000-0000-0000-000000000000'}
              />
            </Field>
            <Field label="Connection Method">
              <Select value={connectionMethod} onChange={(e) => setConnectionMethod(e.target.value as 'api' | 'webhook')} disabled={!canConfigure || saving || workspaceId === '00000000-0000-0000-0000-000000000000'}>
                <option value="api">API (Recommended)</option>
                <option value="webhook">Webhook</option>
              </Select>
            </Field>
            <Field label="API Key" required hint="Workspace-specific API key to authenticate website submissions">
              <div className="flex gap-2">
                <TextInput
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono text-xs"
                  required
                  disabled={!canConfigure || saving || workspaceId === '00000000-0000-0000-0000-000000000000'}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleCopyKey} title="Copy Key">
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleGenerateNewKey} disabled={!canConfigure || saving || workspaceId === '00000000-0000-0000-0000-000000000000'} title="Generate new key">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </Field>

            {canConfigure && (
              <Button type="submit" disabled={saving || workspaceId === '00000000-0000-0000-0000-000000000000'} className="w-full bg-blue-600 text-white font-bold py-2.5">
                {saving ? 'Connecting Website...' : 'Connect Website'}
              </Button>
            )}
          </form>

        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs">
              <div className="space-y-1">
                <span className="text-slate-400 font-medium">Website URL</span>
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-blue-600" />
                  <a href={cfg.website_url as string} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">
                    {cfg.website_url as string}
                  </a>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 font-medium">Connection Method</span>
                <div className="font-semibold text-slate-900 uppercase">
                  {(cfg.connection_method as string) || 'API'} {cfg.connection_method === 'api' ? '(Recommended)' : ''}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 font-medium">API Key</span>
                <div className="font-mono text-slate-700 flex items-center gap-2">
                  <span>{cfg.api_key ? `${(cfg.api_key as string).slice(0, 14)}ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó` : 'ΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇóΓÇó'}</span>
                  <button onClick={handleCopyKey} className="text-slate-400 hover:text-slate-600">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 font-medium">Last Lead Received</span>
                <div className="font-semibold text-slate-900">
                  {cfg.last_lead_received ? formatDateTime(cfg.last_lead_received as string) : 'Never'}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 font-medium">Total Leads Received</span>
                <div className="font-semibold text-slate-900 text-sm">{(cfg.total_leads_received as number) ?? 0} leads</div>
              </div>
            </div>

            {canConfigure && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => downloadWordPressPlugin()} className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-indigo-600" /> Download Plugin
                </Button>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => setShowConfirmDisconnect(true)}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                >
                  <Power className="h-4 w-4" /> Disconnect
                </Button>
              </div>
            )}

            {showConfirmDisconnect && (
              <ConfirmDialog
                open
                onClose={() => setShowConfirmDisconnect(false)}
                onConfirm={handleDisconnect}
                title="Disconnect WordPress Integration?"
                message="Are you sure you want to disconnect WordPress? Incoming leads from your website will no longer be captured automatically until reconnected."
                confirmLabel="Disconnect"
                danger
              />
            )}
          </div>
        )}
      </Card>

      {!isConnected && (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
              <Zap className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-slate-700">WordPress Connector Plugin</h4>
              <p className="mt-1 text-xs text-slate-500">
                Install the WordPress plugin to forward form submissions into your Lead Inbox automatically.
                Works with Contact Form 7, WPForms, Elementor Forms, Gravity Forms, and any other form plugin.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadWordPressPlugin()} className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4" /> Download Plugin (.zip)
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Connected Websites Overview */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-600" /> Connected Websites Overview
            </h4>
            <p className="text-xs text-slate-500">
              All active website domains forwarding form enquiries into this CRM workspace.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
            {isConnected && cfg.website_url ? 1 : 0} Active Website
          </span>
        </div>

        {isConnected && cfg.website_url ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Website Domain</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Method</th>
                  <th className="px-3 py-2.5">Total Leads</th>
                  <th className="px-3 py-2.5">Last Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50/80">
                  <td className="px-3 py-3 font-medium text-slate-900 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <a href={cfg.website_url as string} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600 font-semibold">
                      {cfg.website_url as string}
                    </a>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono uppercase text-slate-600 font-semibold">
                    {(cfg.connection_method as string) || 'API'}
                  </td>
                  <td className="px-3 py-3 font-bold text-slate-900">
                    {(cfg.total_leads_received as number) ?? 0} leads
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {cfg.last_lead_received ? formatDateTime(cfg.last_lead_received as string) : 'Connected'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            No active website connected yet. Connect your WordPress website URL above to start capturing leads automatically.
          </div>
        )}
      </Card>
    </div>
  );
}

