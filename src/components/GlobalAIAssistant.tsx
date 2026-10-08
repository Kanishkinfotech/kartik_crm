import { useState, useRef, useEffect } from "react";
import { X, Bot, Send, Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { generateAIContent } from "@/lib/ai";
import { toast } from "sonner";
import { classNames } from "@/lib/format";
import { AIDisclaimer } from "@/components/ui";

interface GlobalAIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export function GlobalAIAssistant({ isOpen, onClose }: GlobalAIAssistantProps) {
  const { activeWorkspace } = useWorkspace();
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", role: "assistant", content: "Hi! I'm your Kanishk One AI Assistant. I can help you draft emails, summarise client histories, or analyse your current projects. How can I assist you today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || !activeWorkspace) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Build basic context from recent conversation if needed, 
      // but for simplicity in this global view, we'll just send the immediate prompt
      const response = await generateAIContent({
        workspace_id: activeWorkspace.id,
        feature_name: "global_assistant",
        module_name: "global",
        userInstruction: userMessage.content,
        systemInstruction: "You are the Kanishk One AI assistant. You help manage a business suite. Provide concise, professional, and helpful answers.",
      });

      if (response.success && response.content) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: response.content }]);
      } else {
        throw new Error(response.error || "No content returned");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to generate AI response");
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "system", content: "Sorry, I encountered an error communicating with the AI provider." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={onClose} />
      
      {/* Slide-over panel */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-indigo-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 text-sm">AI Assistant</h2>
              <p className="text-[11px] text-slate-500">Kanishk One Intelligence</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {messages.map((m) => (
            <div key={m.id} className={classNames(
              "flex w-full",
              m.role === "user" ? "justify-end" : "justify-start"
            )}>
              <div className={classNames(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                m.role === "user" 
                  ? "bg-indigo-600 text-white rounded-tr-sm" 
                  : m.role === "system"
                  ? "bg-red-50 text-red-700 border border-red-100 rounded-tl-sm"
                  : "bg-white text-slate-700 border border-slate-200 rounded-tl-sm"
              )}>
                {m.role === "assistant" && (
                  <div className="flex items-center gap-1 mb-1 text-xs font-medium text-indigo-600">
                    <Sparkles className="w-3 h-3" /> Assistant
                  </div>
                )}
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="flex w-full justify-start">
              <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm bg-white border border-slate-200 rounded-tl-sm shadow-sm">
                <div className="flex gap-1 items-center text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask anything..."
              className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm resize-none"
              rows={2}
              disabled={loading}
            />
            <button 
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center rounded-lg bg-indigo-600 text-white disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 hover:bg-indigo-700 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-col items-center gap-2">
            <span className="text-[10px] text-slate-400">Press Enter to send, Shift+Enter for new line</span>
            <AIDisclaimer className="w-full text-[10px] py-1.5 px-2" />
          </div>
        </div>

      </div>
    </div>
  );
}
