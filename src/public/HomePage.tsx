import { useEffect, useState } from 'react';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import { 
  Building2, 
  ArrowRight, 
  Zap, 
  Users, 
  FileText, 
  CheckCircle2, 
  BarChart3, 
  ShieldCheck, 
  Globe, 
  Bot, 
  Sparkles, 
  Clock, 
  CreditCard, 
  ArrowUpRight, 
  ChevronRight, 
  Check, 
  HelpCircle, 
  Send,
  MessagesSquare,
  FolderKanban,
  ListTodo,
  UserPlus,
  Receipt,
  Package,
  ClipboardList,
  UsersRound,
  Workflow,
  Sliders,
  CheckCircle,
  Play
} from 'lucide-react';
import { PublicHeader } from './PublicHeader';

export function HomePage() {
  const { navigate } = useRouter();
  const { session, loginAsDemo } = useAuth();
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'leads' | 'quotes' | 'projects' | 'automations' | 'communication'>('leads');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    if (!session?.user) return;
    
    // Check if user is admin
    supabase.from('platform_admins').select('id').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setIsAdmin(true);
      });
  }, [session]);

  const handleOpenUserPanel = () => {
    loginAsDemo();
    navigate('/dashboard');
  };

  const faqItems = [
    {
      q: "How does the WordPress lead intake gateway work?",
      a: "Under Settings > Integrations in your User Panel, you get a unique webhook URL. Paste this URL into Elementor Forms, Contact Form 7, WPForms, or any custom API. Inbound submissions create rich lead records in real-time."
    },
    {
      q: "How are GST Quotations and Invoices created?",
      a: "The Quotations and Invoices modules let you add custom line items, specify unit rates, and apply CGST, SGST, or IGST tax rates. You can download formatted PDF documents or send them directly via email to your client."
    },
    {
      q: "What project management tools are included in the User Panel?",
      a: "You get full Project management with progress percentages, milestone tracking, team task Kanban boards (with Low, High, Urgent priority flags), assigned task filters, and daily employee Work Reports."
    },
    {
      q: "What is the Global AI Assistant and how does it help?",
      a: "The Global AI Assistant is accessible anywhere in your User Panel. It can summarize complex lead inquiries, draft proposal text, recommend quotation line items, and generate response templates."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-600 selection:text-white">
      {/* Sticky Top Navbar */}
      <PublicHeader />

      <main className="relative overflow-hidden">
        {/* Soft Background Gradient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[520px] pointer-events-none opacity-40">
          <div className="absolute top-8 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-blue-200 to-indigo-200 rounded-full blur-[140px] animate-pulse" />
          <div className="absolute top-16 right-1/4 w-[400px] h-[400px] bg-gradient-to-tr from-sky-200 to-blue-200 rounded-full blur-[120px] animate-pulse delay-700" />
        </div>

        {/* HERO SECTION */}
        <section className="relative pt-16 pb-12 md:pt-22 md:pb-16 px-6 max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs sm:text-sm font-bold mb-8 shadow-sm hover:bg-blue-100/70 transition-all cursor-pointer">
              <Sparkles className="h-4 w-4 text-blue-600 animate-spin" />
              <span>Complete Business Operating System for Agencies & Services</span>
              <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase">Live CRM</span>
            </div>

            {/* Main Title */}
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.15]">
              Leads, Quotations, Projects & <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 bg-clip-text text-transparent">
                GST Invoicing in One CRM
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
              Capture WordPress leads automatically, build GST quotations & PDF invoices, manage team task Kanbans, and automate communication workflows with built-in AI.
            </p>

            {/* Action Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button 
                onClick={handleOpenUserPanel} 
                size="lg" 
                className="w-full sm:w-auto rounded-full px-8 py-6 text-base bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 transition-all transform hover:-translate-y-0.5 font-bold"
              >
                Open User Panel (Demo Workspace) <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                variant="outline" 
                onClick={() => navigate('/pricing')} 
                size="lg" 
                className="w-full sm:w-auto rounded-full px-8 py-6 text-base border-slate-300 bg-white text-slate-700 hover:bg-slate-100 shadow-sm transition-all font-semibold"
              >
                View Plans & Pricing
              </Button>
            </div>

            {/* Feature Highlights Bar */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-slate-700 text-xs sm:text-sm font-semibold">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4.5 w-4.5 text-blue-600" />
                <span>WordPress Webhook Intake</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4.5 w-4.5 text-indigo-600" />
                <span>GST Tax Quotations & Invoices</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
                <span>Projects & Task Kanbans</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4.5 w-4.5 text-amber-600" />
                <span>Global AI Copilot</span>
              </div>
            </div>
          </div>

          {/* INTERACTIVE USER PANEL MODULE SHOWCASE (HERO PLAYER) */}
          <div className="mt-14 max-w-6xl mx-auto">
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-300/70 overflow-hidden">
              {/* Window Header */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-slate-100/90 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-2 text-xs font-mono text-slate-600 bg-white px-3 py-1 rounded-md border border-slate-200 font-semibold">
                    Kanishk One • User Panel Workspace
                  </span>
                </div>

                {/* Module Selector Tabs */}
                <div className="hidden md:flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl text-xs font-bold">
                  <button 
                    onClick={() => setActiveTab('leads')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all ${activeTab === 'leads' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    🎯 Lead Pipeline
                  </button>
                  <button 
                    onClick={() => setActiveTab('quotes')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all ${activeTab === 'quotes' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    📄 Quotations & Invoices
                  </button>
                  <button 
                    onClick={() => setActiveTab('projects')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all ${activeTab === 'projects' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    📁 Projects & Kanban Tasks
                  </button>
                  <button 
                    onClick={() => setActiveTab('automations')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all ${activeTab === 'automations' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    🤖 Automations & AI
                  </button>
                </div>
              </div>

              {/* Module Screen Content */}
              <div className="p-6 md:p-8 bg-slate-50/60 min-h-[440px]">
                {/* 1. LEADS PIPELINE */}
                {activeTab === 'leads' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-600 rounded-lg text-white">
                          <UserPlus className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-900">WordPress Webhook Lead Intake</div>
                          <div className="text-xs text-slate-600">Auto-populates leads from Elementor, CF7, WPForms with 360° lead details</div>
                        </div>
                      </div>
                      <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full border border-emerald-300">
                        🟢 Real-Time Synced
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="text-blue-600 uppercase">New Inquiries (2)</span>
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">WordPress Form</span>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                          <div className="flex justify-between font-bold text-sm text-slate-900">
                            <span>Apex Global Tech</span>
                            <span className="text-emerald-700 font-mono">₹1,50,000</span>
                          </div>
                          <p className="text-xs text-slate-600">Inquiry for custom CRM software & lead intake</p>
                          <div className="pt-2 flex justify-between text-[11px] text-slate-500 border-t border-slate-200">
                            <span>Contact: Rahul Sharma</span>
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">High Intent</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="text-amber-600 uppercase">Proposals Sent (3)</span>
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Quote PDF</span>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                          <div className="flex justify-between font-bold text-sm text-slate-900">
                            <span>Veda Digital Solutions</span>
                            <span className="text-amber-600 font-mono">₹2,80,000</span>
                          </div>
                          <p className="text-xs text-slate-600">Quotation #QT-2026-089 emailed to client</p>
                          <div className="pt-2 flex justify-between text-[11px] text-slate-500 border-t border-slate-200">
                            <span>Priya Mehta</span>
                            <span className="text-blue-600 font-bold">PDF Viewed</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="text-emerald-600 uppercase">Converted Clients (8)</span>
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Active</span>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                          <div className="flex justify-between font-bold text-sm text-slate-900">
                            <span>Starlight Media</span>
                            <span className="text-emerald-700 font-mono">₹95,000/mo</span>
                          </div>
                          <p className="text-xs text-slate-600">Converted from Lead to Client profile</p>
                          <div className="pt-2 flex justify-between text-[11px] text-slate-500 border-t border-slate-200">
                            <span>Project Created</span>
                            <span className="text-emerald-700 font-bold">GST Invoice Issued</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. QUOTATIONS & GST INVOICES */}
                {activeTab === 'quotes' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white rounded-xl border border-slate-200 shadow-sm gap-4">
                      <div>
                        <h4 className="text-base font-bold text-slate-900">Quotations & GST Invoice Generator</h4>
                        <p className="text-xs text-slate-500">Custom line items, CGST/SGST/IGST breakdown, approval status, and PDF export</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full font-bold">GST Compliant</span>
                        <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1 rounded-full font-bold">PDF Export</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <span className="font-bold text-sm text-slate-900">QUOTATION #QT-2026-104</span>
                          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">Approved</span>
                        </div>
                        <div className="text-xs space-y-2 text-slate-700">
                          <div className="flex justify-between"><span>Web Application Development</span><span className="font-mono font-bold">₹1,20,000</span></div>
                          <div className="flex justify-between"><span>WhatsApp API Gateway</span><span className="font-mono font-bold">₹15,000</span></div>
                          <div className="flex justify-between text-slate-500"><span>CGST (9%) + SGST (9%)</span><span className="font-mono">₹24,300</span></div>
                          <div className="flex justify-between font-extrabold text-sm text-slate-900 pt-2 border-t border-slate-100">
                            <span>Total Payable Amount</span>
                            <span className="text-blue-600 font-mono">₹1,59,300</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <span className="font-bold text-sm text-slate-900">TAX INVOICE #INV-2026-880</span>
                          <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">Paid</span>
                        </div>
                        <div className="text-xs space-y-2 text-slate-700">
                          <div className="flex justify-between"><span>SaaS Monthly Service Retainer</span><span className="font-mono font-bold">₹25,000</span></div>
                          <div className="flex justify-between text-slate-500"><span>IGST (18%)</span><span className="font-mono">₹4,500</span></div>
                          <div className="flex justify-between font-extrabold text-sm text-slate-900 pt-2 border-t border-slate-100">
                            <span>Total Paid</span>
                            <span className="text-emerald-600 font-mono">₹29,500</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. PROJECTS & KANBAN TASKS */}
                {activeTab === 'projects' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div>
                        <h4 className="text-base font-bold text-slate-900">Projects & Team Task Kanban</h4>
                        <p className="text-xs text-slate-500">Visual task stages, assigned team members, priorities, and daily Work Reports</p>
                      </div>
                      <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full">
                        6 Team Roles
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-indigo-600 uppercase">Active Project</span>
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">75% Done</span>
                        </div>
                        <h5 className="font-bold text-slate-900 text-sm">CRM Redesign & Client Management</h5>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div className="bg-blue-600 h-full w-3/4 rounded-full" />
                        </div>
                        <div className="flex justify-between text-xs text-slate-500 pt-1">
                          <span>PM: Vikram Singh</span>
                          <span>Target: 25 Sep</span>
                        </div>
                      </div>

                      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-emerald-600 uppercase">Daily Work Report</span>
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold">Logged</span>
                        </div>
                        <h5 className="font-bold text-slate-900 text-sm">Frontend UI & Webhook Verification</h5>
                        <p className="text-xs text-slate-600">Tested WordPress lead ingestion and PDF invoice layout.</p>
                        <div className="flex justify-between text-xs text-slate-500 pt-1">
                          <span>Member: Ananya Roy</span>
                          <span>Hours: 7.5 hrs</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. AUTOMATIONS & AI */}
                {activeTab === 'automations' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-600 text-white rounded-lg">
                        <Bot className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-slate-900">Workflow Automations & AI Copilot</h4>
                        <p className="text-xs text-slate-500">Automate email & WhatsApp responses, summarize leads, and generate proposals</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <Send className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">Instant Lead Engagement Trigger</div>
                            <div className="text-xs text-slate-500">Sends welcome email & WhatsApp message on new WordPress lead intake</div>
                          </div>
                        </div>
                        <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-full border border-emerald-200">
                          Active Workflow
                        </span>
                      </div>

                      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Bot className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">Global AI Assistant Panel</div>
                            <div className="text-xs text-slate-500">Built-in AI helper for lead summary, line items, and client responses</div>
                          </div>
                        </div>
                        <span className="text-xs bg-blue-50 text-blue-700 font-bold px-3 py-1 rounded-full border border-blue-200">
                          Included
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* PRECISE CORE CRM MODULES GRID (EXACT USER PANEL FEATURES) */}
        <section id="features" className="py-20 px-6 max-w-7xl mx-auto border-t border-slate-200">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Exact User Panel Modules</h2>
            <h3 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">Built for Your Daily Business Workflow</h3>
            <p className="mt-4 text-slate-600 text-base sm:text-lg">Every module in Kanishk One corresponds directly to a feature in your User Panel.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Module 1: Clients & 360° Profiles */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3">Clients Database & 360° Profiles</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Manage business clients, contact details, GSTIN numbers, custom fields, and complete interaction history in one unified CRM view.
              </p>
            </div>

            {/* Module 2: WordPress Lead Intake & Pipeline */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <UserPlus className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3">WordPress Lead Intake Gateway</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Connect Elementor, CF7, or WPForms via unique webhook URLs. Incoming leads enter a visual Kanban pipeline with lead scoring and 1-click conversion to Client.
              </p>
            </div>

            {/* Module 3: Quotations & Line Items */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-emerald-300 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <FileText className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3">Quotations & Line Items Builder</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Create custom estimates, add line items from your Services catalog, set approval status (Draft, Sent, Approved), export PDFs, and email directly to clients.
              </p>
            </div>

            {/* Module 4: Invoices & GST Tax Compliance */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-amber-300 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Receipt className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3">GST Tax Invoices & Payment Logs</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Convert approved quotes to Tax Invoices with automated CGST/SGST/IGST calculations. Record payments (Paid, Unpaid, Overdue) and generate PDF receipts.
              </p>
            </div>

            {/* Module 5: Projects, Tasks & Work Reports */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-sky-300 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <FolderKanban className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3">Projects, Tasks & Work Reports</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Track project progress bars and budgets. Assign team tasks with priorities (Low, High, Urgent), filter assigned tasks, and review daily employee Work Reports.
              </p>
            </div>

            {/* Module 6: Automations, AI & Communication */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-purple-300 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Workflow className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3">Automations, AI & Communication</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Build automated trigger workflows for email & WhatsApp engagement, log communications, and leverage the Global AI Assistant copilot for business tasks.
              </p>
            </div>
          </div>
        </section>

        {/* WORKFLOW PROCESS SECTION */}
        <section id="workflow" className="py-20 px-6 max-w-7xl mx-auto bg-slate-100/80 rounded-3xl border border-slate-200 my-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Operation Lifecycle</h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900">How the User Panel Workflow Operates</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center mb-4">1</div>
              <h5 className="font-bold text-slate-900 text-lg mb-2">Ingest Leads</h5>
              <p className="text-xs text-slate-600 leading-relaxed">WordPress form webhooks populate the Leads Pipeline in real-time with full inquiry context.</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center mb-4">2</div>
              <h5 className="font-bold text-slate-900 text-lg mb-2">Build GST Quotes</h5>
              <p className="text-xs text-slate-600 leading-relaxed">Add catalog line items, apply CGST/SGST/IGST tax rates, and email formal PDF quotations.</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center mb-4">3</div>
              <h5 className="font-bold text-slate-900 text-lg mb-2">Manage Execution</h5>
              <p className="text-xs text-slate-600 leading-relaxed">Convert approved quotes to active Projects with Kanban task boards and daily Work Reports.</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center mb-4">4</div>
              <h5 className="font-bold text-slate-900 text-lg mb-2">Issue Tax Invoices</h5>
              <p className="text-xs text-slate-600 leading-relaxed">Generate formal Tax Invoices, record client payments, and track workspace financial reports.</p>
            </div>
          </div>
        </section>

        {/* FAQ ACCORDION */}
        <section className="py-20 px-6 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Frequently Asked Questions</h2>
            <h3 className="text-3xl font-extrabold text-slate-900">Everything You Need to Know</h3>
          </div>

          <div className="space-y-4">
            {faqItems.map((item, idx) => (
              <div 
                key={idx}
                className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full text-left p-5 font-bold text-slate-900 flex justify-between items-center hover:bg-slate-50 transition-colors"
                >
                  <span>{item.q}</span>
                  <ChevronRight className={`h-5 w-5 text-slate-400 transition-transform ${openFaq === idx ? 'rotate-90 text-blue-600' : ''}`} />
                </button>
                {openFaq === idx && (
                  <div className="p-5 pt-0 text-sm text-slate-600 border-t border-slate-100 leading-relaxed">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* BOTTOM CTA BANNER */}
        <section className="py-20 px-6 max-w-7xl mx-auto">
          <div className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 p-10 md:p-16 text-center relative overflow-hidden shadow-2xl shadow-blue-500/25 text-white">
            <div className="relative z-10 max-w-3xl mx-auto space-y-6">
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
                Ready to power your business operations?
              </h2>
              <p className="text-blue-100 text-base sm:text-lg">
                Explore the complete User Panel with active demo leads, GST quotations, project Kanbans, and AI automations.
              </p>
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button 
                  onClick={handleOpenUserPanel} 
                  size="lg" 
                  className="rounded-full px-8 py-6 text-base bg-white text-blue-700 hover:bg-slate-100 font-bold shadow-xl transition-all"
                >
                  Open Demo User Panel <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button 
                  onClick={() => navigate('/pricing')} 
                  variant="outline" 
                  size="lg" 
                  className="rounded-full px-8 py-6 text-base border-white/40 text-white hover:bg-white/10 font-semibold backdrop-blur-sm"
                >
                  View SaaS Plans
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 py-12 px-6 bg-white text-slate-600 text-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-bold text-white text-xs">K1</div>
            <span className="text-lg font-bold text-slate-900 tracking-tight">Kanishk One</span>
          </div>

          <div className="flex items-center gap-6 text-slate-600 text-xs sm:text-sm font-medium">
            <button onClick={() => navigate('/')} className="hover:text-blue-600 transition-colors">Product</button>
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#workflow" className="hover:text-blue-600 transition-colors">How It Works</a>
            <button onClick={() => navigate('/pricing')} className="hover:text-blue-600 transition-colors">Pricing</button>
            <button onClick={() => navigate('/login')} className="hover:text-blue-600 transition-colors">Sign In</button>
          </div>

          <div className="text-xs text-slate-500">
            © {new Date().getFullYear()} Kanishk One. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
