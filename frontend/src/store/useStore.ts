import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { supabase } from '../lib/supabase';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';

interface ActiveTimer {
  userId: string;
  topic: string;
  timer_type: 'POMODORO' | 'STOPWATCH';
  start_time_iso: string;
  duration_target: number;
}

interface EphemeralMessage {
  id: string; // for React key
  sender_id: string;
  text: string;
  timestamp: number;
}

interface AppState {
  socket: Socket | null;
  activeTimers: Record<string, ActiveTimer>;
  messages: EphemeralMessage[];
  isConnected: boolean;
  userProfile: any | null;
  
  initializeSocket: () => Promise<void>;
  disconnectSocket: () => void;
  startTimer: (payload: any) => void;
  stopTimer: () => Promise<void>;
  sendNudge: (target_user_id: string) => void;
  sendEphemeralMessage: (target_user_id: string, text: string) => void;
  setUserProfile: (profile: any) => void;
}

export const useStore = create<AppState>((set, get) => ({
  socket: null,
  activeTimers: {},
  messages: [],
  isConnected: false,
  userProfile: null,

  setUserProfile: (profile) => set({ userProfile: profile }),

  initializeSocket: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Connect to backend via dynamic host IP grabbed from Expo!
    const debuggerHost = Constants.expoConfig?.hostUri;
    const backendUrl = debuggerHost ? `http://${debuggerHost.split(':')[0]}:3000` : 'http://localhost:3000';
    
    const socket = io(backendUrl, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      set({ isConnected: true });
      socket.emit('authenticate', session.access_token, (res: any) => {
        if (res.success) {
          console.log('Socket authenticated');
          supabase.from('Friendships')
            .select('user_id_1, user_id_2')
            .or(`user_id_1.eq.${session.user.id},user_id_2.eq.${session.user.id}`)
            .eq('status', 'ACCEPTED')
            .then(({ data }) => {
              if (data) {
                const friendIds = data.map(f => f.user_id_1 === session.user.id ? f.user_id_2 : f.user_id_1);
                socket.emit('join_network', friendIds);
              }
            });
        }
      });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('friend_presence_update', (payload) => {
      set((state) => {
        const newTimers = { ...state.activeTimers };
        if (payload.stopped) {
          delete newTimers[payload.userId];
        } else {
          newTimers[payload.userId] = payload;
        }
        return { activeTimers: newTimers };
      });
    });
    
    socket.on('receive_ephemeral_message', ({ sender_id, message }) => {
      const msg: EphemeralMessage = {
        id: Math.random().toString(36),
        sender_id,
        text: message,
        timestamp: Date.now()
      };
      set((state) => ({ messages: [...state.messages, msg] }));
      
      const timeoutSec = 5 * 60; // 5 mins
      setTimeout(() => {
        set((state) => ({
          messages: state.messages.filter(m => m.id !== msg.id)
        }));
      }, timeoutSec * 1000);
    });

    socket.on('nudge_received', ({ sender_id }) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      console.log('Nudged by', sender_id);
    });

    set({ socket });
  },
  
  disconnectSocket: () => {
    const { socket } = get();
    if (socket) socket.disconnect();
    set({ socket: null, isConnected: false });
  },

  startTimer: (payload) => {
    const { socket } = get();
    if (socket) socket.emit('start_timer', payload);
  },

  stopTimer: () => {
    return new Promise((resolve) => {
      const { socket } = get();
      if (socket) {
        socket.emit('stop_timer', {}, () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  },

  sendNudge: (target_user_id) => {
    const { socket } = get();
    if (socket) socket.emit('send_nudge', { target_user_id });
  },

  sendEphemeralMessage: (target_user_id, text) => {
    const { socket } = get();
    if (socket) socket.emit('send_ephemeral_message', { target_user_id, message: text });
  }
}));
