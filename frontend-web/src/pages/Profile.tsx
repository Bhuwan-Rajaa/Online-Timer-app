import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

export const Profile = () => {
  const { profile, user } = useStore();
  const [loading, setLoading] = useState(true);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [dailyData, setDailyData] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) return;

    const fetchHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('Sessions')
          .select('duration_seconds, timestamp')
          .eq('user_id', user.id);

        if (error) throw error;

        setTotalSessions(data?.length || 0);
        
        let sum = 0;
        const daily: Record<string, number> = {};
        
        data?.forEach((s: any) => {
          sum += (s.duration_seconds || 0);
          
          if (s.timestamp) {
            const dateObj = new Date(s.timestamp);
            const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
            daily[dateStr] = (daily[dateStr] || 0) + (s.duration_seconds || 0);
          }
        });
        
        setTotalTime(sum);
        setDailyData(daily);
      } catch (err) {
        console.error('Profile fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    // Re-fetch when user switches back to this tab (works on mobile too)
    const onVisible = () => { if (document.visibilityState === 'visible') fetchHistory(); };
    document.addEventListener('visibilitychange', onVisible);

    // Realtime subscription (works if Sessions table has replication enabled in Supabase)
    const channel = supabase
      .channel(`vault_sessions_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Sessions', filter: `user_id=eq.${user.id}` }, () => {
        fetchHistory();
      })
      .subscribe();

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const formatTime = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    return `${h}h ${m}m`;
  };

  // Generate last 100 days for a simple heatmap
  const generateHeatmapDays = () => {
    const days = [];
    for (let i = 99; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push(dateStr);
    }
    return days;
  };

  const heatmapDays = generateHeatmapDays();
  const maxDaily = Math.max(1, ...Object.values(dailyData)); // prevent division by zero

  const getColor = (dateStr: string) => {
    const secs = dailyData[dateStr] || 0;
    if (secs === 0) return 'rgba(255,255,255,0.05)';
    // Scale intensity (min 0.2, max 1.0)
    const intensity = 0.2 + (0.8 * (secs / maxDaily));
    return `rgba(157, 78, 221, ${intensity})`; // using the purple accent color
  };

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>The Vault</h1>
        <p style={{ color: 'var(--text-secondary)' }}>All-time historical data for <span className="text-gradient">@{profile?.username}</span></p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Sessions</div>
          <div className="tabular-nums text-gradient" style={{ fontSize: '3rem', fontWeight: 'bold', marginTop: '0.5rem' }}>
            {loading ? '-' : totalSessions}
          </div>
        </div>
        
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Deep Work</div>
          <div className="tabular-nums text-gradient" style={{ fontSize: '3rem', fontWeight: 'bold', marginTop: '0.5rem' }}>
            {loading ? '-' : formatTime(totalTime)}
          </div>
        </div>
      </div>
      
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Activity Heatmap (Last 100 Days)</h3>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Loading...</div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(20, 1fr)', 
            gridTemplateRows: 'repeat(5, 1fr)', 
            gap: '4px', 
            gridAutoFlow: 'column',
            overflowX: 'auto',
            paddingBottom: '1rem'
          }}>
            {heatmapDays.map((dateStr) => (
              <div 
                key={dateStr}
                title={`${dateStr}: ${formatTime(dailyData[dateStr] || 0)}`}
                style={{
                  width: '100%',
                  aspectRatio: '1/1',
                  background: getColor(dateStr),
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
