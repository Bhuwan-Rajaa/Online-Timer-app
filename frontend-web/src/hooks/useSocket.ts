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

      socket.auth = { token: session.access_token };
      socket.connect();

      socket.on('connect', () => {
        console.log('Socket connected');
        // Fetch friend IDs from supabase and join_network
        fetchFriendsAndJoin();
      });

      socket.on('friend_presence_update', (data: { userId: string, activeSession: any }) => {
        updateFriendPresence(data.userId, true, data.activeSession);
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
    };

    const fetchFriendsAndJoin = async () => {
      // In a real app, you would query the Friendships table here.
      // For now, we'll just join with an empty array or handle it simply.
      // E.g., const { data } = await supabase.from('Friendships')...
      socket.emit('join_network', []);
    };

    initSocket();

    return () => {
      socket.off('connect');
      socket.off('friend_presence_update');
      socket.off('disconnect');
    };
  }, [user]);
};
