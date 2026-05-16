import { create } from 'zustand';
import type { ActiveSession, EphemeralMessage } from '../types';

export interface FriendState {
  id: string;
  username: string;
  isOnline: boolean;
  activeSession?: ActiveSession;
  todaySeconds?: number;
}

interface NetworkState {
  friends: Record<string, FriendState>;
  messages: EphemeralMessage[];
  setFriends: (friends: FriendState[]) => void;
  updateFriendPresence: (id: string, isOnline: boolean, activeSession?: ActiveSession) => void;
  addMessage: (msg: EphemeralMessage) => void;
  removeMessage: (id: string) => void;
  friendRequestRefresh: number;
  incrementFriendRequestRefresh: () => void;
  incrementFriendDailyTime: (id: string, seconds: number) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  friends: {},
  messages: [],
  friendRequestRefresh: 0,
  incrementFriendRequestRefresh: () => set((state) => ({ friendRequestRefresh: state.friendRequestRefresh + 1 })),
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
  incrementFriendDailyTime: (id, seconds) =>
    set((state) => {
      const friend = state.friends[id];
      if (!friend) return state;
      return {
        friends: {
          ...state.friends,
          [id]: { ...friend, todaySeconds: (friend.todaySeconds || 0) + seconds }
        }
      };
    }),
}));
