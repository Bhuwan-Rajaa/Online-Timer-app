import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import type { TimerType } from '../types';

export interface LocalSession {
  topic: string;
  type: TimerType;
  startTime: number; // timestamp
  targetDuration?: number; // in seconds
  isActive: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  has_onboarded: boolean;
  weekly_goal_minutes?: number;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  localSession: LocalSession | null;
  
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setLocalSession: (session: LocalSession | null) => void;
}

export const useStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  localSession: null,
  
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setLocalSession: (localSession) => set({ localSession }),
}));
