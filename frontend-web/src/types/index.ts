export type TimerType = 'POMODORO' | 'STOPWATCH';

export interface ActiveSession {
  topic: string;
  timer_type: TimerType;
  start_time_iso: string;
  duration_target?: number;
}

export interface EphemeralMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface StartTimerPayload {
  topic: string;
  timer_type: TimerType;
  start_time_iso: string;
  duration_target?: number;
}

export interface FriendPresenceUpdate {
  userId: string;
  stopped?: boolean;
  topic?: string;
  timer_type?: TimerType;
  start_time_iso?: string;
  duration_target?: number;
}
