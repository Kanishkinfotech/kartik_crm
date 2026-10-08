import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';
import { Button, Card, LoadingState, Modal } from '@/components/ui';
import { MapPin, LogIn, LogOut, Clock, AlertTriangle } from 'lucide-react';
import { classNames } from '@/lib/format';
import { GoogleMapLive } from './GoogleMapLive';
import type { AttendanceSession } from '@/lib/types';
import { toast } from 'sonner';

type AttendanceStatus = 'loading' | 'not_checked_in' | 'checked_in' | 'checking_in' | 'checking_out' | 'error';

export function AttendancePanel() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [status, setStatus] = useState<AttendanceStatus>('loading');
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [showMap, setShowMap] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [memberId, setMemberId] = useState<string | null>(null);
  
  const watcherRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeWorkspace && user) {
      loadSession();
    }
    return () => stopWatcher();
  }, [activeWorkspace?.id, user?.id]);

  const loadSession = async () => {
    if (!activeWorkspace || !user) return;
    setStatus('loading');
    setError(null);
    
    // Get member id for UI and location watch mapping
    const { data: member } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', activeWorkspace.id)
      .eq('user_id', user.id)
      .single();
      
    if (!member) {
      setStatus('error');
      setError('Attendance is temporarily unavailable. Please contact your workspace administrator.');
      return;
    }
    setMemberId(member.id);
      
    try {
      const { data: activeSession, error: rpcErr } = await supabase
        .rpc('get_active_attendance_session', {
          p_workspace_id: activeWorkspace.id
        });
        
      if (rpcErr) throw rpcErr;
        
      if (activeSession && activeSession.length > 0) {
        setSession(activeSession[0]);
        setStatus('checked_in');
        startWatcher(activeSession[0].id, member.id);
      } else {
        setSession(null);
        setStatus('not_checked_in');
        stopWatcher();
      }
    } catch (err) {
      console.error('Failed to load attendance session:', err);
      setStatus('error');
      setError('Attendance is temporarily unavailable. Please contact your workspace administrator.');
    }
  };

  useEffect(() => {
    if (!session?.checked_in_at) {
      setElapsed(0);
      return;
    }
    const update = () => {
      const start = new Date(session.checked_in_at).getTime();
      const now = new Date().getTime();
      setElapsed(Math.max(0, Math.floor((now - start) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [session?.checked_in_at]);

  const stopWatcher = () => {
    if (watcherRef.current !== null) {
      navigator.geolocation.clearWatch(watcherRef.current);
      watcherRef.current = null;
    }
  };

  const startWatcher = (sessionId: string, mId: string) => {
    stopWatcher();
    if (!navigator.geolocation) return;
    
    watcherRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await supabase.rpc('record_attendance_location', {
            p_workspace_id: activeWorkspace!.id,
            p_latitude: pos.coords.latitude,
            p_longitude: pos.coords.longitude,
            p_accuracy: pos.coords.accuracy,
            p_source: 'browser_watch'
          });
          
          setSession(prev => prev ? { ...prev, current_location_status: 'live', last_location_at: new Date().toISOString() } : prev);
        } catch (err) {
          console.warn('Failed to record location:', err);
        }
      },
      async (err) => {
        console.warn('Geolocation watch error', err);
        // Interrupted
        if (err.code === err.PERMISSION_DENIED) {
          await supabase.from('attendance_sessions').update({
            current_location_status: 'interrupted',
            location_interrupted_at: new Date().toISOString(),
            interruption_reason: 'permission_denied'
          }).eq('id', sessionId);
          
          await supabase.from('attendance_incidents').insert({
            workspace_id: activeWorkspace!.id,
            attendance_session_id: sessionId,
            incident_type: 'location_permission_revoked',
            details: { error_code: err.code, message: err.message }
          });
          
          setSession(prev => prev ? { ...prev, current_location_status: 'interrupted' } : prev);
        } else {
           await supabase.from('attendance_sessions').update({
            current_location_status: 'stale'
          }).eq('id', sessionId);
          setSession(prev => prev ? { ...prev, current_location_status: 'stale' } : prev);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 30000,
      }
    );
  };

  const handleCheckIn = async () => {
    if (!activeWorkspace || !memberId) return;
    
    if (!navigator.geolocation) {
      setError("Location permission is required to check in.");
      return;
    }
    
    setStatus('checking_in');
    setError(null);
    
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { data: newSession, error: insErr } = await supabase.rpc('check_in_attendance', {
            p_workspace_id: activeWorkspace.id,
            p_latitude: pos.coords.latitude,
            p_longitude: pos.coords.longitude,
            p_accuracy: pos.coords.accuracy
          });
          
          if (insErr) throw insErr;
          
          setSession(newSession);
          setStatus('checked_in');
          toast.success("Successfully checked in");
          startWatcher(newSession.id, memberId);
        } catch (err) {
          console.error('Check-in error:', err);
          setError("We couldn't check you in. Please try again.");
          setStatus('not_checked_in');
        }
      },
      (err) => {
        console.warn('Location error during check-in:', err);
        let msg = "Could not get location. ";
        if (err.code === err.PERMISSION_DENIED) {
          msg = "Location permission is required to check in.";
        }
        setError(msg);
        setStatus('not_checked_in');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleCheckOut = async () => {
    if (!activeWorkspace || !session) return;
    setStatus('checking_out');
    setError(null);
    
    const finalize = async (lat: number | null, lng: number | null, acc: number | null) => {
      try {
        const { error: updErr } = await supabase.rpc('check_out_attendance', {
          p_workspace_id: activeWorkspace.id,
          p_latitude: lat,
          p_longitude: lng,
          p_accuracy: acc
        });
        
        stopWatcher();
        if (updErr) throw updErr;
        
        setSession(null);
        setStatus('not_checked_in');
        toast.success("Successfully checked out");
      } catch (err) {
        console.error('Check-out error:', err);
        setError("We couldn't check you out. Please try again.");
        setStatus('checked_in');
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => finalize(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        () => finalize(null, null, null),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
      );
    } else {
      finalize(null, null, null);
    }
  };

  if (status === 'loading') {
    return (
      <Card className="p-5 flex items-center justify-center min-h-[120px]">
        <LoadingState />
      </Card>
    );
  }

  const busy = status === 'checking_in' || status === 'checking_out';

  return (
    <Card className="overflow-hidden border border-slate-200">
      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-indigo-600" />
          Attendance
        </h3>
        <div className="text-xs font-medium text-slate-500">
          {new Intl.DateTimeFormat('en-IN', { dateStyle: 'long' }).format(new Date())}
        </div>
      </div>
      
      <div className="p-5">
        {error && (
          <div className="mb-4 flex items-start gap-2 bg-rose-50 text-rose-600 p-3 rounded-md text-sm border border-rose-100">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>{error}</div>
          </div>
        )}
        
        {!session || status === 'not_checked_in' || status === 'checking_in' ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Not checked in</div>
              <div className="text-xs text-slate-500 mt-1">Check in to start your work shift and record your location.</div>
            </div>
            <Button onClick={handleCheckIn} disabled={busy || !memberId} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700">
              {busy ? 'Checking In...' : <><LogIn className="h-4 w-4 mr-2" /> Check In</>}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium">Checked In at {new Intl.DateTimeFormat('en-IN', { timeStyle: 'short' }).format(new Date(session.checked_in_at))}</div>
                  <div className="text-xl font-bold text-slate-900 font-mono tracking-tight mt-0.5">
                    {String(Math.floor(elapsed / 3600)).padStart(2, '0')}:
                    {String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:
                    {String(elapsed % 60).padStart(2, '0')}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="hidden sm:block text-right mr-2">
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Status</div>
                <div className={classNames("text-xs font-medium mt-0.5", 
                  session.current_location_status === 'live' ? "text-emerald-600" : 
                  session.current_location_status === 'interrupted' ? "text-rose-600" : "text-amber-600"
                )}>
                  {session.current_location_status === 'live' ? 'Live Location' : 
                   session.current_location_status === 'interrupted' ? 'Location Interrupted' : 'Location Stale'}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowMap(true)} className="flex-1 sm:flex-none">
                <MapPin className="h-4 w-4 mr-1.5" /> View Map
              </Button>
              <Button variant="danger" size="sm" onClick={handleCheckOut} disabled={busy} className="flex-1 sm:flex-none">
                {busy ? 'Checking out...' : <><LogOut className="h-4 w-4 mr-1.5" /> Check Out</>}
              </Button>
            </div>
          </div>
        )}
      </div>

      {showMap && session?.check_in_latitude && (
        <Modal open={true} title="Live Location" onClose={() => setShowMap(false)} size="md">
          <div className="space-y-4">
            <GoogleMapLive 
              latitude={session.check_in_latitude} 
              longitude={session.check_in_longitude || 0} 
              accuracy={session.check_in_accuracy || undefined}
              className="h-[300px] w-full"
            />
            <div className="text-xs text-slate-500 text-center">
              Your location is being monitored while you are checked in.
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}
