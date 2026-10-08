import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import type { EmailAccount, CommunicationTemplate } from '@/lib/types';
import { Button, Field, TextInput, TextArea, Select, Modal } from '@/components/ui';
import { Mail, Send, FileText, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { generateAIContent } from '@/lib/ai';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

type SendEmailModalProps = {
  open: boolean;
  onClose: () => void;
  to: string;
  toName?: string;
  subject?: string;
  bodyHtml?: string;
  attachmentContext?: {
    entity_type: 'quotation' | 'invoice' | 'project' | 'work_report';
    entity_id: string;
    entity_number: string;
  };
  onSent?: () => void;
};

export function SendEmailModal({ open, onClose, to, toName, subject: initialSubject, bodyHtml: initialBody, attachmentContext, onSent }: SendEmailModalProps) {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fromAccountId, setFromAccountId] = useState('');
  const [recipientTo, setRecipientTo] = useState(to);
  const [recipientCc, setRecipientCc] = useState('');
  const [emailSubject, setEmailSubject] = useState(initialSubject ?? '');
  const [emailBody, setEmailBody] = useState(initialBody ?? '');
  const [templateId, setTemplateId] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    const [acctRes, tmplRes] = await Promise.all([
      supabase.from('email_accounts').select('*').eq('workspace_id', activeWorkspace.id).eq('is_active', true).order('is_default_sending', { ascending: false }),
      supabase.from('communication_templates').select('*').eq('workspace_id', activeWorkspace.id).eq('channel', 'email').eq('is_active', true).order('template_name'),
    ]);
    setAccounts((acctRes.data ?? []) as EmailAccount[]);
    setTemplates((tmplRes.data ?? []) as CommunicationTemplate[]);
    const defaultAcct = (acctRes.data ?? []).find((a) => a.is_default_sending);
    setFromAccountId(defaultAcct?.id ?? acctRes.data?.[0]?.id ?? '');
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { if (open) { load(); setRecipientTo(to); setEmailSubject(initialSubject ?? ''); setEmailBody(initialBody ?? ''); setError(null); setSuccess(false); } }, [open, load, to, initialSubject, initialBody]);

  const applyTemplate = (tmplId: string) => {
    setTemplateId(tmplId);
    if (!tmplId) return;
    const tmpl = templates.find((t) => t.id === tmplId);
    if (!tmpl) return;
    if (tmpl.subject) setEmailSubject(tmpl.subject);
    if (tmpl.html_body) setEmailBody(tmpl.html_body);
  };

  const draftWithAI = async () => {
    if (!activeWorkspace) return;
    setAiLoading(true);
    setError(null);
    try {
      let ctx = "";
      if (attachmentContext) {
        ctx = `Attached Document: ${attachmentContext.entity_type} (${attachmentContext.entity_number})`;
      }
      const response = await generateAIContent({
        workspace_id: activeWorkspace.id,
        feature_name: "draft_email",
        module_name: "communications",
        userInstruction: `Draft a professional email to ${recipientTo || 'the client'}. Current subject: ${emailSubject}. Current draft body: ${emailBody}`,
        context: ctx,
        systemInstruction: "You are drafting a professional business email. Only output the raw HTML or text of the email body. Do not include subject lines or headers. Make it polite and concise.",
      });

      if (response.success && response.content) {
        setEmailBody(response.content);
      } else {
        throw new Error(response.error || "Failed to generate draft");
      }
    } catch (err: any) {
      setError(err.message || "AI Draft failed");
    }
    setAiLoading(false);
  };

  const send = async () => {
    if (!activeWorkspace || !fromAccountId || !recipientTo || !emailSubject) return;
    setSending(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          workspace_id: activeWorkspace.id,
          account_id: fromAccountId,
          to: [recipientTo],
          cc: recipientCc ? recipientCc.split(',').map((s) => s.trim()) : [],
          subject: emailSubject,
          html_body: emailBody,
          sent_by: user?.id,
          attachment_context: attachmentContext ?? null,
        }
      });
      if (error) throw error;
      if (!data || data.error) throw new Error(data?.error || 'Send failed');
      setSuccess(true);
      onSent?.();
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    }
    setSending(false);
  };

  const canSend = role ? true : false;

  return (
    <Modal open={open} onClose={onClose} title="Send Email" size="lg">
      {loading ? <div className="py-8 text-center text-sm text-slate-500">Loading…</div> : (
        <div className="space-y-4">
          {success && <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Email sent successfully.</div>}
          {error && <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"><AlertCircle className="h-4 w-4" /> {error}</div>}
          {accounts.length === 0 && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700"><AlertCircle className="mr-1 inline h-4 w-4" /> No active email accounts configured. Add one in Integration Settings first.</div>}

          <div className="grid grid-cols-2 gap-4">
            <Field label="From">
              <Select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} disabled={accounts.length === 0}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name} — {a.email_address}</option>)}
              </Select>
            </Field>
            <Field label="Template (optional)">
              <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">No template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.template_name}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="To" required>
            <TextInput value={recipientTo} onChange={(e) => setRecipientTo(e.target.value)} placeholder="recipient@example.com" />
          </Field>

          <Field label="CC">
            <TextInput value={recipientCc} onChange={(e) => setRecipientCc(e.target.value)} placeholder="cc1@example.com, cc2@example.com" />
          </Field>

          <Field label="Subject" required>
            <TextInput value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Email subject" />
          </Field>

          <Field label="Message body">
            <TextArea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={10} placeholder="Write your email…" className="font-mono text-sm" />
          </Field>

          {attachmentContext && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <FileText className="h-4 w-4" /> Attaching {attachmentContext.entity_type}: {attachmentContext.entity_number}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>{showPreview ? 'Edit' : 'Preview'}</Button>
              <Button variant="ghost" size="sm" onClick={draftWithAI} disabled={aiLoading} className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                <Sparkles className="h-4 w-4 text-indigo-600" /> {aiLoading ? 'Drafting…' : 'Draft with AI'}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
              <Button onClick={send} disabled={sending || !fromAccountId || !recipientTo || !emailSubject || !canSend}>
                <Send className="h-4 w-4" /> {sending ? 'Sending…' : 'Send Email'}
              </Button>
            </div>
          </div>

          {showPreview && emailBody && (
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Preview</div>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: emailBody }} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
