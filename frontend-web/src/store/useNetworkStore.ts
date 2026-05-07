import { create } from 'zustand';

export interface ActiveSession {
  topic: string;
  timer_type: 'POMODORO' | 'STOPWATCH';
  start_time_iso: string;
  duration_target?: number;
}

export interface FriendState {
  id: string;
  username: string;
  isOnline: boolean;
  activeSession?: ActiveSession;
}

export interface EphemeralMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

interface NetworkState {
  friends: Record<string, FriendState>;
  messages: EphemeralMessage[];
  setFriends: (friends: FriendState[]) => void;
  updateFriendPresence: (id: string, isOnline: boolean, activeSession?: ActiveSession) => void;
  addMessage: (msg: EphemeralMessage) => void;
  removeMessage: (id: string) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  friends: {},
  messages: [],
  setFriends: (friendsList) => 
    set((state) => {
      const newFriends = { ...state.friends };
      friendsList.forEach(f => {
        if (!newFriends[f.id]) {
          newFriends[f.id] = f;
        } else {
          newFriends[f.id] = { ...newFriends[f.id], ...f };
        }
      });
      return { friends: newFriends };
    }),
  updateFriendPresence: (id, isOnline, activeSession) =>
    set((state) => {
      const friend = state.friends[id];
      if (!friend) return state;
      return {
        friends: {
          ...state.friends,
          [id]: { ...friend, isOnline, activeSession }
        }
      };
    }),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  removeMessage: (id) => set((state) => ({ messages: state.messages.filter(m => m.id !== id) })),
}));
