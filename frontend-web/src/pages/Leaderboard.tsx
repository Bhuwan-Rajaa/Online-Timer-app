import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

interface LeaderboardEntry {
  user_id: string;
  username: string;
  total_seconds: number;
}

export const Leaderboard = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile } = useStore();

  useEffect(() => {
    const fetchLeaderboard = async () => {
      // Get the timestamp for last Monday
      const now = new Date();
      const day = now.getDay() || 7; // Get current day number, converting Sunday to 7
      if (day !== 1) now.setHours(-24 * (day - 1)); // Set to previous Monday
      now.setHours(0, 0, 0, 0);
      const lastMondayIso = now.toISOString();

      // We need to fetch sessions since last Monday, and group by user_id
      // For Supabase, if we don't have an RPC function for grouping, we can fetch the raw sessions and group locally.
      // Since it's a friend-network or small scope, local grouping is fine for MVP.
      // Alternatively, we fetch all sessions >= lastMondayIso
      
      try {
        const { data: sessions, error } = await supabase
          .from('Sessions')
          .select('user_id, duration_seconds, Profiles(username)')
          .gte('timestamp', lastMondayIso);

        if (error) throw error;

        const agg: Record<string, LeaderboardEntry> = {};
        
        sessions?.forEach((s: any) => {
          if (!agg[s.user_id]) {
            agg[s.user_id] = {
              user_id: s.user_id,
              username: s.Profiles?.username || 'Unknown',
              total_seconds: 0
            };
          }
          agg[s.user_id].total_seconds += s.duration_seconds || 0;
        });

        const sorted = Object.values(agg).sort((a, b) => b.total_seconds - a.total_seconds);
        setEntries(sorted);
      } catch (err) {
        console.error('Leaderboard error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();

    // Re-fetch when user switches back to this tab (works on mobile too)
    const onVisible = () => { if (document.visibilityState === 'visible') fetchLeaderboard(); };
    document.addEventListener('visibilitychange', onVisible);

    // Realtime subscription (works if Sessions table has replication enabled in Supabase)
    const channel = supabase
      .channel('leaderboard_sessions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Sessions' }, () => {
        fetchLeaderboard();
      })
      .subscribe();

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, []);

  const formatTime = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Weekly Sprint</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Resets every Monday at 00:00.</p>
      </div>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading vault data...</div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No sessions recorded this week.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {entries.map((entry, index) => (
              <div 
                key={entry.user_id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '1rem',
                  background: entry.username === profile?.username ? 'rgba(157, 78, 221, 0.15)' : 'rgba(255,255,255,0.05)',
                  border: entry.username === profile?.username ? '1px solid rgba(157, 78, 221, 0.4)' : '1px solid transparent',
                  borderRadius: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: index < 3 ? 'var(--accent-light)' : 'var(--text-secondary)' }}>
                    #{index + 1}
                  </div>
                  <div style={{ fontWeight: '600' }}>@{entry.username}</div>
                </div>
                <div className="tabular-nums" style={{ fontWeight: 'bold' }}>
                  {formatTime(entry.total_seconds)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
