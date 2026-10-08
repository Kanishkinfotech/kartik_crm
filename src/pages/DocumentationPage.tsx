import React, { useState } from 'react';
import { Card, PageHeader, Button } from '@/components/ui';
import { 
  BookOpen, Code, Zap, Globe, Share2, Layers, CheckCircle2, 
  Copy, FileText, ArrowRight, Server, ShieldCheck, Terminal
} from 'lucide-react';
import { downloadWordPressPlugin } from '@/lib/downloadPlugin';

export function DocumentationPage() {
  const [activeTab, setActiveTab] = useState<'quickstart' | 'integrations' | 'automations' | 'api'>('quickstart');
  const [copiedKey, setCopiedKey] = useState(false);

  const ingestUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/wordpress` : '/api/webhooks/wordpress';

  const copyUrl = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <PageHeader
        title="Documentation & Integration Hub"
        description="Comprehensive guide for navigating the CRM, configuring workflow automations, and capturing third-party leads."
      />

      {/* TABS */}
      <div className="flex border-b border-slate-200 text-sm font-semibold text-slate-600 gap-6">
        <button
          onClick={() => setActiveTab('quickstart')}
          className={`pb-3 transition border-b-2 flex items-center gap-2 ${
            activeTab === 'quickstart' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'
          }`}
        >
          <BookOpen className="h-4 w-4" /> Quickstart & Core CRM
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`pb-3 transition border-b-2 flex items-center gap-2 ${
            activeTab === 'integrations' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Globe className="h-4 w-4" /> Third-Party Integrations
        </button>
        <button
          onClick={() => setActiveTab('automations')}
          className={`pb-3 transition border-b-2 flex items-center gap-2 ${
            activeTab === 'automations' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Zap className="h-4 w-4" /> Automations & Nodes
        </button>
        <button
          onClick={() => setActiveTab('api')}
          className={`pb-3 transition border-b-2 flex items-center gap-2 ${
            activeTab === 'api' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Code className="h-4 w-4" /> Webhook API Reference
        </button>
      </div>

      {/* TAB 1: QUICKSTART */}
      {activeTab === 'quickstart' && (
        <div className="space-y-6">
          <Card className="p-6 space-y-4 border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" /> CRM Navigation & Dashboard vs Reports
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 space-y-2">
                <span className="font-bold text-blue-900 text-sm">⚡ Dashboard (/dashboard)</span>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Real-time operational command center. Use this daily to view active lead counts, today's due follow-up tasks, overdue actions, and immediate shortcuts.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-100 space-y-2">
                <span className="font-bold text-purple-900 text-sm">📊 Reports (/reports)</span>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Analytical & historical performance insight. View total monthly automation runs, success rates, failure logs, and estimated time saved.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <h4 className="font-bold text-sm text-slate-800">Core Features Overview</h4>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Universal Lead Inbox (/leads):</strong> Single central inbox for website, ad, email, and manual leads with automatic duplicate matching.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>PDF Documents:</strong> Instantly generate and download A4 PDF quotations and invoices formatted with tax breakdowns (CGST/SGST/IGST).</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>My Tasks vs Tasks:</strong> "My Tasks" filters only your assigned work, while "Tasks" provides full team project oversight.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Team Roles:</strong> Manage Owners, Admins, Sales, PMs, and Team Members with granular permissions.</span>
                </li>
              </ul>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: THIRD PARTY INTEGRATIONS */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          <Card className="p-6 space-y-4 border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Globe className="h-5 w-5 text-blue-600" /> Connecting Third-Party Lead Sources
                </h3>
                <p className="text-xs text-slate-500">Connect n8n, Zapier, Meta (Facebook/Instagram), Webflow, or custom forms directly.</p>
              </div>
            </div>

            {/* Universal Ingest URL Box */}
            <div className="p-4 rounded-xl bg-slate-50 border border-blue-200 space-y-2">
              <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">Universal Ingest Endpoint</span>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white border border-slate-200 rounded-lg p-2.5 font-mono text-xs text-blue-700 font-bold select-all break-all">
                  {ingestUrl}
                </div>
                <Button size="sm" variant="outline" onClick={() => copyUrl(ingestUrl)}>
                  <Copy className="h-4 w-4 mr-1" /> {copiedKey ? 'Copied!' : 'Copy Endpoint'}
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                Include your Workspace API Key in the <code className="font-mono text-blue-700">X-K1-Ingest-Key</code> header or payload.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* n8n / Zapier */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-orange-500" /> n8n &amp; Zapier
                </div>
                <p className="text-xs text-slate-600">
                  Add an HTTP Request / Webhook node in n8n or Zapier pointing to the Ingest Endpoint with POST method.
                </p>
              </div>

              {/* Meta Lead Ads */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-blue-600" /> Meta Lead Ads
                </div>
                <p className="text-xs text-slate-600">
                  Connect Facebook Page forms or Instagram Instant Forms. Forward leads to the Ingest Endpoint with <code className="font-mono text-[10px]">utm_source: facebook</code>.
                </p>
              </div>

              {/* WordPress */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-indigo-600" /> WordPress Plugin
                </div>
                <p className="text-xs text-slate-600 mb-2">
                  Upload the official plugin to WordPress to forward CF7, Elementor, and WPForms automatically.
                </p>
                <Button size="sm" variant="outline" onClick={() => downloadWordPressPlugin()} className="w-full text-xs">
                  Download Plugin (.zip)
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: AUTOMATIONS */}
      {activeTab === 'automations' && (
        <div className="space-y-6">
          <Card className="p-6 space-y-4 border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" /> Workflow & Visual Automations
            </h3>
            
            <p className="text-xs text-slate-600 leading-relaxed">
              Create automated execution rules for your team under <strong>Automations (/automations)</strong>.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <span className="font-bold text-slate-900 text-sm">Visual Flow Editor (Node Graph)</span>
                <p className="text-xs text-slate-600">
                  Interactive drag-and-drop canvas (n8n/Zapier style) allowing you to connect Trigger, Action, Condition, and Delay nodes.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <span className="font-bold text-slate-900 text-sm">Custom Delay Timings</span>
                <p className="text-xs text-slate-600">
                  Set precise wait durations before sending follow-up emails or assigning tasks. Units supported: <strong>Minutes, Hours, Days, Weeks, Months</strong>.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: API REFERENCE */}
      {activeTab === 'api' && (
        <div className="space-y-6">
          <Card className="p-6 space-y-4 border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Code className="h-5 w-5 text-emerald-600" /> Webhook API Code Snippets
            </h3>

            <div className="space-y-3">
              <span className="font-bold text-xs text-slate-700 uppercase tracking-wider">cURL Command</span>
              <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">
{`curl -X POST "${ingestUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-K1-Ingest-Key: YOUR_WORKSPACE_API_KEY" \\
  -d '{
    "name": "Rahul Sharma",
    "email": "rahul@example.com",
    "phone": "+919876543210",
    "company": "Apex Corp",
    "service": "CRM Development",
    "requirement": "Need custom lead capture setup"
  }'`}
              </pre>
            </div>

            <div className="space-y-3 pt-2">
              <span className="font-bold text-xs text-slate-700 uppercase tracking-wider">Node.js / JavaScript Fetch</span>
              <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">
{`await fetch("${ingestUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-K1-Ingest-Key": "YOUR_WORKSPACE_API_KEY"
  },
  body: JSON.stringify({
    name: "Priya Verma",
    email: "priya@example.com",
    phone: "9812345678",
    requirement: "Enquiry from React application"
  })
});`}
              </pre>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
