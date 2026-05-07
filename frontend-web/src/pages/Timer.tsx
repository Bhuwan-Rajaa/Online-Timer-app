import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { TimerType } from '../store/useStore';
import { socket } from '../lib/socket';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const POMODORO_DURATION = 25 * 60; // 25 minutes

export const Timer = () => {
  const { localSession, setLocalSession } = useStore();
  const [topic, setTopic] = useState('');
  const [type, setType] = useState<TimerType>('POMODORO');
  const [elapsed, setElapsed] = useState(0);
  const navigate = useNavigate();

  // Tick the timer if active
  useEffect(() => {
    if (!localSession?.isActive) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.floor((now - localSession.startTime) / 1000);
      setElapsed(diff);

      // Check if Pomodoro ended
      if (localSession.type === 'POMODORO' && localSession.targetDuration) {
        if (diff >= localSession.targetDuration) {
          handleComplete();
        }
      }
    }, 250); // fast enough tick for smooth seconds updates without missing

    return () => clearInterval(interval);
  }, [localSession]);

  const handleStart = () => {
    if (!topic) return;

    const session = {
      topic,
      type,
      startTime: Date.now(),
      targetDuration: type === 'POMODORO' ? POMODORO_DURATION : undefined,
      isActive: true,
    };
    
    setLocalSession(session);
    setElapsed(0);

    // Broadcast to friends
    socket.emit('start_timer', {
      topic,
      timer_type: type,
      start_time_iso: new Date(session.startTime).toISOString(),
      duration_target: session.targetDuration
    });
  };

  const handleStop = async () => {
    if (!localSession) return;
    
    // Save to Supabase
    if (useStore.getState().user) {
      const { user } = useStore.getState();
      const durationSeconds = Math.floor((Date.now() - localSession.startTime) / 1000);
      
      if (durationSeconds > 10) {
        try {
          await supabase.from('Sessions').insert([{
            user_id: user?.id,
            topic: localSession.topic,
            timer_type: localSession.type,
            duration_seconds: durationSeconds
          }]);
        } catch (e) {
          console.error('Error saving session:', e);
        }
      }
    }

    // Broadcast stop
    socket.emit('stop_timer');
    setLocalSession(null);
    setElapsed(0);
  };

  const handleComplete = async () => {
    // Show notification via Service Worker
    if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
      const registration = await navigator.serviceWorker.ready;
      registration.showNotification('Session Complete', {
        body: `You finished your ${localSession?.topic} session!`,
        icon: '/favicon.svg',
        vibrate: [200, 100, 200, 100, 200, 100, 200],
      } as any);
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Session Complete', {
        body: `You finished your ${localSession?.topic} session!`,
        icon: '/favicon.svg'
      });
    }

    handleStop();
  };

  // Format MM:SS
  const formatTime = () => {
    if (!localSession) return "00:00";

    let totalSeconds = elapsed;
    if (localSession.type === 'POMODORO' && localSession.targetDuration) {
      totalSeconds = Math.max(0, localSession.targetDuration - elapsed);
    }

    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Ask for notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return (
    <div className="flex-center" style={{ height: '100%', flexDirection: 'column' }}>
      <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '500px', textAlign: 'center' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <button onClick={() => navigate('/')} style={{ color: 'var(--text-secondary)' }}>
            &larr; Back to Hub
          </button>
        </div>

        {!localSession?.isActive ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>New Deep Work Session</h2>
            
            <input 
              type="text" 
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What are you working on?"
              style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', outline: 'none' }}
            />
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                onClick={() => setType('POMODORO')}
                style={{ 
                  padding: '0.5rem 1rem', 
                  borderRadius: '8px', 
                  background: type === 'POMODORO' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                  color: type === 'POMODORO' ? 'white' : 'var(--text-secondary)'
                }}
              >
                Pomodoro (25m)
              </button>
              <button 
                onClick={() => setType('STOPWATCH')}
                style={{ 
                  padding: '0.5rem 1rem', 
                  borderRadius: '8px', 
                  background: type === 'STOPWATCH' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                  color: type === 'STOPWATCH' ? 'white' : 'var(--text-secondary)'
                }}
              >
                Stopwatch
              </button>
            </div>

            <button 
              onClick={handleStart}
              disabled={!topic}
              className="glass-button"
              style={{ marginTop: '1rem' }}
            >
              Ignite Session
            </button>
          </div>
        ) : (
          <div>
            <h3 style={{ color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              {localSession.type}
            </h3>
            <div style={{ fontSize: '1.25rem', marginBottom: '2rem' }}>
              {localSession.topic}
            </div>

            <div className="tabular-nums text-gradient animate-pulse-glow" style={{ fontSize: '5rem', fontWeight: 'bold', margin: '2rem 0', borderRadius: '50%', width: '250px', height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginInline: 'auto', border: '2px solid var(--accent-glow)' }}>
              {formatTime()}
            </div>

            <button 
              onClick={handleStop}
              className="glass-button"
              style={{ background: 'rgba(239, 35, 60, 0.15)', borderColor: 'rgba(239, 35, 60, 0.4)' }}
            >
              Abort Session
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
