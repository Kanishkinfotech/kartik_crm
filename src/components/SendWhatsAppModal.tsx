import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useAuth } from '@/lib/auth';
import type { WhatsAppTemplate } from '@/lib/types';
import { Button, Field, TextInput, TextArea, Select, Modal } from '@/components/ui';
import { MessageCircle, Send, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { generateAIContent } from '@/lib/ai';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

type SendWhatsAppModalProps = {
  open: boolean;
  onClose: () => void;
  toPhone?: string;
  clientId?: string;
  templateName?: string;
  context?: {
    entity_type: 'quotation' | 'invoice' | 'project' | 'task';
    entity_id: string;
    entity_number: string;
  };
  onSent?: () => void;
};

export function SendWhatsAppModal({ open, onClose, toPhone: initialPhone, clientId, templateName: preselectedTemplate, context, onSent }: SendWhatsAppModalProps) {
  const { activeWorkspace, role } = useWorkspace();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [toPhone, setToPhone] = useState(initialPhone ?? '');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [components, setComponents] = useState<Record<string, string>>({});
  const [language, setLanguage] = useState('en_US');
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    const tmplRes = await supabase.from('whatsapp_templates').select('*').eq('workspace_id', activeWorkspace.id).eq('status', 'approved').order('template_name');
    setTemplates((tmplRes.data ?? []) as WhatsAppTemplate[]);
    if (preselectedTemplate) {
      const match = (tmplRes.data ?? []).find((t) => t.template_name === preselectedTemplate);
      if (match) setSelectedTemplate(match.template_name);
    }
    setLoading(false);
  }, [activeWorkspace, preselectedTemplate]);

  useEffect(() => { if (open) { load(); setToPhone(initialPhone ?? ''); setError(null); setSuccess(false); } }, [open, load, initialPhone]);

  const currentTemplate = templates.find((t) => t.template_name === selectedTemplate);

  const templateVariables = useMemo(() => {
    if (!currentTemplate) return [];
    const body = currentTemplate.body || '';
    const matches = body.matchAll(/\{\{(\w+)\}\}/g);
    return Array.from(new Set(Array.from(matches).map((m) => m[1])));
  }, [currentTemplate]);

  const draftWithAI = async () => {
    if (!activeWorkspace || templateVariables.length === 0) return;
    setAiLoading(true);
    setError(null);
    try {
      let ctxStr = "";
      if (context) {
        ctxStr = `Context Entity: ${context.entity_type} (${context.entity_number})`;
      }
      const response = await generateAIContent({
        workspace_id: activeWorkspace.id,
        feature_name: "draft_whatsapp",
        module_name: "communications",
        userInstruction: `Fill in the following variables for a WhatsApp message to the client. Variables needed: ${templateVariables.join(', ')}. Context: ${ctxStr}. Template text: ${currentTemplate?.body}`,
        systemInstruction: "You are an assistant helping fill WhatsApp templates. Provide the values in a strict key-value format. E.g. varName: The Value. Do not include any other text or explanation.",
      });

      if (response.success && response.content) {
        const lines = response.content.split('\n');
        const newComponents = { ...components };
        lines.forEach(line => {
          const parts = line.split(':');
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join(':').trim();
            if (templateVariables.includes(key)) {
              newComponents[key] = val;
            }
          }
        });
        setComponents(newComponents);
      } else {
        throw new Error(response.error || "Failed to generate draft");
      }
    } catch (err: any) {
      setError(err.message || "AI Draft failed");
    }
    setAiLoading(false);
  };

  const send = async () => {
    if (!activeWorkspace || !toPhone || !selectedTemplate) return;
    setSending(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          workspace_id: activeWorkspace.id,
          to_phone: toPhone,
          template_name: selectedTemplate,
          language_code: language,
          components,
          client_id: clientId ?? null,
          sent_by: user?.id,
          context: context ?? null,
        }
      });
      if (error) throw error;
      if (!data || data.error) throw new Error(data?.error || 'Send failed');
      setSuccess(true);
      onSent?.();
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send WhatsApp message');
    }
    setSending(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Send WhatsApp Message" size="md">
      {loading ? <div className="py-8 text-center text-sm text-slate-500">Loading…</div> : (
        <div className="space-y-4">
          {success && <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> WhatsApp message sent.</div>}
          {error && <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"><AlertCircle className="h-4 w-4" /> {error}</div>}
          {templates.length === 0 && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700"><AlertCircle className="mr-1 inline h-4 w-4" /> No approved WhatsApp templates. Sync templates in Integration Settings first.</div>}

          <Field label="Recipient phone" required>
            <TextInput value={toPhone} onChange={(e) => setToPhone(e.target.value)} placeholder="+91XXXXXXXXXX" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Template" required>
              <Select value={selectedTemplate} onChange={(e) => { setSelectedTemplate(e.target.value); setComponents({}); }} disabled={templates.length === 0}>
                <option value="">Select template</option>
                {templates.map((t) => <option key={t.id} value={t.template_name}>{t.template_name}</option>)}
              </Select>
            </Field>
            <Field label="Language">
              <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="en_US">English (US)</option>
                <option value="en_GB">English (UK)</option>
                <option value="hi">Hindi</option>
                <option value="kn">Kannada</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
                <option value="mr">Marathi</option>
                <option value="bn">Bengali</option>
              </Select>
            </Field>
          </div>

          {currentTemplate && (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-400">Template preview</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{currentTemplate.category}</span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{currentTemplate.body || 'No body'}</p>
            </div>
          )}

          {templateVariables.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-400">Template variables</span>
                <Button variant="ghost" size="sm" onClick={draftWithAI} disabled={aiLoading} className="h-7 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                  <Sparkles className="h-3 w-3 text-indigo-600" /> {aiLoading ? 'Drafting…' : 'Autofill with AI'}
                </Button>
              </div>
              {templateVariables.map((varName) => (
                <Field key={varName} label={`{{${varName}}}`}>
                  <TextInput value={components[varName] ?? ''} onChange={(e) => setComponents({ ...components, [varName]: e.target.value })} placeholder={`Value for ${varName}`} />
                </Field>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button onClick={send} disabled={sending || !toPhone || !selectedTemplate}>
              <Send className="h-4 w-4" /> {sending ? 'Sending…' : 'Send Message'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}


