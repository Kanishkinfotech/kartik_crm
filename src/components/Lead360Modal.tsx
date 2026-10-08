import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Lead, LeadStatus, LeadPriority, LeadActivityEvent, CustomFieldDef } from '@/lib/types';
import { Modal, Button, StatusBadge, Field, TextInput, Select, TextArea } from '@/components/ui';
import {
  User, Building2, Mail, Phone, Globe, Calendar, Clock,
  FileText, CheckCircle2, Sparkles, Send, Tag, AlertCircle,
  TrendingUp, Award, XCircle, Ban, MessageSquare, History, Plus, RotateCcw
} from 'lucide-react';
import { sendLeadWorkflowEmail, type LeadEmailTemplateType } from '@/lib/leadEmailWorkflow';
import { CustomFieldsSection } from '@/components/CustomFieldsSection';

export function Lead360Modal({
  open,
  onClose,
  lead,
  workspaceId,
  onUpdateLead,
  onCreateQuotation,
  onConvertToClient,
  onRevertToLead,
  teamMembers = [],
  inline = false,
}: {
  open: boolean;
  onClose: () => void;
  lead: Lead | null;
  workspaceId: string;
  onUpdateLead: (updated: Lead) => void;
  onCreateQuotation: (lead: Lead) => void;
  onConvertToClient: (lead: Lead) => void;
  onRevertToLead?: (lead: Lead) => void;
  teamMembers?: {id: string, full_name: string}[];
  inline?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'Overview' | 'Requirements' | 'Communication' | 'Follow-ups' | 'Quotations' | 'Activity' | 'Notes' | 'Files'>('Overview');
  const [customValues, setCustomValues] = useState<Record<string, { value: any; unit?: string }>>(lead?.custom_fields || {});

  // Follow-up Schedule Form State
  const [showFollowupForm, setShowFollowupForm] = useState(false);
  const [followupDate, setFollowupDate] = useState(lead?.next_followup_date ? String(lead.next_followup_date).split('T')[0] : new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [followupTime, setFollowupTime] = useState(lead?.next_followup_time || '10:00');
  const [followupType, setFollowupType] = useState<'call' | 'email' | 'meeting' | 'whatsapp' | 'task'>(lead?.next_followup_type || 'call');
  const [followupNote, setFollowupNote] = useState(lead?.next_followup_note || '');

  // Email Send Form State
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<LeadEmailTemplateType>('Lead Acknowledgement');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Notes Form State
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    if (lead) {
      setFollowupDate(lead.next_followup_date ? String(lead.next_followup_date).split('T')[0] : new Date(Date.now() + 86400000).toISOString().split('T')[0]);
      setFollowupTime(lead.next_followup_time || '10:00');
      setFollowupType(lead.next_followup_type || 'call');
      setFollowupNote(lead.next_followup_note || '');
    }
  }, [lead]);

  if (!lead) return null;

  const handleStageChange = (newStage: LeadStatus) => {
    const nowIso = new Date().toISOString();
    const event: LeadActivityEvent = {
      id: `evt_${Date.now()}`,
      lead_id: lead.id,
      workspace_id: workspaceId,
      event_type: 'stage_changed',
      title: `Stage Changed to ${(newStage ?? '').toUpperCase().replace('_', ' ')}`,
      description: `Moved from ${(lead.status ?? '').toUpperCase()} -> ${(newStage ?? '').toUpperCase()}`,
      created_at: nowIso,
    };

    const updated: Lead = {
      ...lead,
      status: newStage,
      last_contact_at: nowIso,
      timeline_events: [...(lead.timeline_events || []), event],
      updated_at: nowIso,
    };

    onUpdateLead(updated);
  };

  const handleOwnerChange = async (ownerId: string) => {
    if (!lead) return;
    const ownerName = teamMembers.find(tm => tm.id === ownerId)?.full_name || null;
    const nowIso = new Date().toISOString();
    
    const event: LeadActivityEvent = {
      id: `evt_${Date.now()}`,
      lead_id: lead.id,
      workspace_id: workspaceId,
      event_type: 'owner_assigned',
      title: 'Owner Assigned',
      description: `Lead assigned to ${ownerName || 'Unassigned'}`,
      created_at: nowIso,
    };

    const updated: Lead = {
      ...lead,
      assigned_to: ownerId || undefined,
      assigned_owner_name: ownerName || undefined,
      timeline_events: [...(lead.timeline_events || []), event],
      updated_at: nowIso,
    };

    // Update locally to immediately reflect in UI
    onUpdateLead(updated);

    // Persist to database
    try {
      await supabase
        .from('leads')
        .update({ 
          assigned_to: ownerId || null, 
          assigned_owner_name: ownerName || null,
          timeline_events: updated.timeline_events,
          updated_at: nowIso
        })
        .eq('id', lead.id);
    } catch (err) {
      console.error('Failed to save owner change to DB', err);
    }
  };

  const handleScheduleFollowup = (e: React.FormEvent) => {
    e.preventDefault();
    const nowIso = new Date().toISOString();
    const event: LeadActivityEvent = {
      id: `evt_${Date.now()}`,
      lead_id: lead.id,
      workspace_id: workspaceId,
      event_type: 'followup_scheduled',
      title: `Follow-up Scheduled (${followupType.toUpperCase()})`,
      description: `Date: ${followupDate} at ${followupTime} | Note: ${followupNote || 'No details'}`,
      created_at: nowIso,
    };

    const updated: Lead = {
      ...lead,
      next_followup_date: followupDate,
      next_followup_time: followupTime,
      next_followup_type: followupType,
      next_followup_note: followupNote,
      last_contact_at: nowIso,
      timeline_events: [...(lead.timeline_events || []), event],
      updated_at: nowIso,
    };

    onUpdateLead(updated);
    setShowFollowupForm(false);
  };

  const handleSendWorkflowEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingEmail(true);
    const res = await sendLeadWorkflowEmail(workspaceId, lead, emailTemplate);
    setSendingEmail(false);

    if (res.sent) {
      alert(`Email (${emailTemplate}) sent successfully to ${lead.email}`);
      const updatedEvents: LeadActivityEvent[] = [
        ...(lead.timeline_events || []),
        {
          id: `evt_${Date.now()}`,
          lead_id: lead.id,
          workspace_id: workspaceId,
          event_type: 'email_sent',
          title: `Email Sent: ${emailTemplate}`,
          description: `To: ${lead.email}`,
          created_at: new Date().toISOString(),
        },
      ];
      onUpdateLead({ ...lead, timeline_events: updatedEvents, last_contact_at: new Date().toISOString() });
      setShowEmailForm(false);
    } else {
      alert(`Could not send email: ${res.reason}`);
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    const nowIso = new Date().toISOString();
    const event: LeadActivityEvent = {
      id: `evt_${Date.now()}`,
      lead_id: lead.id,
      workspace_id: workspaceId,
      event_type: 'note_added',
      title: 'Internal Note Added',
      description: newNote.trim(),
      created_at: nowIso,
    };

    const updated: Lead = {
      ...lead,
      notes: lead.notes ? `${lead.notes}\n[${new Date().toLocaleDateString('en-IN')}]: ${newNote.trim()}` : newNote.trim(),
      timeline_events: [...(lead.timeline_events || []), event],
      updated_at: nowIso,
    };

    onUpdateLead(updated);
    setNewNote('');
  };

  const handleToggleDNC = () => {
    const updated: Lead = {
      ...lead,
      is_do_not_contact: !lead.is_do_not_contact,
      updated_at: new Date().toISOString(),
    };
    onUpdateLead(updated);
  };

  const isWon = lead.status === 'won';

  const content = (
    <div className={`space-y-4 ${inline ? 'h-full overflow-y-auto' : 'max-h-[82vh] overflow-y-auto pr-1'}`}>
      {/* HEADER BAR */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{lead.contact_name}</h2>
                <StatusBadge status={lead.status} />
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800 uppercase">
                  {(lead.source ?? 'other').replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-slate-400" /> {lead.company_name}</span>
                <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-slate-400" /> {lead.email}</span>
                {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-slate-400" /> {lead.phone}</span>}
              </p>
            </div>

            {/* QUICK STAGE SELECTOR */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Stage:</span>
              <select
                value={lead.status}
                onChange={(e) => handleStageChange(e.target.value as LeadStatus)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="requirement_pending">Requirement Pending</option>
                <option value="qualified">Qualified</option>
                <option value="quotation_sent">Quotation Sent</option>
                <option value="followup">Follow-up</option>
                <option value="negotiation">Negotiation</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="on_hold">On Hold</option>
                <option value="spam">Spam</option>
              </select>
            </div>
          </div>

          {/* ACTION BUTTONS ROW */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => setShowEmailForm(true)} className="bg-blue-600 text-white text-xs gap-1.5">
              <Send className="h-3.5 w-3.5" /> Send Email
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowFollowupForm(true)} className="text-xs gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-blue-600" /> Schedule Follow-up
            </Button>

            {lead.converted_client_id ? (
              <>
                <Button size="sm" onClick={() => onConvertToClient(lead)} className="bg-emerald-600 text-white text-xs gap-1.5 font-bold">
                  <Award className="h-3.5 w-3.5" /> View Client
                </Button>
                {onRevertToLead && (
                  <Button size="sm" variant="outline" onClick={() => onRevertToLead(lead)} className="text-xs gap-1.5 border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 font-semibold">
                    <RotateCcw className="h-3.5 w-3.5 text-amber-600" /> Revert to Lead
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => onCreateQuotation(lead)} className="text-xs gap-1.5 border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100">
                  <FileText className="h-3.5 w-3.5 text-emerald-600" /> Create Quotation
                </Button>
                <Button size="sm" variant="outline" onClick={() => onConvertToClient(lead)} className="text-xs gap-1.5 border-purple-300 text-purple-800 bg-purple-50 hover:bg-purple-100">
                  <Award className="h-3.5 w-3.5 text-purple-600" /> Convert to Client
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStageChange('won')}
              className={`text-xs gap-1 ${lead.status === 'won' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark Won
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStageChange('lost')}
              className={`text-xs gap-1 ${lead.status === 'lost' ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'}`}
            >
              <XCircle className="h-3.5 w-3.5" /> Mark Lost
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleToggleDNC}
              className={`text-xs gap-1 ${lead.is_do_not_contact ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Ban className="h-3.5 w-3.5" /> {lead.is_do_not_contact ? 'DNC Active' : 'Mark DNC'}
            </Button>
          </div>
        </div>

        {/* MODAL FORMS */}
        {showEmailForm && (
          <form onSubmit={handleSendWorkflowEmail} className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
            <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Send className="h-4 w-4 text-blue-600" /> Send Automated Workflow Email to {lead.email}
            </h4>
            <Field label="Select Email Template" required>
              <Select value={emailTemplate} onChange={(e) => setEmailTemplate(e.target.value as LeadEmailTemplateType)}>
                <option value="Lead Acknowledgement">Lead Acknowledgement</option>
                <option value="Requirement Request">Requirement Request</option>
                <option value="Quotation Sent">Quotation Sent</option>
                <option value="Follow-up 1">Follow-up 1</option>
                <option value="Follow-up 2">Follow-up 2</option>
                <option value="Final Follow-up">Final Follow-up</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowEmailForm(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={sendingEmail} className="bg-blue-600 text-white">
                {sendingEmail ? 'Sending...' : 'Send Email Now'}
              </Button>
            </div>
          </form>
        )}

        {showFollowupForm && (
          <form onSubmit={handleScheduleFollowup} className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
            <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-blue-600" /> Schedule Next Follow-up
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Follow-up Date" required>
                <input
                  type="date"
                  value={followupDate}
                  onChange={(e) => setFollowupDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  required
                />
              </Field>
              <Field label="Time">
                <input
                  type="time"
                  value={followupTime}
                  onChange={(e) => setFollowupTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </Field>
              <Field label="Follow-up Type" required>
                <Select value={followupType} onChange={(e) => setFollowupType(e.target.value as any)}>
                  <option value="call">Phone Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="task">Task / Review</option>
                </Select>
              </Field>
            </div>
            <Field label="Follow-up Note / Agenda">
              <TextInput
                value={followupNote}
                onChange={(e) => setFollowupNote(e.target.value)}
                placeholder="e.g. Call client to confirm technical requirements scope"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowFollowupForm(false)}>Cancel</Button>
              <Button type="submit" size="sm" className="bg-blue-600 text-white">Save Follow-up</Button>
            </div>
          </form>
        )}

        {/* SUB-TABS NAVIGATION */}
        <div className="flex border-b border-slate-200 text-xs font-semibold text-slate-600 gap-4 overflow-x-auto">
          {(['Overview', 'Requirements', 'Communication', 'Follow-ups', 'Quotations', 'Activity', 'Notes', 'Files'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`pb-2 transition border-b-2 whitespace-nowrap ${activeTab === t ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* TAB CONTENTS */}
        {activeTab === 'Overview' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-slate-200 p-4 bg-white">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Lead Contact Details</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Contact Person:</span><span className="font-semibold text-slate-900">{lead.contact_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Company Name:</span><span className="font-semibold text-slate-900">{lead.company_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Email Address:</span><span className="font-semibold text-blue-600">{lead.email}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Phone Number:</span><span className="font-semibold text-slate-900">{lead.phone || 'N/A'}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-500">Assigned Owner:</span>
                  <Select 
                    value={lead.assigned_to || ''} 
                    onChange={(e) => handleOwnerChange(e.target.value)}
                    className="w-[180px] text-xs font-semibold text-slate-900 py-1 px-2 h-auto"
                  >
                    <option value="">-- Unassigned --</option>
                    {teamMembers.map(tm => (
                      <option key={tm.id} value={tm.id}>{tm.full_name}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 p-4 bg-white">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Source & Campaign Attributes</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Lead Source:</span><span className="font-bold text-blue-700 capitalize">{(lead.source ?? 'other').replace('_', ' ')}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Source Detail:</span><span className="font-medium text-slate-800">{lead.source_detail || 'Contact Form'}</span></div>
                {lead.utm_source && <div className="flex justify-between"><span className="text-slate-500">UTM Source:</span><span className="font-mono text-slate-700">{lead.utm_source}</span></div>}
                {lead.utm_medium && <div className="flex justify-between"><span className="text-slate-500">UTM Medium:</span><span className="font-mono text-slate-700">{lead.utm_medium}</span></div>}
                {lead.utm_campaign && <div className="flex justify-between"><span className="text-slate-500">UTM Campaign:</span><span className="font-mono text-slate-700">{lead.utm_campaign}</span></div>}
                {lead.page_url && <div className="flex justify-between"><span className="text-slate-500">Landing Page:</span><span className="font-mono text-blue-600 truncate max-w-[180px]">{lead.page_url}</span></div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Requirements' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Interested Service & Scope</h4>
              <div className="text-xs font-semibold text-blue-800 bg-blue-50 p-2.5 rounded-lg border border-blue-100">
                {lead.interested_service_name || 'General Software / CRM Customization'}
              </div>
              <p className="text-xs text-slate-700 pt-2 whitespace-pre-wrap">{lead.requirement || 'No detailed requirements submitted.'}</p>
            </div>

            <CustomFieldsSection
              workspaceId={workspaceId}
              entityType="lead"
              entityId={lead.id}
              valuesMap={customValues}
              onChangeValues={(newVals) => {
                setCustomValues(newVals);
                onUpdateLead({ ...lead, custom_fields: newVals });
              }}
            />
          </div>
        )}

        {activeTab === 'Communication' && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Email Communication History</h4>
            <div className="space-y-2">
              {(lead.timeline_events || []).filter((e) => e.event_type === 'email_sent').length > 0 ? (
                (lead.timeline_events || []).filter((e) => e.event_type === 'email_sent').map((e) => (
                  <div key={e.id} className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 text-xs space-y-1">
                    <div className="flex justify-between font-bold text-blue-900">
                      <span>{e.title}</span>
                      <span className="text-slate-400 font-normal">{new Date(e.created_at).toLocaleString('en-IN')}</span>
                    </div>
                    <p className="text-slate-600">{e.description}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 italic">No emails sent yet for this lead.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'Follow-ups' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Scheduled Follow-up Details</h4>
              <Button size="sm" variant="outline" onClick={() => setShowFollowupForm(true)}>+ Schedule</Button>
            </div>
            {lead.next_followup_date ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-2 text-xs">
                <div className="flex justify-between font-bold text-blue-900">
                  <span>Next Date: {lead.next_followup_date} at {lead.next_followup_time || '10:00'}</span>
                  <span className="uppercase text-blue-700 font-bold">{lead.next_followup_type || 'call'}</span>
                </div>
                <p className="text-slate-700">{lead.next_followup_note || 'Follow up with client'}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No active follow-up scheduled.</p>
            )}
          </div>
        )}

        {activeTab === 'Quotations' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Linked Quotations</h4>
              {!isWon && <Button size="sm" onClick={() => onCreateQuotation(lead)}>+ Create Quotation</Button>}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs space-y-1">
              <div className="font-bold text-slate-900">Interested Service: {lead.interested_service_name || 'Software Project'}</div>
              <p className="text-slate-500">Quotation status linked with existing Quotation module.</p>
            </div>
          </div>
        )}

        {activeTab === 'Activity' && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <History className="h-4 w-4 text-blue-600" /> Activity & Audit Timeline
            </h4>
            <div className="space-y-3">
              {(lead.timeline_events || []).slice().reverse().map((evt) => (
                <div key={evt.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">{evt.title}</span>
                    <span className="text-[11px] text-slate-400">{new Date(evt.created_at).toLocaleString('en-IN')}</span>
                  </div>
                  {evt.description && <p className="text-xs text-slate-600 whitespace-pre-wrap">{evt.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'Notes' && (
          <div className="space-y-4">
            <form onSubmit={handleAddNote} className="space-y-2">
              <Field label="Add Internal Staff Note">
                <TextArea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Enter internal notes, conversation summaries, or team updates..."
                  rows={3}
                />
              </Field>
              <Button type="submit" size="sm" className="bg-blue-600 text-white text-xs">Add Note</Button>
            </form>

            {lead.notes && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Internal Notes Log</h4>
                <p className="text-xs text-slate-700 whitespace-pre-wrap font-sans">{lead.notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Files' && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Lead Attachments & Documents</h4>
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
              No files uploaded for this lead yet.
            </div>
          </div>
        )}
      </div>
  );

  if (inline) {
    return (
      <div className="h-full bg-white flex flex-col min-h-0">
        <div className="px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-lg font-bold text-slate-900">Lead 360° — {lead.lead_number || lead.contact_name}</h2>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          {content}
        </div>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Lead 360° — ${lead.lead_number || lead.contact_name}`} size="lg">
      {content}
    </Modal>
  );
}
