import { useEffect } from 'react';
import { socket } from '../lib/socket';
import { useStore } from '../store/useStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { supabase } from '../lib/supabase';

export const useSocket = () => {
  const { user } = useStore();
  const { updateFriendPresence } = useNetworkStore();

  useEffect(() => {
    if (!user) {
      socket.disconnect();
      return;
    }

    const initSocket = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      socket.connect();

      socket.on('connect', () => {
        console.log('Socket connected, authenticating...');
        
        // Authenticate via the server's authenticate event
        socket.emit('authenticate', session.access_token, (response: any) => {
          if (response?.success) {
            console.log('Socket authenticated successfully');
            // Fetch friend IDs from supabase and join_network
            fetchFriendsAndJoin();

            // Recover state if a local timer is active
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
      });

      socket.on('friend_presence_update', (data: any) => {
        if (data.stopped) {
          // Friend stopped their timer — clear their active session
          updateFriendPresence(data.userId, true, undefined);
        } else {
          // Friend started or updated their timer
          updateFriendPresence(data.userId, true, {
            topic: data.topic,
            timer_type: data.timer_type,
            start_time_iso: data.start_time_iso,
            duration_target: data.duration_target,
          });
        }
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
      });

      socket.on('receive_ephemeral_message', (data: any) => {
        // Find friend to get their name
        const friend = useNetworkStore.getState().friends[data.sender_id];
        
        useNetworkStore.getState().addMessage({
          id: Date.now().toString(),
          senderId: data.sender_id,
          senderName: friend?.username || 'Unknown',
          text: data.message,
          timestamp: Date.now()
        });
      });

      socket.on('nudge_received', () => {
        // Trigger a visual shake effect on the whole page
        document.body.classList.add('animate-shake');
        setTimeout(() => {
          document.body.classList.remove('animate-shake');
        }, 500);
      });

      socket.on('friend_request_received', () => {
        useNetworkStore.getState().addMessage({
          id: Date.now().toString(),
          senderId: 'system',
          senderName: 'System',
          text: 'You received a new friend request!',
          timestamp: Date.now()
        });
        // We trigger the refresh counter in the store
        if (useNetworkStore.getState().incrementFriendRequestRefresh) {
          useNetworkStore.getState().incrementFriendRequestRefresh();
        }
      });
    };

    const fetchFriendsAndJoin = async () => {
      try {
        const { data: friendships } = await supabase
          .from('Friendships')
          .select('user_id_1, user_id_2')
          .eq('status', 'ACCEPTED');

        if (!friendships || friendships.length === 0) {
          socket.emit('join_network', []);
          return;
        }

        const friendIds = friendships.map(f => 
          f.user_id_1 === user.id ? f.user_id_2 : f.user_id_1
        );

        const { data: profiles } = await supabase
          .from('Profiles')
          .select('id, username')
          .in('id', friendIds);

        if (profiles) {
          const friendsList = profiles.map(p => ({
            id: p.id,
            username: p.username,
            isOnline: false
          }));
          useNetworkStore.getState().setFriends(friendsList);
          socket.emit('join_network', profiles.map(p => p.id));
        }
      } catch (e) {
        console.error('Failed to fetch friends:', e);
      }
    };

    initSocket();

    return () => {
      socket.off('connect');
      socket.off('friend_presence_update');
      socket.off('disconnect');
      socket.off('receive_ephemeral_message');
      socket.off('nudge_received');
      socket.off('friend_request_received');
    };
  }, [user]);
};
