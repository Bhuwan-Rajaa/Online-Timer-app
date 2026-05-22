import { useEffect, useRef } from 'react';
import { socket } from '../lib/socket';
import { useStore } from '../store/useStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { supabase } from '../lib/supabase';

export const useSocket = () => {
  const { user } = useStore();
  const { updateFriendPresence } = useNetworkStore();
  // Keep a ref to the latest friend IDs so the socket connect handler can use them
  const friendIdsRef = useRef<string[]>([]);

  // ─── Step 1: Load friends from Supabase immediately (no socket needed) ───────
  // This runs as soon as the user is known, independently of socket status.
  // This is why friends show on mobile even when the Render backend is cold.
  const loadFriendsFromDB = async (userId: string) => {
    try {
      const { data: friendships } = await supabase
        .from('Friendships')
        .select('user_id_1, user_id_2')
        .eq('status', 'ACCEPTED')
        .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);

      if (!friendships || friendships.length === 0) {
        useNetworkStore.getState().setFriends([]);
        friendIdsRef.current = [];
        return [];
      }

      const friendIds = friendships.map(f =>
        f.user_id_1 === userId ? f.user_id_2 : f.user_id_1
      );
      friendIdsRef.current = friendIds;

      const { data: profiles } = await supabase
        .from('Profiles')
        .select('id, username')
        .in('id', friendIds);

      if (!profiles) return friendIds;

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: sessions } = await supabase
        .from('Sessions')
        .select('user_id, duration_seconds')
        .in('user_id', friendIds)
        .gte('timestamp', startOfDay.toISOString());

      const dailyTimes: Record<string, number> = {};
      if (sessions) {
        sessions.forEach(s => {
          dailyTimes[s.user_id] = (dailyTimes[s.user_id] || 0) + s.duration_seconds;
        });
      }

      const friendsList = profiles.map(p => ({
        id: p.id,
        username: p.username,
        isOnline: false,
        todaySeconds: dailyTimes[p.id] || 0
      }));
      useNetworkStore.getState().setFriends(friendsList);
      return friendIds;
    } catch (e) {
      console.error('Failed to load friends from DB:', e);
      return [];
    }
  };

  // ─── Step 2: Tell the socket server which friend rooms to join ───────────────
  const joinSocketNetwork = (friendIds: string[]) => {
    if (socket.connected) {
      socket.emit('join_network', friendIds);
    }
  };

  // Expose a combined refetch for Hub.tsx to call after accepting a friend request
  useEffect(() => {
    (window as any).__refetchFriends = async () => {
      if (user) {
        const ids = await loadFriendsFromDB(user.id);
        joinSocketNetwork(ids);
      }
    };
  }, [user]);

  // ─── Load friends immediately when user is known ─────────────────────────────
  useEffect(() => {
    if (!user) return;
    loadFriendsFromDB(user.id);
  }, [user]);

  // ─── Socket setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      socket.disconnect();
      return;
    }

    // Register all persistent event listeners ONCE (outside connect)
    socket.off('friend_presence_update');
    socket.off('receive_ephemeral_message');
    socket.off('nudge_received');
    socket.off('friend_request_received');

    socket.on('friend_presence_update', (data: any) => {
      if (data.stopped) {
        const isOnline = useNetworkStore.getState().friends[data.userId]?.isOnline ?? true;
        updateFriendPresence(data.userId, isOnline, undefined);
        if (data.duration_seconds) {
          useNetworkStore.getState().incrementFriendDailyTime(data.userId, data.duration_seconds);
        }
      } else if (data.statusOnly) {
        const currentSession = useNetworkStore.getState().friends[data.userId]?.activeSession;
        updateFriendPresence(data.userId, data.isOnline, currentSession);
      } else {
        updateFriendPresence(data.userId, true, {
          topic: data.topic,
          timer_type: data.timer_type,
          start_time_iso: data.start_time_iso,
          duration_target: data.duration_target,
        });
      }
    });

    socket.on('receive_ephemeral_message', (data: any) => {
      const friend = useNetworkStore.getState().friends[data.sender_id];
      useNetworkStore.getState().addMessage({
        id: Date.now().toString(),
        senderId: data.sender_id,
        senderName: friend?.username || 'Unknown',
        text: data.message,
        timestamp: Date.now()
      });
    });

    socket.on('nudge_received', (data: any) => {
      // Screen shake effect
      document.body.classList.add('animate-shake');
      setTimeout(() => document.body.classList.remove('animate-shake'), 500);

      // Border flash effect
      document.body.classList.add('nudge-flash');
      setTimeout(() => document.body.classList.remove('nudge-flash'), 1000);

      // Show a toast notification with the sender's name
      const senderId = data?.sender_id;
      const friend = senderId ? useNetworkStore.getState().friends[senderId] : null;
      const senderName = friend?.username || 'Someone';
      useNetworkStore.getState().addMessage({
        id: `nudge-${Date.now()}`,
        senderId: senderId || 'system',
        senderName,
        text: `👊 ${senderName} nudged you!`,
        timestamp: Date.now()
      });
    });

    socket.on('friend_request_received', () => {
      useNetworkStore.getState().addMessage({
        id: Date.now().toString(),
        senderId: 'system',
        senderName: 'System',
        text: 'You received a new friend request!',
        timestamp: Date.now()
      });
      useNetworkStore.getState().incrementFriendRequestRefresh();
    });

    // Auth + join on every (re)connect — gets fresh token each time
    const handleConnect = async () => {
      console.log('Socket connected, authenticating...');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      socket.emit('authenticate', session.access_token, async (response: any) => {
        if (response?.success) {
          console.log('Socket authenticated successfully');
          // Use already-loaded friend IDs from the ref (avoids re-querying DB)
          // But if ref is empty, load again (e.g. cold reconnect)
          let ids = friendIdsRef.current;
          if (ids.length === 0) {
            ids = await loadFriendsFromDB(user.id);
          }
          joinSocketNetwork(ids);

          // Recover active timer state after reconnect
          const localSession = useStore.getState().localSession;
          if (localSession?.isActive) {
            socket.emit('start_timer', {
              topic: localSession.topic,
              timer_type: localSession.type,
              start_time_iso: new Date(localSession.startTime).toISOString(),
              duration_target: localSession.targetDuration
            });
          }
        } else {
          console.error('Socket authentication failed:', response?.error);
        }
      });
    };

    socket.off('connect');
    socket.on('connect', handleConnect);

    socket.off('disconnect');
    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    if (!socket.connected) {
      socket.connect();
    } else {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect');
      socket.off('friend_presence_update');
      socket.off('receive_ephemeral_message');
      socket.off('nudge_received');
      socket.off('friend_request_received');
    };
  }, [user]);
};
