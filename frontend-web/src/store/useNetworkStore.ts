import { create } from 'zustand';
import type { ActiveSession, EphemeralMessage } from '../types';

export interface FriendState {
  id: string;
  username: string;
  isOnline: boolean;
  activeSession?: ActiveSession;
  todaySeconds?: number;
}

interface PendingPresenceUpdate {
  id: string;
  isOnline: boolean;
  activeSession?: ActiveSession;
}

interface NetworkState {
  friends: Record<string, FriendState>;
  messages: EphemeralMessage[];
  pendingPresenceUpdates: PendingPresenceUpdate[];
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
  pendingPresenceUpdates: [],
  friendRequestRefresh: 0,
  incrementFriendRequestRefresh: () => set((state) => ({ friendRequestRefresh: state.friendRequestRefresh + 1 })),
  setFriends: (friendsList) => 
    set((state) => {
      const newFriends = { ...state.friends };
      friendsList.forEach(f => {
        if (!newFriends[f.id]) {
          // New friend — add with defaults
          newFriends[f.id] = f;
        } else {
          // Existing friend — update DB fields (username, todaySeconds)
          // but PRESERVE realtime socket state (isOnline, activeSession)
          // so a DB refresh never resets what the socket already told us
          newFriends[f.id] = {
            ...f,
            isOnline: newFriends[f.id].isOnline,
            activeSession: newFriends[f.id].activeSession,
          };
        }
      });

      // Replay any pending presence updates that arrived before friends were loaded
      const remainingPending: PendingPresenceUpdate[] = [];
      state.pendingPresenceUpdates.forEach(update => {
        if (newFriends[update.id]) {
          newFriends[update.id] = {
            ...newFriends[update.id],
            isOnline: update.isOnline,
            activeSession: update.activeSession,
          };
        } else {
          // Friend still not in the list — keep it pending (unlikely but safe)
          remainingPending.push(update);
        }
      });

      return { friends: newFriends, pendingPresenceUpdates: remainingPending };
    }),
  updateFriendPresence: (id, isOnline, activeSession) =>
    set((state) => {
      const friend = state.friends[id];
      if (!friend) {
        // Friend not loaded yet — buffer the update for replay when setFriends runs
        const alreadyBuffered = state.pendingPresenceUpdates.findIndex(p => p.id === id);
        const newPending = [...state.pendingPresenceUpdates];
        const update = { id, isOnline, activeSession };
        if (alreadyBuffered >= 0) {
          newPending[alreadyBuffered] = update; // Replace with latest
        } else {
          newPending.push(update);
        }
        return { pendingPresenceUpdates: newPending };
      }
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
