import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { useRouter } from '@/lib/router';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Lead, LeadStatus, LeadSource, LeadPriority, LeadActivityEvent } from '@/lib/types';
import {
  Button, Card, LoadingState, EmptyState, StatusBadge, PageHeader,
  TextInput, Select, Modal, ConfirmDialog, Field, TextArea
} from '@/components/ui';
import {
  Search, Plus, UserPlus, Mail, Phone,
  KanbanSquare, List, Sparkles, TrendingUp,
  Sliders, Calendar, Hash, CircleDot, Building, Tag,
  Inbox, CheckCircle2, ArrowRight, Clock, Award, XCircle,
  FileText, ShieldCheck, RefreshCw, Send, Globe, Share2, Layers, Filter, Upload,
  AlertTriangle, Trash2, ArrowUpDown
} from 'lucide-react';
import { Lead360Modal } from '@/components/Lead360Modal';
import { submitWebsiteLeadGateway, submitMetaLeadGateway } from '@/lib/leadGateway';
import { convertLeadCustomValuesToClient } from '@/lib/customFields';
import { convertLeadToClientAction, revertClientToLeadAction } from '@/lib/leadConversion';
import { validatePhoneNumber, findDuplicateLead } from '@/lib/contactValidation';

import { useAuth } from '@/lib/auth';

// Hard guard: the DB now allows NULL on email/company_name (and legacy rows can
// have NULL status/source), which crashed the page on `.replace()`/`.toLowerCase()`.
// Every lead is normalised here so no null string ever reaches a render path.
const LEAD_STRING_FIELDS = [
  'lead_number', 'contact_name', 'company_name', 'email', 'phone', 'whatsapp',
  'designation', 'city', 'state', 'country', 'requirement', 'notes',
  'source_detail', 'assigned_to', 'lost_reason', 'campaign_name', 'ingest_channel',
] as const;

function normalizeLead(raw: any): Lead {
  const l: any = { ...(raw || {}) };
  l.status = typeof l.status === 'string' && l.status ? l.status : 'new';
  l.source = typeof l.source === 'string' && l.source ? l.source : 'other';
  l.priority = typeof l.priority === 'string' && l.priority ? l.priority : 'medium';
  for (const f of LEAD_STRING_FIELDS) {
    if (l[f] === null || l[f] === undefined) l[f] = '';
    else if (typeof l[f] !== 'string') l[f] = String(l[f]);
  }
  if (!Array.isArray(l.timeline_events)) l.timeline_events = [];
  if (!Array.isArray(l.tags)) l.tags = [];
  if (!l.id) l.id = `tmp_${Math.random().toString(36).slice(2)}`;
  return l as Lead;
}

const STANDARDIZED_STAGES: { key: LeadStatus; label: string; color: string }[] = [
  { key: 'new', label: 'New', color: 'bg-blue-500' },
  { key: 'contacted', label: 'Contacted', color: 'bg-cyan-500' },
  { key: 'requirement_pending', label: 'Requirement Pending', color: 'bg-indigo-500' },
  { key: 'qualified', label: 'Qualified', color: 'bg-purple-500' },
  { key: 'quotation_sent', label: 'Quotation Sent', color: 'bg-orange-500' },
  { key: 'followup', label: 'Follow-up', color: 'bg-emerald-500' },
  { key: 'negotiation', label: 'Negotiation', color: 'bg-teal-500' },
  { key: 'won', label: 'Won', color: 'bg-green-600' },
  { key: 'lost', label: 'Lost', color: 'bg-rose-500' },
];

export function getCleanSourceDetail(source: LeadSource, detail?: string): string {
  if (detail && detail !== 'Web Form' && detail !== 'Website Enquiry') {
    return detail;
  }
  switch (source) {
    case 'website':
      return 'Contact Form';
    case 'facebook':
      return 'Lead Ad Campaign';
    case 'instagram':
      return 'Instagram Lead Ad';
    case 'email':
      return 'Inbound Sales Email';
    case 'phone':
      return 'Inbound Call';
    case 'referral':
      return 'Client / Partner Referral';
    case 'manual':
      return 'Manual Entry';
    case 'linkedin':
      return 'LinkedIn Outreach';
    case 'networking':
      return 'Networking Event';
    case 'walk_in':
      return 'Walk-in Client';
    case 'csv_import':
      return 'CSV Import';
    case 'whatsapp':
      return 'WhatsApp Inbound';
    default:
      return 'Inbound Enquiry';
  }
}

export function getFollowupBadge(dateStr?: string, timeStr?: string) {
  if (!dateStr) return <span className="text-[11px] text-slate-400 italic">No follow-up set</span>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 3600 * 24));

  if (diffDays < 0) {
    const daysAgo = Math.abs(diffDays);
    return (
      <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded">
        Overdue by {daysAgo} {daysAgo === 1 ? 'Day' : 'Days'}
      </span>
    );
  }

  if (diffDays === 0) {
    return (
      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
        Today{timeStr ? `, ${timeStr}` : ''}
      </span>
    );
  }

  if (diffDays === 1) {
    return (
      <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">
        Tomorrow{timeStr ? `, ${timeStr}` : ''}
      </span>
    );
  }

  if (diffDays <= 7) {
    return (
      <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded">
        This Week ({dateStr})
      </span>
    );
  }

  return (
    <span className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded">
      {dateStr}
    </span>
  );
}

