import { useState, useEffect } from 'react';
import { useNetworkStore } from '../store/useNetworkStore';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { supabase } from '../lib/supabase';

const formatDailyTime = (seconds?: number) => {
  if (!seconds) return '0m';
  if (seconds < 60) return '< 1m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const Hub = () => {
  const { profile, user } = useStore();
  const { friends, messages, removeMessage, friendRequestRefresh } = useNetworkStore();
  const friendsList = Object.values(friends);
  const navigate = useNavigate();

  const [messageInput, setMessageInput] = useState<Record<string, string>>({});
  const [nudgeCooldown, setNudgeCooldown] = useState<Record<string, boolean>>({});
  const [messageSent, setMessageSent] = useState<Record<string, boolean>>({});
  const [friendUsername, setFriendUsername] = useState('');
  const [searchResults, setSearchResults] = useState<{id: string, username: string}[]>([]);
  const [addFriendMessage, setAddFriendMessage] = useState('');
  const [pendingRequests, setPendingRequests] = useState<any[]>([]); // incoming
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]); // sent by me

  const userId = user?.id;

  const fetchPendingRequests = async () => {
    if (!userId) return;
    
    try {
      const { data: requests, error } = await supabase
        .from('Friendships')
        .select('user_id_1, user_id_2, requested_by')
        .eq('status', 'PENDING')
        .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);
      
      if (error) {
        console.error('Error fetching pending requests:', error);
        return;
      }
      
      if (!requests || requests.length === 0) {
        setPendingRequests([]);
        setOutgoingRequests([]);
        return;
      }

      // Separate incoming (others sent to me) vs outgoing (I sent)
      const incomingIds: string[] = [];
      const outgoingIds: string[] = [];

      requests.forEach(r => {
        const otherId = r.user_id_1 === userId ? r.user_id_2 : r.user_id_1;
        if (r.requested_by === userId) {
          outgoingIds.push(otherId); // I sent this request
        } else {
          incomingIds.push(otherId); // Someone sent this to me
        }
      });

      // Fetch profiles for incoming requests
      if (incomingIds.length > 0) {
        const { data: incomingProfiles } = await supabase
          .from('Profiles')
          .select('id, username')
          .in('id', incomingIds);
        setPendingRequests(incomingProfiles || []);
      } else {
        setPendingRequests([]);
      }

      // Fetch profiles for outgoing requests
      if (outgoingIds.length > 0) {
        const { data: outgoingProfiles } = await supabase
          .from('Profiles')
          .select('id, username')
          .in('id', outgoingIds);
        setOutgoingRequests(outgoingProfiles || []);
      } else {
        setOutgoingRequests([]);
      }
    } catch (e) {
      console.error('Failed to fetch pending requests:', e);
      setPendingRequests([]);
      setOutgoingRequests([]);
    }
  };

  useEffect(() => {
    fetchPendingRequests();
  }, [userId, friendRequestRefresh]);

  // Supabase realtime: refresh pending requests when Friendships table changes
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`friendships_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Friendships', filter: `user_id_1=eq.${userId}` }, fetchPendingRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Friendships', filter: `user_id_2=eq.${userId}` }, fetchPendingRequests)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (friendUsername.trim().length > 1) {
        const { data } = await supabase
          .from('Profiles')
          .select('id, username')
          .ilike('username', `%${friendUsername.trim()}%`)
          .neq('id', userId)
          .limit(5);
        setSearchResults(data || []);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [friendUsername, userId]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendUsername.trim() || !userId) return;
    setAddFriendMessage('Sending...');
    try {
      const { data: users, error: userError } = await supabase
        .from('Profiles')
        .select('id')
        .eq('username', friendUsername.trim());
      
      if (userError || !users || users.length === 0) {
        setAddFriendMessage('User not found.');
        return;
      }
      
      const friendId = users[0].id;
      if (friendId === userId) {
        setAddFriendMessage('You cannot add yourself.');
        return;
      }
      
      // Ensure user_id_1 < user_id_2 as per the CHECK constraint
      const isFirst = userId < friendId;
      const user_id_1 = isFirst ? userId : friendId;
      const user_id_2 = isFirst ? friendId : userId;
      
      const { error: insertError } = await supabase
        .from('Friendships')
        .insert({ user_id_1, user_id_2, status: 'PENDING', requested_by: userId });
        
      if (insertError) {
        if (insertError.code === '23505') {
          setAddFriendMessage('Request already exists or you are already friends.');
        } else {
          console.error('Insert friendship error:', insertError);
          setAddFriendMessage('Error sending request. Check console for details.');
        }
      } else {
        setAddFriendMessage('Request sent!');
        setFriendUsername('');
        fetchPendingRequests();
        socket.emit('notify_friend_request', { target_user_id: friendId });
      }
    } catch (e) {
      console.error('Add friend error:', e);
      setAddFriendMessage('An error occurred.');
    }
  };

  const handleAcceptRequest = async (friendId: string) => {
    if (!userId) return;
    const isFirst = userId < friendId;
    const user_id_1 = isFirst ? userId : friendId;
    const user_id_2 = isFirst ? friendId : userId;

    const { error } = await supabase
      .from('Friendships')
      .update({ status: 'ACCEPTED' })
      .match({ user_id_1, user_id_2 });
    
    if (error) {
      console.error('Accept request error:', error);
      return;
    }

    // Refresh pending requests list immediately
    fetchPendingRequests();
    // Re-fetch the full friends list and re-join the network room
    if ((window as any).__refetchFriends) {
      (window as any).__refetchFriends();
    }
  };

  const handleNudge = (targetUserId: string) => {
    if (nudgeCooldown[targetUserId]) return;
    socket.emit('send_nudge', { target_user_id: targetUserId });
    // Set cooldown to prevent spam and show feedback
    setNudgeCooldown(prev => ({ ...prev, [targetUserId]: true }));
    setTimeout(() => {
      setNudgeCooldown(prev => ({ ...prev, [targetUserId]: false }));
    }, 2000);
  };

  const handleSendMessage = (targetUserId: string) => {
    const text = messageInput[targetUserId];
    if (!text || text.trim() === '') return;
    
    socket.emit('send_ephemeral_message', { target_user_id: targetUserId, message: text });
    
    // Show the sender their own message as confirmation
    const targetFriend = friends[targetUserId];
    useNetworkStore.getState().addMessage({
      id: `sent-${Date.now()}`,
      senderId: userId || 'me',
      senderName: 'You',
      text: `→ @${targetFriend?.username || 'friend'}: ${text}`,
      timestamp: Date.now()
    });
    
    setMessageInput(prev => ({ ...prev, [targetUserId]: '' }));
    // Brief "Sent" indicator
    setMessageSent(prev => ({ ...prev, [targetUserId]: true }));
    setTimeout(() => {
      setMessageSent(prev => ({ ...prev, [targetUserId]: false }));
    }, 1500);
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

      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Study Session</h2>
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
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Manage Network</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {/* Add Friend Card */}
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Add Friend</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Connect with a study partner.</p>
            </div>
            <form onSubmit={handleAddFriend} style={{ marginTop: '1rem', position: 'relative' }}>
              <input
                type="text"
                placeholder="Search username..."
                value={friendUsername}
                onChange={(e) => setFriendUsername(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', outline: 'none', marginBottom: '0.5rem' }}
              />
              {searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '3rem', left: 0, right: 0, background: 'var(--bg-color)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', marginTop: '0.25rem', zIndex: 10, overflow: 'hidden' }}>
                  {searchResults.map(result => (
                    <div 
                      key={result.id} 
                      onClick={() => { setFriendUsername(result.username); setSearchResults([]); }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}
                    >
                      @{result.username}
                    </div>
                  ))}
                </div>
              )}
              <button type="submit" className="glass-button" style={{ width: '100%', padding: '0.5rem' }} disabled={!friendUsername.trim()}>
                Send Request
              </button>
              {addFriendMessage && <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--accent-light)', textAlign: 'center' }}>{addFriendMessage}</div>}
            </form>
          </div>

          {/* Incoming Pending Requests (others sent to me) */}
          {pendingRequests.map(req => (
            <div key={req.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid var(--accent-primary)' }}>
              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--accent-light)' }}>⬇ Incoming Request</h3>
                <p style={{ fontWeight: 'bold' }}>@{req.username}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>wants to connect</p>
              </div>
              <button 
                onClick={() => handleAcceptRequest(req.id)}
                className="glass-button" 
                style={{ marginTop: '1rem', width: '100%', background: 'var(--accent-primary)' }}
              >
                Accept
              </button>
            </div>
          ))}

          {/* Outgoing Pending Requests (I sent these) */}
          {outgoingRequests.map(req => (
            <div key={req.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.1)', opacity: 0.7 }}>
              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>⬆ Pending Sent</h3>
                <p style={{ fontWeight: 'bold' }}>@{req.username}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>waiting for response...</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Friends</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {/* Empty state — only show if no friends */}
          {friendsList.length === 0 && (
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, gridColumn: '1 / -1' }}>
              <p style={{ fontSize: '0.875rem' }}>No friends connected yet. Add someone above!</p>
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
                  <div>
                    <span style={{ fontWeight: '500', display: 'block' }}>@{friend.username}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Today: <span style={{ color: 'var(--accent-light)' }}>{formatDailyTime(friend.todaySeconds)}</span>
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => handleNudge(friend.id)}
                  disabled={!friend.isOnline || nudgeCooldown[friend.id]}
                  className="glass-button"
                  style={{ 
                    padding: '0.25rem 0.5rem', 
                    borderRadius: '4px', 
                    fontSize: '0.75rem',
                    opacity: friend.isOnline && !nudgeCooldown[friend.id] ? 1 : 0.5,
                    cursor: friend.isOnline && !nudgeCooldown[friend.id] ? 'pointer' : 'not-allowed',
                    background: nudgeCooldown[friend.id] ? 'rgba(6, 214, 160, 0.2)' : undefined,
                    borderColor: nudgeCooldown[friend.id] ? 'rgba(6, 214, 160, 0.4)' : undefined,
                    transition: 'all 0.3s ease'
                  }}
                  title={friend.isOnline ? 'Send a nudge' : 'Friend is offline'}
                >
                  {nudgeCooldown[friend.id] ? '✓ Nudged!' : '👊 Nudge'}
                </button>
              </div>
              
              {friend.activeSession ? (
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--accent-primary)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '0.25rem' }}>
                    STUDYING ({friend.activeSession.timer_type})
                  </div>
                  <div style={{ fontWeight: 'bold' }}>{friend.activeSession.topic}</div>
                </div>
              ) : (
                <div style={{ padding: '0.75rem', fontSize: '0.875rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  {friend.isOnline ? '🟢 Online (Idle)' : '⚪ Offline'}
                </div>
              )}
              
              {/* Quick Message Input for this friend */}
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(friend.id); }} style={{ marginTop: '1rem', position: 'relative' }}>
                <input
                  type="text"
                  disabled={!friend.isOnline}
                  placeholder={friend.isOnline ? `> msg @${friend.username}` : 'Offline - Cannot send messages'}
                  value={messageInput[friend.id] || ''}
                  onChange={(e) => setMessageInput(prev => ({ ...prev, [friend.id]: e.target.value }))}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.2)',
                    border: messageSent[friend.id] ? '1px solid var(--success)' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '4px',
                    padding: '0.5rem',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    fontFamily: 'var(--font-mono)',
                    opacity: friend.isOnline ? 1 : 0.5,
                    cursor: friend.isOnline ? 'text' : 'not-allowed',
                    transition: 'border-color 0.3s ease'
                  }}
                />
                {messageSent[friend.id] && (
                  <span style={{
                    position: 'absolute',
                    right: '0.5rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '0.7rem',
                    color: 'var(--success)',
                    fontWeight: 600,
                    letterSpacing: '0.5px'
                  }}>
                    Sent ✓
                  </span>
                )}
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
