import { useState, useEffect } from 'react';
import { useNetworkStore } from '../store/useNetworkStore';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';

export const Hub = () => {
  const { profile } = useStore();
  const { friends, messages, removeMessage } = useNetworkStore();
  const friendsList = Object.values(friends);
  const navigate = useNavigate();

  const [messageInput, setMessageInput] = useState<Record<string, string>>({});

  const handleNudge = (targetUserId: string) => {
    socket.emit('send_nudge', { target_user_id: targetUserId });
  };

  const handleSendMessage = (targetUserId: string) => {
    const text = messageInput[targetUserId];
    if (!text || text.trim() === '') return;
    
    socket.emit('send_ephemeral_message', { target_user_id: targetUserId, message: text });
    setMessageInput(prev => ({ ...prev, [targetUserId]: '' }));
  };

  // Auto-remove messages after 5 minutes
  useEffect(() => {
    const intervals = messages.map(msg => {
      return setTimeout(() => removeMessage(msg.id), 5 * 60 * 1000);
    });
    return () => intervals.forEach(clearTimeout);
  }, [messages, removeMessage]);

  return (
    <div style={{ padding: '1rem 0', position: 'relative' }}>
      {/* Toast Container */}
      <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {messages.map(msg => (
          <div key={msg.id} className="glass-panel" style={{ padding: '1rem', minWidth: '250px', animation: 'pulse-glow 2s' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-light)', marginBottom: '0.25rem' }}>
              @{msg.senderName}
            </div>
            <div>{msg.text}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>The Hub</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Welcome back, <span className="text-gradient">@{profile?.username}</span></p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {/* Quick Start Timer Card */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px dashed rgba(255,255,255,0.2)' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>New Session</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Start a deep work block.</p>
          </div>
          <button 
            onClick={() => navigate('/timer')}
            className="glass-button" 
            style={{ marginTop: '1.5rem', width: '100%' }}
          >
            Initialize Timer
          </button>
        </div>

        {/* Friend Cards */}
        {friendsList.length === 0 && (
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
            <p style={{ fontSize: '0.875rem' }}>No friends connected.</p>
          </div>
        )}

        {friendsList.map(friend => (
          <div key={friend.id} className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ 
                  width: '12px', 
                  height: '12px', 
                  borderRadius: '50%', 
                  background: friend.isOnline ? (friend.activeSession ? 'var(--accent-primary)' : 'var(--success)') : 'rgba(255,255,255,0.2)',
                  boxShadow: friend.isOnline ? `0 0 10px ${friend.activeSession ? 'var(--accent-primary)' : 'var(--success)'}` : 'none'
                }} className={friend.activeSession ? 'animate-pulse-glow' : ''} />
                <span style={{ fontWeight: '500' }}>@{friend.username}</span>
              </div>
              <button 
                onClick={() => handleNudge(friend.id)}
                className="glass-button"
                style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}
              >
                Nudge
              </button>
            </div>
            
            {friend.activeSession ? (
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.25rem' }}>
                  {friend.activeSession.timer_type}
                </div>
                <div style={{ fontWeight: 'bold' }}>{friend.activeSession.topic}</div>
              </div>
            ) : (
              <div style={{ padding: '0.75rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {friend.isOnline ? 'Idle' : 'Offline'}
              </div>
            )}
            
            {/* Quick Message Input for this friend */}
            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(friend.id); }} style={{ marginTop: '1rem' }}>
              <input
                type="text"
                placeholder={`> msg @${friend.username}`}
                value={messageInput[friend.id] || ''}
                onChange={(e) => setMessageInput(prev => ({ ...prev, [friend.id]: e.target.value }))}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  padding: '0.5rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </form>
          </div>
        ))}
      </div>
    </div>
  );
};