const INITIAL_DEMO_LEADS: Lead[] = [
  {
    id: 'lead-demo-1',
    workspace_id: '',
    lead_number: 'LEAD-1001',
    contact_name: 'Rahul Sharma',
    company_name: 'Apex Innovations',
    email: 'rahul@apexinnovations.io',
    phone: '+91 98765 43210',
    status: 'new',
    source: 'website',
    source_detail: 'Contact Form',
    interested_service_name: 'Enterprise CRM & Automation Suite',
    requirement: 'Need multi-location CRM with billing and automated WhatsApp reminders.',
    priority: 'high',
    assigned_owner_name: 'Vikram Mehta (Sales)',
    last_contact_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    next_followup_date: new Date().toISOString().split('T')[0],
    next_followup_time: '11:00',
    next_followup_type: 'call',
    next_followup_note: 'Initial discovery and requirement call',
    page_url: 'https://example.com/contact',
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'crm_launch',
    timeline_events: [
      {
        id: 'evt-1',
        lead_id: 'lead-demo-1',
        workspace_id: '',
        event_type: 'web_enquiry',
        title: 'Website Enquiry Captured',
        description: 'Captured via website form',
        created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: 'lead-demo-2',
    workspace_id: '',
    lead_number: 'LEAD-1002',
    contact_name: 'Priya Verma',
    company_name: 'Zenith Logistics',
    email: 'priya@zenithlogistics.com',
    phone: '+91 98123 45678',
    status: 'quotation_sent',
    source: 'referral',
    source_detail: 'Client / Partner Referral',
    interested_service_name: 'Custom ERP & Fleet Management',
    requirement: 'Tracking 45 fleet vehicles with payment reconciliation.',
    priority: 'urgent',
    assigned_owner_name: 'Ananya Sharma (Senior Consultant)',
    last_contact_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    next_followup_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    next_followup_time: '14:30',
    next_followup_type: 'meeting',
    next_followup_note: 'Review sent proposal and negotiate SLA terms',
    timeline_events: [
      {
        id: 'evt-2',
        lead_id: 'lead-demo-2',
        workspace_id: '',
        event_type: 'quotation_sent',
        title: 'Quotation QTN-1042 Sent',
        description: 'Quotation sent for ₹4,80,000',
        created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'lead-demo-3',
    workspace_id: '',
    lead_number: 'LEAD-1003',
    contact_name: 'Vikram Singhania',
    company_name: 'Orbit Retail',
    email: 'vikram@orbitretail.in',
    phone: '+91 98111 22334',
    status: 'requirement_pending',
    source: 'facebook',
    source_detail: 'Lead Ad Campaign',
    interested_service_name: 'Retail POS & Inventory Management',
    requirement: 'Expanding to 5 new retail outlets in Bangalore.',
    priority: 'medium',
    assigned_owner_name: 'Rahul K. (Account Exec)',
    last_contact_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    next_followup_date: new Date(Date.now() - 86400000).toISOString().split('T')[0], // Overdue
    next_followup_time: '16:00',
    next_followup_type: 'email',
    next_followup_note: 'Request detailed store list and POS hardware specs',
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
];

export function LeadsList({ initialTab }: { initialTab?: string }) {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'Inbox' | 'Pipeline' | 'Followups' | 'Quotations'>(
    initialTab === 'pipeline' ? 'Pipeline' : 'Inbox'
  );

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'lead_number' | 'name'>('newest');

  // Lead 360 Modal State
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Manual Add Lead Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualFollowupDate, setManualFollowupDate] = useState('');
  const [manualFollowupTime, setManualFollowupTime] = useState('11:00');
  const [manualFollowupType, setManualFollowupType] = useState('call');
  const [manualFollowupNote, setManualFollowupNote] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [manualSource, setManualSource] = useState<LeadSource>('manual');
  const [manualService, setManualService] = useState('Enterprise CRM Solutions');
  const [manualRequirement, setManualRequirement] = useState('');
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [manualAssignedTo, setManualAssignedTo] = useState('');
  const [manualPhoneTouched, setManualPhoneTouched] = useState(false);
  const [allowDuplicateOverride, setAllowDuplicateOverride] = useState(false);

  // Validation rules for phone and duplicate checking
  const manualPhoneValidation = useMemo(
    () => validatePhoneNumber(manualPhone, { required: false, fieldLabel: 'Phone number' }),
    [manualPhone]
  );

  const duplicateCheckResult = useMemo(
    () => findDuplicateLead(leads, { email: manualEmail, phone: manualPhone }),
    [leads, manualEmail, manualPhone]
  );

  // Load Team Members with direct table & cache fallback
  const loadTeamMembers = useCallback(async () => {
    if (!activeWorkspace || !activeWorkspace.id) return;
    try {
      let teamList: any[] = [];
      const cacheKey = `k1_team_${activeWorkspace.id}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) teamList = JSON.parse(cached);
      } catch {
        // Ignore cache error
      }

      // 1. Try RPC get_workspace_users
      const { data: rpcData } = await supabase.rpc('get_workspace_users', { p_workspace_id: activeWorkspace.id });
      if (rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
        const combined = [...rpcData];
        teamList.forEach((tm) => {
          if (!combined.some((c) => c.id === tm.id)) combined.push(tm);
        });
        setTeamMembers(combined);
        return;
      }

      // 2. Direct fallback on workspace_members table
      const { data: membersData } = await supabase
        .from('workspace_members')
        .select('id, user_id, role, member_status')
        .eq('workspace_id', activeWorkspace.id);

      if (membersData && membersData.length > 0) {
        const formatted = membersData.map((m) => ({
          id: m.user_id || m.id,
          full_name: `${m.user_id ? m.user_id.slice(0, 8) : 'Member'} (${(m.role || 'team').replace('_', ' ')})`,
          email: m.user_id ? `${m.user_id.slice(0, 8)}@workspace` : '',
          role: m.role || 'team_member',
        }));
        formatted.forEach((tm) => {
          if (!teamList.some((c) => c.id === tm.id)) teamList.push(tm);
        });
      }

      setTeamMembers(teamList);
    } catch (err) {
      console.error('Error fetching team members:', err);
    }
  }, [activeWorkspace]);

  // Load Leads for Active Workspace
  const loadLeads = useCallback(async () => {
    try { localStorage.removeItem(`k1_leads_${activeWorkspace?.id}`); } catch (e) {}
    if (!activeWorkspace || !activeWorkspace.id) return;
    setLoading(true);

    let fetched: Lead[] = [];
    try {
      const sResp = await fetch(`/api/leads?workspace_id=${activeWorkspace.id}`);
      if (sResp.ok) {
        const sData = await sResp.json();
        if (sData.leads && sData.leads.length > 0) {
          fetched = sData.leads as Lead[];
        }
      }
    } catch {
      // Ignore server API error
    }

    try {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });
      if (data && data.length > 0) {
        fetched = [...fetched, ...(data as Lead[])];
      }
    } catch {
      // Ignore DB error
    }

    

    // Merge DB leads and cached leads cleanly
    let rawList = fetched;

    if (rawList.length === 0) {
      // Intentionally left empty so dummy leads are not populated
    }

    // Auto-deduplicate any duplicate entries (same non-demo lead_number, or same contact + phone/email)
    const seenDedupe = new Set<string>();
    const deduplicatedList: Lead[] = [];
    for (const l of rawList) {
      const numKey = l.lead_number?.trim().toUpperCase();
      const phoneDigits = (l.phone || '').replace(/\D/g, '');
      const cleanEmail = (l.email || '').trim().toLowerCase();
      const cleanName = (l.contact_name || '').trim().toLowerCase();

      // Deduplication key
      let key = '';
      if (phoneDigits.length >= 7) {
        key = `p_${cleanName}_${phoneDigits}`;
      } else if (cleanEmail && !cleanEmail.includes('website.local')) {
        key = `e_${cleanEmail}`;
      } else if (numKey && !numKey.includes('DEMO')) {
        key = `n_${numKey}_${cleanName}`;
      } else {
        key = `id_${l.id}`;
      }

      if (seenDedupe.has(key)) {
        continue; // Discard duplicate lead
      }
      seenDedupe.add(key);
      deduplicatedList.push(l);
    }

    // Update local cache with cleaned deduplicated leads
    

    setLeads(deduplicatedList.map(normalizeLead));
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => {
    loadLeads();
    loadTeamMembers();
    const handleRefresh = () => { loadLeads(); loadTeamMembers(); };
    window.addEventListener('focus', handleRefresh);
    window.addEventListener('k1_lead_captured', handleRefresh);
    window.addEventListener('storage', handleRefresh);
    return () => {
      window.removeEventListener('focus', handleRefresh);
      window.removeEventListener('k1_lead_captured', handleRefresh);
      window.removeEventListener('storage', handleRefresh);
    };
  }, [loadLeads]);

  const saveLeadsToStateAndCache = (updatedList: Lead[]) => {
    const safeList = updatedList.map(normalizeLead);
    setLeads(safeList);
    
  };

  const handleUpdateLead = (updatedLead: Lead) => {
    const nextList = leads.map((l) => (l.id === updatedLead.id ? updatedLead : l));
    saveLeadsToStateAndCache(nextList);
    if (selectedLead?.id === updatedLead.id) {
      setSelectedLead(updatedLead);
    }
  };

  const handleDeleteLead = async (lead: Lead) => {
    const leadLabel = lead.lead_number || lead.contact_name;
    if (!window.confirm(`Are you sure you want to delete lead ${leadLabel}? This cannot be undone.`)) {
      return;
    }
    try {
      if (supabase) {
        await supabase.from('leads').delete().eq('id', lead.id);
      }
      const nextList = leads.filter((l) => l.id !== lead.id);
      saveLeadsToStateAndCache(nextList);
      if (selectedLead?.id === lead.id) {
        setSelectedLead(null);
      }
    } catch (err) {
      console.error('Failed to delete lead:', err);
      alert('Could not delete lead from server.');
    }
  };

  const handleManualAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !manualName.trim() || !manualEmail.trim() || isAddingLead) return;

    setManualPhoneTouched(true);

    // Validate phone number
    if (!manualPhoneValidation.isValid) {
      alert(`Invalid Phone Number:\n${manualPhoneValidation.error}`);
      return;
    }

    // Duplicate check guard
    if (duplicateCheckResult.isDuplicate && !allowDuplicateOverride) {
      alert(`Duplicate Lead Warning:\n\n${duplicateCheckResult.warningMessage}\n\nPlease review the existing lead or check "Allow saving duplicate anyway" to proceed.`);
      return;
    }

    setIsAddingLead(true);
    try {
      const res = await submitWebsiteLeadGateway({
        workspace_id: activeWorkspace.id,
        name: manualName.trim(),
        email: manualEmail.trim(),
        phone: manualPhone.trim(),
        company: manualCompany.trim(),
        service: manualService,
        requirement: manualRequirement.trim(),
        page_url: 'Manual Entry in Kanishk One CRM',
        form_id: 'manual_add_form',
        utm_source: manualSource,
        assigned_to: manualAssignedTo || undefined,
        assigned_owner_name: manualAssignedTo ? teamMembers.find(tm => tm.id === manualAssignedTo)?.full_name : undefined,
        allow_duplicate: allowDuplicateOverride,
        reject_if_duplicate: !allowDuplicateOverride,
          next_followup_date: manualFollowupDate || undefined,
        next_followup_time: manualFollowupTime || undefined,
        next_followup_type: manualFollowupType as any,
        next_followup_note: manualFollowupNote || undefined,
      });

      if (res.success) {
        await loadLeads();
        setShowAddModal(false);
        setManualName('');
        setManualEmail('');
        setManualPhone('');
        setManualCompany('');
        setManualRequirement('');
        setManualPhoneTouched(false);
        setManualFollowupDate('');
        setManualFollowupTime('11:00');
        setManualFollowupType('call');
        setManualFollowupNote('');
        setAllowDuplicateOverride(false);
      } else {
        alert(`Could not add lead: ${res.message}`);
      }
    } finally {
      setIsAddingLead(false);
    }
  };

  const handleCreateQuotationForLead = (lead: Lead) => {
    setSelectedLead(null);
    navigate(`/quotations/new?lead_id=${lead.id}&client_name=${encodeURIComponent(lead.contact_name)}&company=${encodeURIComponent(lead.company_name)}&email=${encodeURIComponent(lead.email)}&phone=${encodeURIComponent(lead.phone || '')}&service=${encodeURIComponent(lead.interested_service_name || '')}`);
  };

  const handleConvertLeadToClient = async (lead: Lead) => {
    if (!activeWorkspace || !activeWorkspace.id) return;

    if (lead.converted_client_id) {
      alert('This lead has already been converted to a client.');
      navigate(`/clients/${lead.converted_client_id}`);
      return;
    }

    const confirmConvert = window.confirm(`Convert this lead to a client?`);
    if (!confirmConvert) return;

    const res = await convertLeadToClientAction(activeWorkspace.id, lead, user?.id);

    if (res.success && res.client) {
      const updatedLead: Lead = {
        ...lead,
        status: 'won',
        converted_client_id: res.client.id,
        updated_at: new Date().toISOString(),
      };
      handleUpdateLead(updatedLead);

      alert('Lead successfully converted to Client.');
      navigate(`/clients/${res.client.id}`);
    } else {
      alert(res.message || 'Failed to convert lead.');
    }
  };

  const handleRevertLeadFromClient = async (lead: Lead) => {
    if (!activeWorkspace || !lead.converted_client_id) return;

    const confirmRevert = window.confirm(`Are you sure you want to revert this Client back to a Lead?`);
    if (!confirmRevert) return;

    const res = await revertClientToLeadAction(activeWorkspace.id, lead, user?.id);

    if (res.success && res.updatedLead) {
      handleUpdateLead(res.updatedLead);
      if (selectedLead && selectedLead.id === lead.id) {
        setSelectedLead(res.updatedLead);
      }
      alert('Client successfully reverted to Lead.');
    } else {
      alert(res.message || 'Could not revert client.');
    }
  };

  // Filtered and Sorted Leads
  const filteredLeads = useMemo(() => {
    const list = leads.filter((l) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (l.contact_name ?? '').toLowerCase().includes(q);
        const matchCompany = (l.company_name ?? '').toLowerCase().includes(q);
        const matchEmail = (l.email ?? '').toLowerCase().includes(q);
        const matchPhone = (l.phone || '').includes(q);
        const matchNum = (l.lead_number || '').toLowerCase().includes(q);
        if (!matchName && !matchCompany && !matchEmail && !matchPhone && !matchNum) return false;
      }

      if (selectedSource !== 'all' && l.source !== selectedSource) return false;
      if (selectedStage !== 'all' && l.status !== selectedStage) return false;

      if (selectedStage === 'all' && (l.status === 'won' || l.status === 'lost') && !searchQuery.trim()) return false;

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      }
      if (sortBy === 'lead_number') {
        const numA = parseInt((a.lead_number || '').replace(/\D/g, '') || '0', 10);
        const numB = parseInt((b.lead_number || '').replace(/\D/g, '') || '0', 10);
        return numB - numA;
      }
      if (sortBy === 'name') {
        return (a.contact_name || '').localeCompare(b.contact_name || '');
      }
      return 0;
    });

    return list;
  }, [leads, searchQuery, selectedSource, selectedStage, sortBy]);

  // Follow-up Queue Categorization
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const dueTodayLeads = useMemo(() => filteredLeads.filter((l) => {
    const d = l.next_followup_date ? String(l.next_followup_date).split('T')[0] : null;
    return (d === todayStr || l.status === 'followup') && l.status !== 'won' && l.status !== 'lost';
  }), [filteredLeads, todayStr]);
  const overdueLeads = useMemo(() => filteredLeads.filter((l) => {
    const d = l.next_followup_date ? String(l.next_followup_date).split('T')[0] : null;
    return d && d < todayStr && l.status !== 'won' && l.status !== 'lost';
  }), [filteredLeads, todayStr]);
  const upcomingLeads = useMemo(() => filteredLeads.filter((l) => {
    const d = l.next_followup_date ? String(l.next_followup_date).split('T')[0] : null;
    return d && d > todayStr && l.status !== 'won' && l.status !== 'lost';
  }), [filteredLeads, todayStr]);

  let isDraggingLead = false;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, leadId: string) => {
    isDraggingLead = true;
    e.dataTransfer.setData('leadId', leadId);
  };

  const handleDragEnd = () => {
    setTimeout(() => { isDraggingLead = false; }, 150);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // necessary to allow dropping
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, stageKey: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    if (!leadId) return;

    const leadToMove = leads.find(l => l.id === leadId);
    if (!leadToMove || leadToMove.status === stageKey) return;

    // Optimistic update
    const updatedLead = { ...leadToMove, status: stageKey as any };
    setLeads(prev => prev.map(l => l.id === leadId ? updatedLead : l));

    try {
      const { error } = await supabase.from('leads').update({ status: stageKey }).eq('id', leadId);
      if (error) {
        console.error("Error updating lead status:", error);
        // Revert on error
        setLeads(prev => prev.map(l => l.id === leadId ? leadToMove : l));
      }
    } catch (err) {
      console.error(err);
      setLeads(prev => prev.map(l => l.id === leadId ? leadToMove : l));
    }
  };

  if (loading) return <LoadingState message="Loading Universal Lead Inbox..." />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Management"
        description="Single central inbox for every website, ad, email, manual and referral enquiry in this workspace."
        actions={
          <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 text-white gap-2">
            <Plus className="h-4 w-4" /> Add Lead
          </Button>
        }
      />

      {/* METRICS DASHBOARD CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4 border-slate-200 bg-white space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Leads</span>
            <Inbox className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">{leads.length}</div>
          <div className="text-[11px] text-slate-500">All inbound channels</div>
        </Card>

        <Card className="p-4 border-slate-200 bg-white space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>New Enquiries</span>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-600">{leads.filter((l) => l.status === 'new').length}</div>
          <div className="text-[11px] text-amber-700 font-medium">Needs initial qualification</div>
        </Card>

        <Card className="p-4 border-slate-200 bg-white space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Follow-ups Due</span>
            <Clock className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-600">{dueTodayLeads.length + overdueLeads.length}</div>
          <div className="text-[11px] text-rose-700 font-medium">{overdueLeads.length} Overdue</div>
        </Card>

        <Card className="p-4 border-slate-200 bg-white space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Quotations Sent</span>
            <FileText className="h-4 w-4 text-purple-600" />
          </div>
          <div className="text-xl font-bold text-purple-700">{leads.filter((l) => l.status === 'quotation_sent' || l.status === 'quotation_draft').length}</div>
          <div className="text-[11px] text-slate-500">Active proposals</div>
        </Card>

        <Card className="p-4 border-slate-200 bg-white space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Won Clients</span>
            <Award className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-700">{leads.filter((l) => l.status === 'won').length}</div>
          <div className="text-[11px] text-emerald-700 font-medium">Converted to Clients</div>
        </Card>
      </div>

      {/* NAVIGATION TABS (4 Sales Tabs) */}
      <div className="flex border-b border-slate-200 text-sm font-semibold text-slate-600 gap-6">
        <button
          onClick={() => { setActiveTab('Inbox'); setSelectedLead(null); }}
          className={`pb-3 transition border-b-2 flex items-center gap-2 ${activeTab === 'Inbox' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'}`}
        >
          <Inbox className="h-4 w-4" /> Lead Inbox ({filteredLeads.length})
        </button>
        <button
          onClick={() => { setActiveTab('Pipeline'); setSelectedLead(null); }}
          className={`pb-3 transition border-b-2 flex items-center gap-2 ${activeTab === 'Pipeline' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'}`}
        >
          <KanbanSquare className="h-4 w-4" /> Pipeline Board
        </button>
        <button
          onClick={() => { setActiveTab('Followups'); setSelectedLead(null); }}
          className={`pb-3 transition border-b-2 flex items-center gap-2 ${activeTab === 'Followups' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'}`}
        >
          <Calendar className="h-4 w-4" /> Follow-ups ({dueTodayLeads.length + overdueLeads.length + upcomingLeads.length})
        </button>
        <button
          onClick={() => { setActiveTab('Quotations'); setSelectedLead(null); }}
          className={`pb-3 transition border-b-2 flex items-center gap-2 ${activeTab === 'Quotations' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'}`}
        >
          <FileText className="h-4 w-4" /> Quotations Pending
        </button>
      </div>

      {/* SEARCH AND FILTERS TOOLBAR */}
      <Card className="p-4 border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <TextInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search leads by name, company, email, phone, or LEAD-ID..."
              className="pl-9 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Filter className="h-3.5 w-3.5 text-slate-400" /> Source:
              <Select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)} className="w-36 text-xs">
                <option value="all">All Sources</option>
                <option value="website">Website</option>
                <option value="facebook">Facebook Lead Ads</option>
                <option value="instagram">Instagram Lead Ads</option>
                <option value="email">Email</option>
                <option value="manual">Manual Entry</option>
                <option value="referral">Referral</option>
                <option value="phone">Phone Call</option>
              </Select>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <span>Stage:</span>
              <Select value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)} className="w-40 text-xs">
                <option value="all">All Stages</option>
                {STANDARDIZED_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </Select>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" /> Sort:
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-40 text-xs">
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="lead_number">Lead Number</option>
                <option value="name">Contact Name</option>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {/* TAB 1: LEAD INBOX MASTER-DETAIL */}
      {activeTab === 'Inbox' && (
        <Card className="border-slate-200 overflow-hidden flex h-[750px]">
          {/* LEFT: MASTER LIST */}
          <div className="w-full md:w-[350px] shrink-0 border-r border-slate-200 bg-slate-50/50 flex flex-col">
            <div className="p-3 border-b border-slate-200 bg-white shadow-sm z-10 shrink-0 flex items-center justify-between">
               <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{filteredLeads.length} Leads</span>
               <span className="text-[11px] text-slate-500 font-medium">Sorted: {sortBy.replace('_', ' ')}</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => {
                  const isSelected = selectedLead?.id === lead.id;
                  return (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`w-full text-left p-3 rounded-xl border transition flex flex-col gap-1.5 ${
                        isSelected 
                          ? 'bg-blue-50 border-blue-200 shadow-sm' 
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 w-full">
                        <h3 className={`truncate font-bold text-sm ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>
                          {lead.contact_name}
                        </h3>
                        <StatusBadge status={lead.status} />
                      </div>
                      
                      {lead.company_name && (
                        <div className="text-xs font-medium text-slate-600 truncate">{lead.company_name}</div>
                      )}
                      
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-mono">
                        {lead.lead_number || lead.id}
                      </div>

                      <div className="flex items-center justify-between mt-1 pt-2 border-t border-slate-100/80">
                         <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 capitalize">
                           {(lead.source ?? 'other').replace('_', ' ')}
                         </span>
                         <div className="flex items-center gap-2">
                           <span className="text-[10px] text-slate-500 font-medium">
                             {lead.assigned_owner_name || 'Unassigned'}
                           </span>
                           <span
                             title="Delete Lead"
                             onClick={(e) => {
                               e.stopPropagation();
                               handleDeleteLead(lead);
                             }}
                             className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                           >
                             <Trash2 className="h-3.5 w-3.5" />
                           </span>
                         </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-6 text-center text-slate-500 text-xs">
                  No Leads Found matching criteria.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: DETAIL VIEW */}
          <div className="flex-1 bg-white min-w-0 flex flex-col relative">
            {!selectedLead ? (
               <div className="flex-1 flex flex-col items-center justify-center p-8">
                 <EmptyState
                   icon={<Inbox className="h-12 w-12 text-slate-300" />}
                   title="Select a lead"
                   description="Choose a lead from the inbox to view their 360° profile, schedule follow-ups, and convert to client."
                 />
               </div>
            ) : (
              <Lead360Modal
                open={!!selectedLead}
                onClose={() => setSelectedLead(null)}
                lead={selectedLead}
                workspaceId={activeWorkspace?.id || ''}
                onUpdateLead={(updated) => {
                  handleUpdateLead(updated);
                  setSelectedLead(updated); // ensure right pane updates
                }}
                onCreateQuotation={handleCreateQuotationForLead}
                onConvertToClient={handleConvertLeadToClient}
                onRevertToLead={handleRevertLeadFromClient}
                teamMembers={teamMembers}
                inline={true}
              />
            )}
          </div>
        </Card>
      )}

      {/* TAB 2: PIPELINE KANBAN BOARD */}
      {activeTab === 'Pipeline' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-[1600px]">
            {STANDARDIZED_STAGES.map((stage) => {
              const stageLeads = filteredLeads.filter((l) => l.status === stage.key);

              return (
                <div 
                  key={stage.key} 
                  className="w-72 flex-shrink-0 bg-slate-100/70 rounded-xl p-3 space-y-3 border border-slate-200"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, stage.key)}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{stage.label}</h4>
                    </div>
                    <span className="rounded bg-white px-2 py-0.5 text-xs font-bold text-slate-700 shadow-sm">{stageLeads.length}</span>
                  </div>

                  <div className="space-y-3 min-h-[300px]">
                    {stageLeads.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => {
                          (window as any).isDraggingLead = true;
                          handleDragStart(e, lead.id);
                        }}
                        onDragEnd={() => {
                          setTimeout(() => { (window as any).isDraggingLead = false; }, 150);
                        }}
                        className="cursor-grab active:cursor-grabbing"
                      >
                        <Card
                          onClick={(e) => {
                            if ((window as any).isDraggingLead) {
                              e.preventDefault();
                              e.stopPropagation();
                              return;
                            }
                            setSelectedLead(lead);
                          }}
                          className="p-3.5 border-slate-200 bg-white hover:border-blue-400 hover:shadow-md transition space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-blue-700">{lead.lead_number || lead.id.substring(0,8)}</span>
                            <span className="text-[10px] font-bold text-slate-500 capitalize">{lead.source}</span>
                          </div>
                          <div className="font-bold text-slate-900 text-xs">{lead.contact_name}</div>
                          <div className="text-[11px] text-slate-500 font-medium">{lead.company_name}</div>
                          <div className="text-[11px] font-semibold text-slate-700 bg-slate-50 p-1.5 rounded border border-slate-100">
                            {lead.interested_service_name || 'CRM / ERP Enquiry'}
                          </div>
                          {lead.next_followup_date && (
                            <div className="text-[10px] font-semibold text-blue-600 flex items-center gap-1 pt-1">
                              <Clock className="h-3 w-3" /> Next: {lead.next_followup_date}
                            </div>
                          )}
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: FOLLOW-UPS QUEUE */}
      {activeTab === 'Followups' && (
        <div className="space-y-5">
          {overdueLeads.length > 0 && (
            <Card className="p-4 border-rose-200 bg-rose-50/50 space-y-3">
              <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-2">
                <Clock className="h-4 w-4 text-rose-600" /> Overdue Follow-ups ({overdueLeads.length})
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {overdueLeads.map((l) => (
                  <Card key={l.id} onClick={() => setSelectedLead(l)} className="p-3 bg-white border-rose-200 cursor-pointer hover:border-rose-400 space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-900">
                      <span>{l.contact_name}</span>
                      <span className="text-rose-600 font-bold">{l.next_followup_date ? String(l.next_followup_date).split('T')[0] : ''}</span>
                    </div>
                    <div className="text-xs text-slate-600 font-medium">{l.company_name}</div>
                    <div className="text-[11px] text-rose-700 italic">{l.next_followup_note || 'Follow up call required'}</div>
                  </Card>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4 border-blue-200 bg-blue-50/30 space-y-3">
            <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" /> Follow-ups Due Today ({dueTodayLeads.length})
            </h4>
            {dueTodayLeads.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {dueTodayLeads.map((l) => (
                  <Card key={l.id} onClick={() => setSelectedLead(l)} className="p-3 bg-white border-blue-200 cursor-pointer hover:border-blue-400 space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-900">
                      <span>{l.contact_name}</span>
                      <span className="text-blue-600 font-bold">{l.next_followup_time || 'Today'}</span>
                    </div>
                    <div className="text-xs text-slate-600 font-medium">{l.company_name}</div>
                    <div className="text-[11px] text-slate-600 italic">{l.next_followup_note || 'Call client'}</div>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No follow-ups due today.</p>
            )}
          </Card>

          {upcomingLeads.length > 0 && (
            <Card className="p-4 border-slate-200 bg-slate-50/50 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" /> Upcoming Follow-ups ({upcomingLeads.length})
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingLeads.map((l) => (
                  <Card key={l.id} onClick={() => setSelectedLead(l)} className="p-3 bg-white border-slate-200 cursor-pointer hover:border-slate-400 space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-900">
                      <span>{l.contact_name}</span>
                      <span className="text-slate-600 font-bold">{l.next_followup_date ? String(l.next_followup_date).split('T')[0] : ''}</span>
                    </div>
                    <div className="text-xs text-slate-600 font-medium">{l.company_name}</div>
                    <div className="text-[11px] text-slate-500 italic">{l.next_followup_note || 'Scheduled follow-up'}</div>
                  </Card>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 4: QUOTATIONS PENDING */}
      {activeTab === 'Quotations' && (
        <Card className="p-4 border-slate-200 bg-white space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-purple-600" /> Leads Pending Quotations & Proposals
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Leads requiring scope drafting or quotation follow-up.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leads.filter((l) => l.status === 'quotation_sent' || l.status === 'quotation_draft' || l.status === 'qualified').map((l) => (
              <Card key={l.id} className="p-4 border-purple-100 bg-purple-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{l.contact_name}</span>
                  <StatusBadge status={l.status} />
                </div>
                <div className="text-xs text-slate-600 font-medium">{l.company_name}</div>
                <div className="text-xs text-purple-900 bg-white p-2 rounded border border-purple-100 font-semibold">
                  {l.interested_service_name || 'Custom CRM Project'}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setSelectedLead(l)}>View 360°</Button>
                  <Button size="sm" onClick={() => handleCreateQuotationForLead(l)} className="bg-purple-600 text-white">Create Quotation</Button>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}

      {/* LEAD 360 MODAL (For non-inbox tabs) */}
      {selectedLead && activeTab !== 'Inbox' && (
        <Lead360Modal
          open={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          lead={selectedLead}
          workspaceId={activeWorkspace?.id || ''}
          onUpdateLead={handleUpdateLead}
          onCreateQuotation={handleCreateQuotationForLead}
          onConvertToClient={handleConvertLeadToClient}
          onRevertToLead={handleRevertLeadFromClient}
          teamMembers={teamMembers}
        />
      )}

      {/* MANUAL ADD LEAD MODAL */}
      {showAddModal && (
        <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Manual Lead Entry" size="md" preventEscape={true}>
          <form
            onSubmit={handleManualAddLead}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                e.preventDefault();
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Contact Person Name" required>
                <TextInput value={manualName} onChange={(e) => setManualName(e.target.value)} required autoFocus />
              </Field>
              <Field label="Email Address" required>
                <TextInput type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} required />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field 
                label="Phone Number" 
                error={manualPhoneTouched && !manualPhoneValidation.isValid ? manualPhoneValidation.error : undefined}
              >
                <TextInput 
                  value={manualPhone} 
                  onChange={(e) => {
                    setManualPhoneTouched(true);
                    setManualPhone(e.target.value);
                  }}
                  onBlur={() => setManualPhoneTouched(true)}
                  placeholder="+91 98765 43210" 
                />
              </Field>
              <Field label="Company Name">
                <TextInput value={manualCompany} onChange={(e) => setManualCompany(e.target.value)} />
              </Field>
            </div>

            {/* DUPLICATE LEAD WARNING BANNER */}
            {duplicateCheckResult.isDuplicate && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-800">
                        Duplicate Lead Detected (Matching {duplicateCheckResult.matchedBy === 'both' ? 'Email & Phone' : duplicateCheckResult.matchedBy === 'email' ? 'Email' : 'Phone'})
                      </span>
                      {duplicateCheckResult.matchedLead && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLead(duplicateCheckResult.matchedLead);
                            setShowAddModal(false);
                          }}
                          className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                        >
                          View Existing Lead →
                        </button>
                      )}
                    </div>
                    <p className="text-amber-800 leading-relaxed">{duplicateCheckResult.warningMessage}</p>
                    <label className="flex items-center gap-2 pt-1 font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowDuplicateOverride}
                        onChange={(e) => setAllowDuplicateOverride(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>I understand this is a duplicate. Allow saving duplicate anyway.</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Lead Source">
                <Select value={manualSource} onChange={(e) => setManualSource(e.target.value as any)}>
                  <option value="manual">Manual Entry</option>
                  <option value="referral">Referral</option>
                  <option value="phone">Phone Call</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="networking">Networking Event</option>
                  <option value="walk_in">Walk-in</option>
                </Select>
              </Field>
              <Field label="Interested Service">
                <TextInput value={manualService} onChange={(e) => setManualService(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Assign To Team">
                <Select value={manualAssignedTo} onChange={(e) => setManualAssignedTo(e.target.value)}>
                  <option value="">-- Select Owner --</option>
                  {teamMembers.map(tm => (
                    <option key={tm.id} value={tm.id}>{tm.full_name} ({tm.role})</option>
                  ))}
                </Select>
              </Field>
              <Field label="Next Follow-up Date">
                <TextInput type="date" value={manualFollowupDate} onChange={(e) => setManualFollowupDate(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Follow-up Time">
                <TextInput type="time" value={manualFollowupTime} onChange={(e) => setManualFollowupTime(e.target.value)} />
              </Field>
              <Field label="Follow-up Type">
                <Select value={manualFollowupType} onChange={(e) => setManualFollowupType(e.target.value)}>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="whatsapp">WhatsApp</option>
                </Select>
              </Field>
              <Field label="Follow-up Note">
                <TextInput placeholder="E.g. Discuss pricing" value={manualFollowupNote} onChange={(e) => setManualFollowupNote(e.target.value)} />
              </Field>
            </div>

            <Field label="Requirement Details">
              <TextArea value={manualRequirement} onChange={(e) => setManualRequirement(e.target.value)} rows={3} />
            </Field>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button 
                type="submit" 
                disabled={isAddingLead || !manualPhoneValidation.isValid || (duplicateCheckResult.isDuplicate && !allowDuplicateOverride)}
                className="bg-blue-600 text-white disabled:opacity-50"
              >
                {isAddingLead 
                  ? 'Saving Lead...' 
                  : (duplicateCheckResult.isDuplicate && !allowDuplicateOverride ? 'Duplicate Lead Detected' : 'Save Lead')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
