import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace';
import { AlertTriangle, Info, CheckCircle, AlertCircle, X } from 'lucide-react';

export function AnnouncementBanner() {
  const { activeWorkspace } = useWorkspace();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    async function fetchAnnouncements() {
      const { data } = await supabase
        .from('platform_announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (data) {
        setAnnouncements(data);
      }
    }

    fetchAnnouncements();

    // Real-Time Postgres Changes Subscription
    const channel = supabase
      .channel('platform_announcements_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_announcements' },
        () => {
          fetchAnnouncements();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeWorkspace]);

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => [...prev, id]);
  };

  const visibleAnnouncements = announcements.filter((a) => !dismissedIds.includes(a.id));

  if (visibleAnnouncements.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      {visibleAnnouncements.map((a) => {
        let containerStyle = 'bg-blue-50 border-blue-200 text-blue-900';
        let IconComponent = Info;
        let iconColor = 'text-blue-600';

        if (a.banner_type === 'warning') {
          containerStyle = 'bg-amber-50 border-amber-300 text-amber-900';
          IconComponent = AlertTriangle;
          iconColor = 'text-amber-600';
        } else if (a.banner_type === 'critical') {
          containerStyle = 'bg-rose-50 border-rose-300 text-rose-900';
          IconComponent = AlertCircle;
          iconColor = 'text-rose-600';
        } else if (a.banner_type === 'success') {
          containerStyle = 'bg-emerald-50 border-emerald-300 text-emerald-900';
          IconComponent = CheckCircle;
          iconColor = 'text-emerald-600';
        }

        return (
          <div
            key={a.id}
            className={`flex items-start justify-between gap-3 rounded-xl border p-4 shadow-sm transition-all ${containerStyle}`}
          >
            <div className="flex items-start gap-3">
              <IconComponent className={`h-5 w-5 shrink-0 mt-0.5 ${iconColor}`} />
              <div>
                <div className="font-bold text-sm leading-snug">{a.title}</div>
                <div className="text-xs mt-1 leading-relaxed opacity-90">{a.content}</div>
              </div>
            </div>

            <button
              onClick={() => handleDismiss(a.id)}
              className="rounded-lg p-1 opacity-60 hover:bg-black/5 hover:opacity-100"
              title="Dismiss banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
