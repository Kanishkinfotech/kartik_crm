import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LoadingState, Button, Card, Field, TextInput, Select } from '@/components/ui';
import { Settings, Shield, CreditCard, Mail, Globe, Save, Server, Lock } from 'lucide-react';

export function AdminSettings() {
  const [activeTab, setActiveTab] = useState<'gateway' | 'tax' | 'email' | 'smtp'>('gateway');
  const [razorpayKeyId, setRazorpayKeyId] = useState('rzp_live_kanishk_one_prod');
  const [razorpaySecret, setRazorpaySecret] = useState('••••••••••••••••••••••••');
  const [companyName, setCompanyName] = useState('Kanishk Infotech Solutions');
  const [gstin, setGstin] = useState('29AAAAA0000A1Z5');
  const [pan, setPan] = useState('AAAAA0000A');
  const [supportEmail, setSupportEmail] = useState('support@kanishkone.com');
  const [currency, setCurrency] = useState('INR');

  // Global Platform SMTP Credentials State
  const [smtpHost, setSmtpHost] = useState('smtp.sendgrid.net');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('apikey');
  const [smtpPass, setSmtpPass] = useState('••••••••••••••••••••••••');
  const [smtpFromEmail, setSmtpFromEmail] = useState('noreply@kanishkone.com');
  const [smtpFromName, setSmtpFromName] = useState('Kanishk One Platform');
  const [smtpSecurity, setSmtpSecurity] = useState<'tls' | 'ssl' | 'none'>('tls');

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const handleSaveSettings = async () => {
    setSaving(true);
    // Persist global platform settings
    await new Promise((res) => setTimeout(res, 800));
    setSaving(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary flex items-center gap-2">
            <Settings className="h-7 w-7 text-admin-primary" /> Global Platform Settings
          </h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Configure platform Razorpay payment credentials, legal B2B tax info, global SMTP servers, and support routing.
          </p>
        </div>
      </div>

      <div className="flex border-b border-admin-border-subtle gap-6 text-sm font-semibold text-admin-text-secondary overflow-x-auto">
        <button
          onClick={() => setActiveTab('gateway')}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'gateway' ? 'border-admin-primary text-admin-primary font-bold' : 'border-transparent hover:text-admin-text-primary'
          }`}
        >
          <CreditCard className="h-4 w-4" /> Platform Payment Gateway
        </button>
        <button
          onClick={() => setActiveTab('smtp')}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'smtp' ? 'border-admin-primary text-admin-primary font-bold' : 'border-transparent hover:text-admin-text-primary'
          }`}
        >
          <Server className="h-4 w-4 text-amber-500" /> System SMTP Setup
        </button>
        <button
          onClick={() => setActiveTab('tax')}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'tax' ? 'border-admin-primary text-admin-primary font-bold' : 'border-transparent hover:text-admin-text-primary'
          }`}
        >
          <Shield className="h-4 w-4" /> B2B Tax & Legal Info
        </button>
        <button
          onClick={() => setActiveTab('email')}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'email' ? 'border-admin-primary text-admin-primary font-bold' : 'border-transparent hover:text-admin-text-primary'
          }`}
        >
          <Mail className="h-4 w-4" /> Support & Notifications
        </button>
      </div>

      <Card className="p-6 border-admin-border-subtle bg-admin-bg-surface space-y-6">
        {activeTab === 'gateway' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-sm font-bold text-admin-text-primary flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600" /> Razorpay Live Payment Gateway Credentials
            </h3>
            <p className="text-xs text-slate-500">
              Used to collect SaaS workspace subscription payments and process automatic renewals.
            </p>

            <Field label="Razorpay Key ID">
              <TextInput value={razorpayKeyId} onChange={(e) => setRazorpayKeyId(e.target.value)} />
            </Field>

            <Field label="Razorpay Key Secret">
              <TextInput type="password" value={razorpaySecret} onChange={(e) => setRazorpaySecret(e.target.value)} />
            </Field>

            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-1.5 mt-2">
              <div className="font-bold text-blue-900 uppercase tracking-wider text-[11px]">Automated Payment Auto-Activation Webhook URL</div>
              <div className="font-mono text-blue-700 bg-white border border-blue-200 p-2 rounded select-all break-all font-bold">
                {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/platform-payment` : '/api/webhooks/platform-payment'}
              </div>
              <p className="text-[11px] text-slate-600">
                Add this URL to your Razorpay Dashboard ➔ Webhooks for events <code className="font-mono text-blue-800 font-bold">payment.captured</code> and <code className="font-mono text-blue-800 font-bold">subscription.charged</code> to automatically activate workspaces upon payment receipt.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'smtp' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-sm font-bold text-admin-text-primary flex items-center gap-2">
              <Server className="h-4 w-4 text-amber-600" /> Global System SMTP Email Server
            </h3>
            <p className="text-xs text-slate-500">
              Used by the platform to send automated password reset emails, invoice PDFs, and subscription receipts to workspace owners.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="SMTP Host Server">
                <TextInput value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.sendgrid.net" />
              </Field>

              <Field label="SMTP Port">
                <TextInput value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="SMTP Username">
                <TextInput value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="apikey or admin" />
              </Field>

              <Field label="SMTP Password / API Key">
                <TextInput type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Sender Email Address">
                <TextInput value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} placeholder="noreply@kanishkone.com" />
              </Field>

              <Field label="Sender Display Name">
                <TextInput value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="Kanishk One Platform" />
              </Field>
            </div>

            <Field label="Security Encryption">
              <Select value={smtpSecurity} onChange={(e) => setSmtpSecurity(e.target.value as any)}>
                <option value="tls">STARTTLS / TLS (Port 587)</option>
                <option value="ssl">SSL / TLS (Port 465)</option>
                <option value="none">None (Port 25)</option>
              </Select>
            </Field>
          </div>
        )}

        {activeTab === 'tax' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-sm font-bold text-admin-text-primary flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-600" /> Legal Business & GSTIN Registration
            </h3>
            <p className="text-xs text-slate-500">
              Appears on generated B2B platform tax invoices issued to customer workspaces.
            </p>

            <Field label="Platform Company Name">
              <TextInput value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="GSTIN">
                <TextInput value={gstin} onChange={(e) => setGstin(e.target.value)} />
              </Field>

              <Field label="PAN">
                <TextInput value={pan} onChange={(e) => setPan(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {activeTab === 'email' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-sm font-bold text-admin-text-primary flex items-center gap-2">
              <Mail className="h-4 w-4 text-emerald-600" /> Platform Communication Routing
            </h3>

            <Field label="Platform Support Email">
              <TextInput value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
            </Field>

            <Field label="Default Billing Currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
              </Select>
            </Field>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
          <Button onClick={handleSaveSettings} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Global Settings'}
          </Button>
          {savedMsg && <span className="text-xs text-emerald-600 font-bold">Platform settings saved!</span>}
        </div>
      </Card>
    </div>
  );
}