# Comprehensive Technical Documentation: Multiplayer Study Timer App (v2.0)

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Backend Documentation](#3-backend-documentation)
4. [Frontend Documentation](#4-frontend-documentation)
5. [Database Schema](#5-database-schema)
6. [API & WebSocket Specification](#6-api--websocket-specification)
7. [Deployment & DevOps](#7-deployment--devops)
8. [Security & Privacy](#8-security--privacy)
9. [Performance & Scalability](#9-performance--scalability)
10. [Development Workflow](#10-development-workflow)

---

## 1. Project Overview

### 1.1 Mission Statement
The Multiplayer Study Timer App is a subscription-free, real-time collaborative study platform designed for developers, students, and knowledge workers. It combines the motivational power of co-presence with flexible time-tracking capabilities, enabling users to study together asynchronously without intrusive notifications, maintaining a minimalist and developer-friendly interface.

### 1.2 Core Features

#### 1.2.1 Real-Time Presence System
- **Live Roster**: Friends are displayed as avatars with activity status indicators (pulsing ring animation when actively studying)
- **Active Sessions Feed**: Shows what each friend is currently studying, including:
  - Study topic/subject
  - Timer mode (Pomodoro or Stopwatch)
  - Elapsed or remaining time
  - Zero polling—all updates via WebSocket
- **Automatic Sync**: When the app returns to focus, the client syncs with server to refresh presence state

#### 1.2.2 Dual-Mode Study Timers
- **Pomodoro Mode**: 
  - Fixed-duration focused work sessions (typically 25 minutes)
  - Visual countdown ring animation
  - Depleting circular progress indicator
  - Local push notification at completion
  - Configurable session lengths
  
- **Stopwatch Mode**: 
  - Unlimited duration, user-controlled study tracking
  - Counts upward from zero
  - Soft expanding wave animations (Lottie)
  - Manual stop trigger
  - Ideal for open-ended deep work

#### 1.2.3 Weekly Leaderboards with History
- **Weekly Sprint**: Resets every Monday (00:00 UTC)
  - Total study hours per friend in current week
  - Ranked by cumulative duration
  - Live update as friends complete sessions
  
- **Historical Vault**: All-time data retention
  - GitHub-style heatmap showing study activity by day
  - Accessible from Profile screen
  - Never loses past session data despite weekly reset

#### 1.2.4 Ephemeral Messaging
- **Temporary Messages**: Direct messages between friends that auto-expire
  - 5-minute display lifetime
  - Fades opacity before disappearing
  - No database writes—purely in-memory
  - Survives app backgrounding during the 5-minute window
  
- **Nudge Mechanic**: 
  - One-tap gesture to "nudge" (motivate) a friend
  - Triggers haptic feedback (Heavy Impact) on recipient's device
  - Brief screen border flash in accent color
  - Non-intrusive attention grab without system notifications

### 1.3 Target Platforms & Release Roadmap

#### Phase 1 (Current - Q2 2024)
- **Android via Expo Go** (for development and testing)
- **Android APK** (Standalone, shareable via Discord/WhatsApp)
- React Native + TypeScript
- Supabase free tier + Render free tier

#### Phase 2 (Q3 2024)
- **Web Frontend** (React + Vite)
- Responsive design for tablets and desktops
- Feature parity with mobile (except haptics)
- GitHub-style deploy to Vercel

#### Phase 3 (Q4 2024+)
- **iOS via App Store**
- TestFlight beta distribution
- Full native iOS features (HealthKit integration)

### 1.4 Architecture Philosophy

#### 1.4.1 Strict Decoupling: Persistent vs. Real-Time
The application separates concerns into two independent backend services:

1. **Persistent Layer** (Supabase):
   - Handles Authentication (JWT via GoTrue)
   - Stores user profiles, friendships, and completed sessions
   - Provides data consistency and durability
   - Replicated, redundant, backed by PostgreSQL

2. **Real-Time Layer** (Node.js + Socket.IO):
   - Handles ephemeral presence and messaging
   - Operates entirely in-memory (no persistence)
   - Scales independently based on concurrent users
   - Can be restarted without losing app functionality

The **client acts as the orchestrator**: it manages its local state, coordinates timers, and syncs session data to Supabase only when a session completes.

#### 1.4.2 Zero-Cost Operations on Free Tiers

**Supabase Free Tier Targets**:
- No row-level security (RLS) bottlenecks—optimized SQL queries with indexed friend lookups
- Session inserts only on completion—minimizes write operations
- Minimal API calls—presence updates never hit Supabase

**Render Free Tier Targets**:
- Horizontal scaling via multiple Socket.IO instances behind a load balancer
- Sticky sessions to reduce reconnects
- In-memory state—no database queries from the real-time layer
- Auto-sleep on inactivity (handled gracefully by client reconnect logic)

#### 1.4.3 Graceful Degradation

**If Socket.IO Server is Down**:
- Timers continue running locally
- Session completion still saves to Supabase (via fallback API call)
- Presence updates fail silently; user sees stale friend status

**If Supabase is Down**:
- Auth fails, but cached sessions persist
- Local timers continue—no loss of tracking
- Session saves fail, but user is notified

**Reconnection Strategy**:
- Automatic retry with exponential backoff
- `AppState` listener triggers presence resync on app focus
- Ephemeral messages in the queue are retried

#### 1.4.4 Privacy & Minimalism

- **No Ads, Tracking, or Telemetry**: Core requirement for developer audience
- **Dark Mode Only**: Minimalist, low-power design
- **Minimal Notifications**: No push spam; only local alarms for timer completion
- **Data Minimalism**: Only tracks username, friendships, and study sessions—no analytics beyond that

---

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND CLIENTS                         │
│  ┌───────────────────┐                ┌──────────────────┐      │
│  │ React Native App  │                │   React Web App  │      │
│  │  (Android/iOS)    │                │   (Desktop/Tab)  │      │
│  │  + Zustand Store  │                │  + Zustand Store │      │
│  └──────┬────────────┘                └────────┬─────────┘      │
└─────────┼────────────────────────────────────────┼───────────────┘
          │                                        │
          │ (JWT + WebSocket)                     │ (JWT + WebSocket)
          │                                        │
          ├────────────────────┬───────────────────┤
          │                    │                   │
┌─────────▼──────────────────┐ │  ┌────────────────▼──────────────┐
│  SOCKET.IO SERVER (REAL-TIME)  │  │  SUPABASE (PERSISTENT)       │
│  Node.js + Express + Socket.io │  │  PostgreSQL + GoTrue Auth    │
│                                │  │                              │
│  • In-Memory Active Timers  │  │  • User Profiles          │
│  • Ephemeral Messages       │  │  • Friendships Network    │
│  • Friend Presence Rooms    │  │  • Completed Sessions     │
│  • JWT Verification         │  │  • RLS Policies           │
│                                │  │  • Indexing & Queries    │
│  Running on:                │  │  Running on:              │
│  Render Free Tier           │  │  Supabase Free Tier       │
└────────────────────────────────┘  └──────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Purpose | Why Chosen |
|-------|-----------|---------|-----------|
| **Frontend (Mobile)** | React Native + Expo | Cross-platform native app | Fast iteration, live reload, cross-platform |
| **Frontend (Web)** | React + Vite + React Router | Single-page web app | Fast dev server, optimal bundle size, lazy routing |
| **State (Mobile)** | Zustand | Lightweight state management | Small bundle, fast performance, no boilerplate |
| **State (Web)** | Zustand + Custom hooks | Centralized store | Fast socket syncs, no Redux overhead |
| **Real-Time** | Socket.IO (Node.js + Express) | WebSocket & fallback transport | Reliable, auto-reconnect, backward compat |
| **Authentication** | Supabase Auth (GoTrue) | JWT-based auth | Free tier, secure, built-in RLS support |
| **Database** | PostgreSQL (Supabase) | Persistent data | ACID compliance, powerful RLS, free tier |
| **Animations (Mobile)** | React Native Reanimated + Lottie | Smooth, performant animations | 60fps on devices, GPU-accelerated |
| **Animations (Web)** | CSS transitions + Lucide icons | Lightweight animations | No extra dependencies, browser-optimized |
| **Haptics (Mobile)** | Expo Haptics | Device feedback | Tactile nudge notifications |
| **Storage (Mobile)** | Expo Secure Store | Secure JWT storage | OS-level encryption, no plain-text secrets |
| **Deployment** | Render + Vercel | Free hosting with CI/CD | Automatic deploys, generous free tiers |

### 2.3 Data Flow Diagram

#### User Registration & Login Flow
```
1. User enters email + password on Login screen
2. Frontend calls supabase.auth.signUp()
3. Supabase validates, hashes password with bcrypt, creates auth.users entry
4. JWT returned to client, stored securely via expo-secure-store
5. Frontend automatically navigates to Onboarding
6. User claims username (debounced Supabase query to check uniqueness)
7. Profile created in Supabase with has_onboarded = false → true
8. Socket.IO connection initialized with JWT
```

#### Starting a Study Session
```
1. User taps "Start Pomodoro" or "Start Stopwatch"
2. Frontend creates local timer state in Zustand store
3. Frontend emits 'start_timer' event to Socket.IO server
   Payload: { topic, timer_type, start_time_iso, duration_target }
4. Server stores in-memory activeTimers[userId] = payload
5. Server broadcasts 'friend_presence_update' to all users in friend_network_${userId} room
6. All other friends receive update and display on Hub roster
7. (Optional) Frontend schedules local push notification for Pomodoro end time
8. Timer counts down/up on frontend with zero database writes
```

#### Completing a Study Session
```
1. User taps "Stop" or timer expires naturally
2. Frontend emits 'stop_timer' event to server
3. Server calculates duration: (Date.now() - start_time_iso) / 1000 seconds
4. Server inserts into Supabase Sessions table with user_id, topic, timer_type, duration_seconds
5. Server broadcasts 'friend_presence_update' with stopped: true to friend network
6. Server deletes activeTimers[userId]
7. Frontend optimistically updates local leaderboard state
8. Friend network notified—they remove user from active roster
```

#### Receiving an Ephemeral Message
```
1. Friend A taps message input, types text, presses send
2. Frontend emits 'send_ephemeral_message' event with { target_user_id: B, message: "text" }
3. Server receives, immediately emits 'receive_ephemeral_message' to user_${B} room
4. Friend B's client receives event, adds message to Zustand messages array
5. Message displayed with sender's username + timestamp
6. Frontend sets 5-minute timeout on message
7. After 5 minutes, message automatically removed from Zustand store
8. No database write occurs
9. If app is closed during the 5 minutes, Zustand store is destroyed (messages lost)
```

---

## 3. Backend Documentation

### 3.1 Persistent Data Layer (Supabase + PostgreSQL)

#### 3.1.1 Authentication System

**Overview**: Uses Supabase Auth (GoTrue) for email/password-based authentication with JWT tokens.

**Authentication Flow**:

1. **Registration**:
   - User submits email + password on frontend
   - Frontend calls `supabase.auth.signUp(email, password)`
   - Supabase validates email format, checks uniqueness
   - Password hashed with bcrypt (cost factor: 10), salted
   - Entry created in `auth.users` table
   - Confirmation email sent (if email verification enabled)
   - JWT access token + refresh token returned
   - Frontend stores access token in `expo-secure-store` (encrypted)

2. **Login**:
   - User submits email + password
   - Frontend calls `supabase.auth.signIn(email, password)`
   - Supabase verifies password against stored hash
   - JWT access token + refresh token returned
   - Auto-stored by Supabase client library

3. **Session Persistence**:
   - JWT stored securely on device (expo-secure-store)
   - On app startup, frontend retrieves JWT and verifies with `supabase.auth.getSession()`
   - Supabase client automatically attaches JWT to all API requests
   - Auto-refresh: refresh token used to fetch new access token before expiry

4. **Socket.IO Authentication**:
   - Frontend retrieves access token from `supabase.auth.getSession()`
   - Passes JWT to Socket.IO via 'authenticate' event
   - Server calls `supabase.auth.getUser(jwt)` to verify token and extract user ID
   - Server stores user object on socket instance for subsequent emits
   - If verification fails, socket disconnects

**JWT Structure** (OpenID Connect compatible):
```json
{
  "iss": "https://[project].supabase.co",
  "aud": "authenticated",
  "exp": 1234567890,
  "iat": 1234567800,
  "sub": "user-uuid",
  "email": "user@example.com",
  "phone": "",
  "app_metadata": { "provider": "email" },
  "user_metadata": { "created_at": "..." }
}
```

#### 3.1.2 Database Schema & Indexing

**Complete PostgreSQL Schema** (see `supabase_schema.sql`):

##### Profiles Table
```sql
CREATE TABLE public."Profiles" (
    id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    username text UNIQUE NOT NULL,
    has_onboarded boolean DEFAULT false,
    weekly_goal_minutes integer DEFAULT 120,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX idx_profiles_username ON public."Profiles"(username);
```

**Purpose**: Stores public user metadata and onboarding status.

**Fields**:
- `id`: Foreign key to auth.users; identifies user globally
- `username`: Unique alphanumeric identifier (debounced checked on frontend)
- `has_onboarded`: Boolean flag; if false, user redirected to Onboarding screen
- `weekly_goal_minutes`: Target study minutes per week (informational, not enforced)
- `created_at`: Account creation timestamp

**Indexing Strategy**:
- Primary key on `id` (auto-indexed)
- Unique index on `username` (for debounced availability checks)
- Scan pattern: `SELECT * FROM Profiles WHERE username = 'alice'` (indexed)

##### Friendships Table
```sql
CREATE TYPE friendship_status AS ENUM ('PENDING', 'ACCEPTED');

CREATE TABLE public."Friendships" (
    user_id_1 uuid NOT NULL REFERENCES public."Profiles"(id) ON DELETE CASCADE,
    user_id_2 uuid NOT NULL REFERENCES public."Profiles"(id) ON DELETE CASCADE,
    status friendship_status DEFAULT 'PENDING',
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (user_id_1, user_id_2),
    CHECK (user_id_1 < user_id_2)
);

CREATE INDEX idx_friendships_users ON public."Friendships"(user_id_1, user_id_2);
```

**Purpose**: Manages the social graph and access control for presence/sessions.

**Fields**:
- `user_id_1`, `user_id_2`: Foreign keys to Profiles; ordered to ensure unique pairs (user_id_1 < user_id_2)
- `status`: Enum('PENDING', 'ACCEPTED'); controls visibility of sessions
- `created_at`: Friendship request timestamp

**Constraints**:
- `CHECK (user_id_1 < user_id_2)`: Ensures (Alice, Bob) and (Bob, Alice) are stored as one pair with lower UUID first
- `PRIMARY KEY (user_id_1, user_id_2)`: Prevents duplicate friendships
- `ON DELETE CASCADE`: Deletes friendships if either user is deleted

**Indexing Strategy**:
- Primary key is composite (user_id_1, user_id_2), optimizes lookups in both directions
- Query: `SELECT * FROM Friendships WHERE user_id_1 = $1 OR user_id_2 = $1` (uses primary key index)

**Query Patterns**:
```sql
-- Get all friends of user X
SELECT user_id_1, user_id_2 FROM Friendships 
WHERE (user_id_1 = $1 OR user_id_2 = $1) 
AND status = 'ACCEPTED';

-- Check if X and Y are friends
SELECT EXISTS (
    SELECT 1 FROM Friendships 
    WHERE (user_id_1 = X AND user_id_2 = Y AND Y > X) 
       OR (user_id_1 = Y AND user_id_2 = X AND X > Y)
    AND status = 'ACCEPTED'
);
```

##### Sessions Table
```sql
CREATE TYPE timer_type AS ENUM ('POMODORO', 'STOPWATCH');

CREATE TABLE public."Sessions" (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public."Profiles"(id) ON DELETE CASCADE,
    topic text,
    timer_type timer_type NOT NULL,
    duration_seconds integer NOT NULL,
    timestamp timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_sessions_user_time ON public."Sessions"(user_id, timestamp DESC);
```

**Purpose**: Immutable ledger of all completed study sessions; basis for leaderboards and history.

**Fields**:
- `id`: UUID, auto-generated
- `user_id`: Foreign key to Profiles
- `topic`: Study subject (e.g., "React Hooks", "Calculus Chapter 3")
- `timer_type`: Enum('POMODORO', 'STOPWATCH')
- `duration_seconds`: Integer; actual time spent (may differ from target for Pomodoro if interrupted)
- `timestamp`: When session was completed; server sets this, not trusting client

**Indexing Strategy**:
- Composite index on `(user_id, timestamp DESC)` crucial for leaderboard queries:
  - Monthly: `WHERE user_id = X AND timestamp > DATE_TRUNC('week', now() - interval '1 week')`
  - Historical: `WHERE user_id = X AND timestamp > DATE_TRUNC('month', now() - interval '1 month')`
  - Without index: full table scan = scalability issue

**Query Patterns**:
```sql
-- Weekly leaderboard (current week)
SELECT user_id, SUM(duration_seconds) as total_seconds
FROM Sessions
WHERE timestamp > DATE_TRUNC('week', now())
GROUP BY user_id
ORDER BY total_seconds DESC;

-- User's sessions in date range
SELECT * FROM Sessions
WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
ORDER BY timestamp DESC;

-- All-time heatmap data (grouped by day)
SELECT DATE(timestamp) as day, SUM(duration_seconds) as total
FROM Sessions
WHERE user_id = $1
GROUP BY day
ORDER BY day DESC;
```

#### 3.1.3 Row-Level Security (RLS) Policies

**Purpose**: Ensures users can only access data they own or are friends with.

**Security Definer Function**:
```sql
CREATE OR REPLACE FUNCTION public.is_friend(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public."Friendships"
        WHERE (user_id_1 = auth.uid() AND user_id_2 = target_user_id AND status = 'ACCEPTED')
           OR (user_id_1 = target_user_id AND user_id_2 = auth.uid() AND status = 'ACCEPTED')
    );
END;
$$;
```

**Why SECURITY DEFINER?**:
- Runs with elevated privileges (schema owner, not user)
- Prevents RLS bypass via false OR conditions
- Single trusted function replaces complex policies

**RLS Policies by Table**:

**Profiles Policies**:
```sql
-- SELECT: Public read (anyone can search usernames)
CREATE POLICY "Profiles are selectable by public" ON public."Profiles" 
FOR SELECT USING (true);

-- INSERT: Only auth'd user can insert their own profile
CREATE POLICY "Users can insert their own profile" ON public."Profiles" 
FOR INSERT WITH CHECK (auth.uid() = id);

-- UPDATE: Only auth'd user can update their own profile
CREATE POLICY "Users can update own profile" ON public."Profiles" 
FOR UPDATE USING (auth.uid() = id);
```

**Friendships Policies**:
```sql
-- SELECT: Can see friendships you're part of
CREATE POLICY "Users can see friendships they are part of" ON public."Friendships" 
FOR SELECT USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- INSERT: Can create friendships you're part of
CREATE POLICY "Users can insert friendships they are part of" ON public."Friendships" 
FOR INSERT WITH CHECK (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- UPDATE: Can update friendships you're part of
CREATE POLICY "Users can update friendships they are part of" ON public."Friendships" 
FOR UPDATE USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
```

**Sessions Policies**:
```sql
-- INSERT: Can only insert sessions for yourself
CREATE POLICY "Users can insert their own sessions" ON public."Sessions" 
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- SELECT: Can see your sessions OR sessions of accepted friends
CREATE POLICY "Users can view own or friends sessions" ON public."Sessions" 
FOR SELECT USING (
    user_id = auth.uid() OR public.is_friend(user_id)
);
```

**Performance Considerations**:
- RLS is applied per-query; complex policies may slow reads
- For leaderboards, pre-compute aggregates if RLS becomes bottleneck (future optimization)
- Current setup handles ~1000 users easily on free tier

---

### 3.2 Real-Time Layer (Node.js + Socket.IO)

#### 3.2.1 Server Architecture

**File**: `backend/server.ts`

**Initialization**:
```typescript
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingInterval: 10000,    // Send heartbeat every 10s
  pingTimeout: 5000,      // Wait 5s for pong before disconnecting
  transports: ['websocket', 'polling'],  // WebSocket primary, HTTP polling fallback
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO Server running on port ${PORT}`);
});
```

**Key Configuration**:
- `pingInterval: 10000`: Server sends ping every 10 seconds
- `pingTimeout: 5000`: If client doesn't respond within 5 seconds, close connection
- `transports: ['websocket', 'polling']`: Use WebSocket if available, fallback to HTTP long-polling on older networks

**In-Memory State**:
```typescript
const activeTimers = new Map<string, any>(); // userId -> timerPayload
```

This is the core of the real-time presence system. Example entry:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "topic": "TypeScript Generics",
  "timer_type": "POMODORO",
  "start_time_iso": "2024-05-10T12:45:09.787Z",
  "duration_target": 1500
}
```

**No Persistence**: 
- Exists only in Node.js heap
- Lost on server restart (acceptable; clients reconnect and resync)
- Scales linearly with concurrent users
- No database I/O for presence updates (crucial for free tier)

#### 3.2.2 Connection Lifecycle

**1. Connection Event**:
```typescript
io.on('connection', (socket: AuthenticatedSocket) => {
  console.log('New connection:', socket.id);
  // socket.id is a unique socket identifier assigned by Socket.IO
  // User is NOT yet authenticated at this point
});
```

**2. Authentication Event**:
```typescript
socket.on('authenticate', async (jwt: string, callback) => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(jwt);
    if (error || !user) {
      if(callback) callback({ success: false, error: 'Authentication failed' });
      return;
    }
    
    socket.user = user;
    socket.join(`user_${user.id}`); // Join private room for direct messages
    console.log(`User ${user.id} authenticated on socket ${socket.id}`);
    if(callback) callback({ success: true, userId: user.id });
  } catch (err) {
    console.error('Auth server error:', err);
    if(callback) callback({ success: false, error: 'Server error' });
  }
});
```

**Flow**:
1. Client sends JWT (from Supabase)
2. Server calls `supabase.auth.getUser(jwt)` to verify
3. If valid, server stores user object on socket
4. Socket joins room `user_${userId}` for private messages
5. Callback sent to client with success status

**3. Join Network Event**:
```typescript
socket.on('join_network', (friendIds: string[]) => {
  if (!socket.user) return; // Must be authenticated first
  
  friendIds.forEach(id => {
    socket.join(`friend_network_${id}`);  // Subscribe to friend's updates
    const activeTimer = activeTimers.get(id);
    if (activeTimer) {
      socket.emit('friend_presence_update', activeTimer); // Sync existing state
    }
  });
});
```

**Purpose**: Subscribe socket to friend-specific rooms for presence broadcasts.

**Example**:
- User Alice has friends Bob, Charlie, Dana
- Frontend fetches list of accepted friendships from Supabase
- Emits `join_network(['bob_uuid', 'charlie_uuid', 'dana_uuid'])`
- Socket joins rooms: `friend_network_bob_uuid`, `friend_network_charlie_uuid`, `friend_network_dana_uuid`
- If Bob is currently studying, Alice immediately receives his active timer state

#### 3.2.3 Timer Events

**Start Timer**:
```typescript
socket.on('start_timer', (payload) => {
  if (!socket.user) return;
  const { topic, timer_type, start_time_iso, duration_target } = payload;
  const timerData = {
    userId: socket.user.id,
    topic,
    timer_type,
    start_time_iso,
    duration_target
  };
  activeTimers.set(socket.user.id, timerData);
  
  // Broadcast to all sockets in my friend_network_${userId} room
  socket.to(`friend_network_${socket.user.id}`).emit('friend_presence_update', timerData);
});
```

**Broadcast Logic**:
- `socket.to(room)` = all sockets in room EXCEPT the sender
- Sending user sees their own state via local Zustand state (no echo)
- All friends in `friend_network_${userId}` room receive broadcast

**Example Payload**:
```json
{
  "userId": "alice_uuid",
  "topic": "React Hooks",
  "timer_type": "POMODORO",
  "start_time_iso": "2024-05-10T12:45:09.787Z",
  "duration_target": 1500
}
```

**Stop Timer**:
```typescript
socket.on('stop_timer', async (data, callback) => {
  if (!socket.user) {
    if (callback) callback();
    return;
  }
  
  const activeTimer = activeTimers.get(socket.user.id);
  if (activeTimer) {
    activeTimers.delete(socket.user.id);
    
    // Calculate actual duration
    const startTime = new Date(activeTimer.start_time_iso).getTime();
    const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    // Save to Supabase
    try {
      await supabase.from('Sessions').insert({
        user_id: socket.user.id,
        topic: activeTimer.topic,
        timer_type: activeTimer.timer_type,
        duration_seconds: durationSeconds
      });
      console.log(`Saved session for ${socket.user.id}: ${durationSeconds}s`);
    } catch (err) {
      console.error('Failed to save session:', err);
      // Session data is lost if insert fails (future: add retry queue)
    }

    // Broadcast stopped state to friends
    socket.to(`friend_network_${socket.user.id}`).emit('friend_presence_update', {
      userId: socket.user.id,
      stopped: true
    });
  }
  if (callback) callback(); // Notify client that stop is processed
});
```

**Key Logic**:
- Calculate duration: `(Date.now() - startTime) / 1000` seconds
- Server calculates, not client (trust server time, prevents cheating)
- Insert into Sessions table with calculated duration
- Broadcast `stopped: true` so friends remove user from active roster
- Delete from activeTimers in-memory map

**Graceful Disconnection**:
```typescript
socket.on('disconnect', async () => {
  if (socket.user) {
    const activeTimer = activeTimers.get(socket.user.id);
    if (activeTimer) {
      activeTimers.delete(socket.user.id);
      
      // Calculate duration and save (same logic as stop_timer)
      const startTime = new Date(activeTimer.start_time_iso).getTime();
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      
      try {
        await supabase.from('Sessions').insert({
          user_id: socket.user.id,
          topic: activeTimer.topic,
          timer_type: activeTimer.timer_type,
          duration_seconds: durationSeconds
        });
      } catch (err) {
        console.error('Failed to save session on disconnect:', err);
      }

      // Notify friends
      socket.to(`friend_network_${socket.user.id}`).emit('friend_presence_update', {
        userId: socket.user.id,
        stopped: true
      });
    }
  }
  console.log('Socket disconnected:', socket.id);
});
```

**Purpose**: If user's app crashes or network drops while studying, we still record the session and notify friends.

#### 3.2.4 Messaging Events

**Ephemeral Message**:
```typescript
socket.on('send_ephemeral_message', ({ target_user_id, message }) => {
  if (!socket.user) return;
  io.to(`user_${target_user_id}`).emit('receive_ephemeral_message', {
    sender_id: socket.user.id,
    message
  });
});
```

**Flow**:
1. Sender emits event with target user and message text
2. Server receives, immediately emits to `user_${target_user_id}` room
3. No database write; pure in-memory relay
4. Recipient's client receives, adds to Zustand messages array
5. Frontend sets 5-minute timeout; message fades and disappears

**Nudge**:
```typescript
socket.on('send_nudge', ({ target_user_id }) => {
  if (!socket.user) return;
  io.to(`user_${target_user_id}`).emit('nudge_received', {
    sender_id: socket.user.id
  });
});
```

**Trigger on Recipient**:
- Haptic feedback: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)`
- Screen briefly flashes accent color (border)
- Non-intrusive attention grab

---

## 4. Frontend Documentation

### 4.1 Frontend Platforms Overview

The app has **two independent frontends**:

1. **React Native Frontend** (Mobile - Android/iOS)
   - Located: `frontend/`
   - Tech: React Native + Expo + TypeScript
   - Deployment: EAS Build → APK/IPA
   - Status: In development (Phase 1)

2. **React Web Frontend** (Desktop/Tablet)
   - Located: `frontend-web/`
   - Tech: React + Vite + TypeScript
   - Deployment: Vercel
   - Status: In development (Phase 2)

Both share similar architecture (Zustand stores, Socket.IO integration) but differ in UI components and platform-specific features.

---

### 4.2 React Native Frontend (Mobile)

#### 4.2.1 Project Structure

```
frontend/
├── src/
│   ├── lib/
│   │   └── supabase.ts          # Supabase client initialization
│   ├── store/
│   │   └── useStore.ts          # Zustand store (socket + state)
│   ├── screens/
│   │   ├── LoginScreen.tsx      # Auth (email/password)
│   │   ├── HubScreen.tsx        # Main dashboard (roster + leaderboard)
│   │   └── ActiveSessionScreen.tsx  # Timer UI (Pomodoro/Stopwatch)
│   └── assets/
├── App.tsx                       # Root navigation
├── app.json                      # Expo config
├── package.json
├── tsconfig.json
└── index.ts                      # Entry point
```

#### 4.2.2 Supabase Client Initialization

**File**: `src/lib/supabase.ts`

```typescript
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    SecureStore.deleteItemAsync(key);
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter as any,  // Use OS-level secure storage
    autoRefreshToken: true,                  // Auto-refresh JWT before expiry
    persistSession: true,                    // Persist JWT across app restarts
    detectSessionInUrl: false,               // Disable URL-based auth (no deep linking)
  },
});
```

**Why Expo Secure Store?**:
- JWTs stored in `SecureStore`, not plain AsyncStorage
- OS-level encryption (Keychain on iOS, KeyStore on Android)
- Immune to device memory dumps
- Supabase client auto-handles refresh token

#### 4.2.3 Zustand Store

**File**: `src/store/useStore.ts`

```typescript
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
  id: string;
  sender_id: string;
  text: string;
  timestamp: number;
}

interface AppState {
  socket: Socket | null;
  activeTimers: Record<string, ActiveTimer>;  // userId -> timer data
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

    // Dynamic backend URL (works with Expo debugger)
    const debuggerHost = Constants.expoConfig?.hostUri;
    const backendUrl = debuggerHost 
      ? `http://${debuggerHost.split(':')[0]}:3000` 
      : 'http://localhost:3000';
    
    const socket = io(backendUrl, {
      transports: ['websocket'],
    });

    // Connection established
    socket.on('connect', () => {
      set({ isConnected: true });
      socket.emit('authenticate', session.access_token, (res: any) => {
        if (res.success) {
          console.log('Socket authenticated');
          
          // Fetch accepted friendships and join network
          supabase.from('Friendships')
            .select('user_id_1, user_id_2')
            .or(`user_id_1.eq.${session.user.id},user_id_2.eq.${session.user.id}`)
            .eq('status', 'ACCEPTED')
            .then(({ data }) => {
              if (data) {
                const friendIds = data.map(f => 
                  f.user_id_1 === session.user.id ? f.user_id_2 : f.user_id_1
                );
                socket.emit('join_network', friendIds);
              }
            });
        }
      });
    });

    // Connection lost
    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    // Friend started/stopped a timer
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
    
    // Received message from friend
    socket.on('receive_ephemeral_message', ({ sender_id, message }) => {
      const msg: EphemeralMessage = {
        id: Math.random().toString(36),
        sender_id,
        text: message,
        timestamp: Date.now()
      };
      set((state) => ({ messages: [...state.messages, msg] }));
      
      // Auto-expire after 5 minutes
      const timeoutSec = 5 * 60;
      setTimeout(() => {
        set((state) => ({
          messages: state.messages.filter(m => m.id !== msg.id)
        }));
      }, timeoutSec * 1000);
    });

    // Received nudge
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
```

**State Management Strategy**:
- `activeTimers`: Real-time presence of friends
- `messages`: Ephemeral messages (app-destructible)
- `socket`: WebSocket connection instance
- `isConnected`: Boolean flag for UI (show/hide offline warning)

**Lazy Initialization**: Socket only connects when `initializeSocket()` is called (triggered on app launch after auth check).

#### 4.2.4 Root Navigation (App.tsx)

```typescript
import React, { useEffect, useState } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from './src/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginScreen from './src/screens/LoginScreen';
import HubScreen from './src/screens/HubScreen';
import ActiveSessionScreen from './src/screens/ActiveSessionScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) return null; // Show splash screen

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={DarkTheme}>
        <StatusBar barStyle="light-content" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {session ? (
            <>
              <Stack.Screen name="Hub" component={HubScreen} />
              <Stack.Screen name="ActiveSession" component={ActiveSessionScreen} />
            </>
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
```

**Navigation Flow**:
- No session → Login screen
- Session exists → Hub (main dashboard)
- From Hub: tap "Start Timer" → ActiveSession screen

#### 4.2.5 Core Screens

**LoginScreen**: Email/password auth, sign up, onboarding trigger

**HubScreen**: 
- Live friend roster with avatars
- Active sessions feed
- Current week leaderboard
- Messages display

**ActiveSessionScreen**:
- Pomodoro: Circular countdown ring, time remaining
- Stopwatch: Expanding wave animation, elapsed time
- Stop button
- Topic display

#### 4.2.6 UI Design System

**Theme**: Minimalist Dark Mode

**Colors**:
- Background: `#000000`, `#121212` (true black, reduces OLED burn-in)
- Text: `#FFFFFF` (primary), `#A0A0A0` (secondary)
- Accents: Neon Yellow `#FFFF00`, Electric Blue `#00D9FF`
- Danger: Red `#FF4444`

**Typography**:
- Body: Inter or Roboto (14px-16px)
- Headings: Inter Bold (20px-24px)
- **Timers: JetBrains Mono or Fira Code** (tabular-nums for consistent width)
  - Critical: Set `fontVariant: ['tabular-nums']` to prevent horizontal jitter as numbers change

**Animations**:
- `react-native-reanimated`: 60fps GPU-accelerated animations
- Lottie: Expanding wave loop for Stopwatch, pulsing ring for presence
- Haptics: `Heavy` impact on nudge, `Light` on message received

---

### 4.3 React Web Frontend (Desktop/Tablet)

#### 4.3.1 Project Structure

```
frontend-web/
├── src/
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── socket.ts            # Socket.IO client
│   ├── store/
│   │   ├── useStore.ts          # Main Zustand store
│   │   └── useNetworkStore.ts   # Friend presence + messages
│   ├── hooks/
│   │   └── useSocket.ts         # Socket initialization
│   ├── components/
│   │   ├── Layout.tsx           # Main layout wrapper
│   │   └── ...                  # UI components
│   ├── pages/
│   │   ├── Auth.tsx             # Login/Sign up
│   │   ├── Onboarding.tsx       # Username claim
│   │   ├── Hub.tsx              # Main dashboard
│   │   ├── Timer.tsx            # Pomodoro/Stopwatch UI
│   │   ├── Leaderboard.tsx      # Weekly rankings
│   │   └── Profile.tsx          # User profile + history
│   ├── App.tsx                  # Route setup
│   ├── main.tsx
│   └── index.css                # Global styles
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

#### 4.3.2 Main Store (Web)

**File**: `src/store/useStore.ts`

```typescript
import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';

export type TimerType = 'POMODORO' | 'STOPWATCH';

export interface LocalSession {
  topic: string;
  type: TimerType;
  startTime: number;
  targetDuration?: number;
  isActive: boolean;
}

interface AuthState {
  user: User | null;
  profile: { username: string; has_onboarded: boolean } | null;
  isLoading: boolean;
  localSession: LocalSession | null;
  
  setUser: (user: User | null) => void;
  setProfile: (profile: { username: string; has_onboarded: boolean } | null) => void;
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
```

**Network Store**: `src/store/useNetworkStore.ts`
- Manages friend list + presence
- Manages ephemeral messages
- Separate from auth store for cleaner separation

#### 4.3.3 Socket Hook (Web)

**File**: `src/hooks/useSocket.ts`

```typescript
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
        fetchFriendsAndJoin();
      });

      socket.on('friend_presence_update', (data: { userId: string, activeSession: any }) => {
        updateFriendPresence(data.userId, true, data.activeSession);
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

      socket.on('nudge_received', () => {
        // Trigger screen shake animation
        document.body.classList.add('animate-shake');
        setTimeout(() => {
          document.body.classList.remove('animate-shake');
        }, 500);
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
    };
  }, [user]);
};
```

#### 4.3.4 App Routing (Web)

**File**: `src/App.tsx`

```typescript
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Auth } from './pages/Auth';
import { Onboarding } from './pages/Onboarding';
import { Hub } from './pages/Hub';
import { useStore } from './store/useStore';
import { supabase } from './lib/supabase';
import { Timer } from './pages/Timer';
import { Leaderboard } from './pages/Leaderboard';
import { Profile } from './pages/Profile';
import { useSocket } from './hooks/useSocket';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, isLoading } = useStore();

  if (isLoading) {
    return <div className="flex-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!profile?.has_onboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

function App() {
  const { setUser, setProfile, setIsLoading } = useStore();
  useSocket(); // Initialize socket connection

  useEffect(() => {
    // Initial fetch
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('Profiles')
        .select('username, has_onboarded')
        .eq('id', userId)
        .single();
      
      if (!error && data) {
        setProfile(data);
      } else {
        setProfile(null);
      }
    } catch (e) {
      console.error('Error fetching profile:', e);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/onboarding" element={<Onboarding />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Hub />} />
          <Route path="timer" element={<Timer />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

**Route Structure**:
- `/auth`: Login/Sign up (public)
- `/onboarding`: Username claim (protected, post-login)
- `/`: Hub (protected, post-onboarding)
  - `/timer`: Active timer session
  - `/leaderboard`: Weekly rankings
  - `/profile`: User profile + history

---

## 5. Database Schema

### 5.1 Complete SQL Schema

See `supabase_schema.sql` for the authoritative schema. Key tables:

1. **Profiles**: User metadata
2. **Friendships**: Social graph with ACCEPTED/PENDING status
3. **Sessions**: Immutable study session ledger

### 5.2 Indexing Strategy

| Table | Index | Reason |
|-------|-------|--------|
| Profiles | `idx_profiles_username` | Debounced username availability checks |
| Friendships | `idx_friendships_users` | Friend lookups for RLS |
| Sessions | `idx_sessions_user_time` | Weekly leaderboard queries, history fetches |

### 5.3 Query Patterns

**Weekly Leaderboard** (current week only):
```sql
SELECT user_id, SUM(duration_seconds) / 60 as total_minutes
FROM Sessions
WHERE timestamp > DATE_TRUNC('week', now())
GROUP BY user_id
ORDER BY total_minutes DESC;
```

**User History** (heatmap data):
```sql
SELECT DATE(timestamp) as day, SUM(duration_seconds) as total
FROM Sessions
WHERE user_id = $1
GROUP BY day
ORDER BY day DESC;
```

**Friend's Sessions** (for detailed view):
```sql
SELECT *
FROM Sessions
WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
ORDER BY timestamp DESC;
```

---

## 6. API & WebSocket Specification

### 6.1 REST API (Supabase-Generated)

Supabase automatically generates REST endpoints. Clients use the `@supabase/supabase-js` library.

**Example Queries** (frontend usage):

```typescript
// Fetch all accepted friendships
const { data } = await supabase
  .from('Friendships')
  .select('user_id_1, user_id_2')
  .eq('status', 'ACCEPTED')
  .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);

// Insert a new session
const { error } = await supabase
  .from('Sessions')
  .insert({
    user_id: userId,
    topic: 'React',
    timer_type: 'POMODORO',
    duration_seconds: 1234
  });

// Weekly leaderboard
const { data } = await supabase
  .from('Sessions')
  .select('user_id, SUM(duration_seconds)')
  .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  .group_by('user_id');
```

### 6.2 WebSocket Events (Socket.IO)

#### Client → Server

| Event | Payload | Purpose |
|-------|---------|---------|
| `authenticate` | `jwt: string` | Verify JWT and set user context |
| `join_network` | `friendIds: string[]` | Subscribe to friends' presence |
| `request_presence_sync` | (none) | Fetch current active timers (optional) |
| `start_timer` | `{ topic, timer_type, start_time_iso, duration_target }` | Broadcast start |
| `stop_timer` | (empty object) | Stop timer and save session |
| `send_ephemeral_message` | `{ target_user_id, message }` | Send temporary message |
| `send_nudge` | `{ target_user_id }` | Send nudge |

#### Server → Client

| Event | Payload | Purpose |
|-------|---------|---------|
| `friend_presence_update` | `{ userId, topic, timer_type, start_time_iso, duration_target }` OR `{ userId, stopped: true }` | Friend started/stopped timer |
| `receive_ephemeral_message` | `{ sender_id, message }` | Received message |
| `nudge_received` | `{ sender_id }` | Received nudge |

### 6.3 Authentication Flow Diagram

```
User → Frontend: Enter email/password
Frontend → Supabase Auth: signUp(email, password)
Supabase → Frontend: JWT + Refresh Token
Frontend → SecureStore: Store JWT securely
Frontend → Socket.IO: emit('authenticate', jwt)
Socket.IO → Supabase Auth: auth.getUser(jwt)
Supabase → Socket.IO: User object
Socket.IO → Frontend: { success: true, userId }
Frontend: Initialize Zustand store + socket events
```

---

## 7. Deployment & DevOps

### 7.1 Local Development

#### Setup Backend
```bash
cd backend
npm install
cp .env.example .env  # Add SUPABASE_URL, SUPABASE_ANON_KEY
npm run dev  # Start on localhost:3000
```

#### Setup Frontend (Mobile)
```bash
cd frontend
npm install
# Set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY in .env
npx expo start
# Open Expo Go on Android emulator/device
```

#### Setup Frontend (Web)
```bash
cd frontend-web
npm install
# Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY in .env
npm run dev  # Start on localhost:5173
```

### 7.2 Production Deployment

#### Backend (Node.js + Socket.IO)
- **Host**: Render Free Tier or Railway Free Tier
- **CI/CD**: GitHub Actions (auto-deploy on main branch push)
- **Environment Variables**: Set in Render/Railway dashboard
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `PORT` (auto-set by platform)
- **Monitoring**: Render/Railway built-in logs
- **Cold Starts**: Expected; app wakes up on first request (5-10s delay)

**Render Deployment** (`render.yaml`):
```yaml
services:
  - type: web
    name: multiplayer-timer-backend
    runtime: node
    buildCommand: npm install
    startCommand: npm start
    env:
      - key: SUPABASE_URL
        value: $SUPABASE_URL
      - key: SUPABASE_ANON_KEY
        value: $SUPABASE_ANON_KEY
```

#### Frontend (Mobile - APK)
- **Build Tool**: Expo Application Services (EAS)
- **Command**: `eas build -p android --profile preview`
- **Distribution**: Direct APK download, share via Discord/WhatsApp
- **Future**: Google Play Store (Phase 2)

#### Frontend (Web)
- **Host**: Vercel
- **CI/CD**: Automatic deploys on GitHub push
- **Build**: `npm run build` → `dist/`
- **Environment Variables**: Set in Vercel dashboard
- **Domain**: Custom domain or `*.vercel.app`

### 7.3 Database Backups (Supabase)

- **Automatic Backups**: Daily snapshots included in free tier
- **Retention**: 7 days
- **Manual Backups**: Export SQL via Supabase dashboard
- **RLS State**: Backed up with schema

---

## 8. Security & Privacy

### 8.1 Authentication & Authorization

**JWT Security**:
- Stored in OS-level secure storage (Expo Secure Store on mobile, localStorage for web)
- Included in all API requests via `Authorization: Bearer <jwt>` header
- Auto-refreshed before expiry via refresh token

**RLS Policies**:
- All tables have Row-Level Security enabled
- Profiles: Public read, self-edit only
- Friendships: Only modify your own relationships
- Sessions: View own + accepted friends' sessions

**Server-Side Validation**:
- Socket.IO authenticates JWT on every connection
- Backend verifies user_id on session insert (no trusting client)

### 8.2 Data Privacy

**What We Collect**:
- Email address (auth only)
- Username (public, searchable)
- Study sessions (topic, duration, timer type)
- Friendships (bidirectional, private)

**What We DON'T Collect**:
- Location data
- Device identifiers (except for local push notifications)
- Analytics or telemetry
- IP addresses (beyond server logs)

**Data Retention**:
- Sessions: Indefinite (historical vault)
- Messages: Ephemeral (5 minutes max)
- Auth tokens: Until logout or expiry

### 8.3 Network Security

**HTTPS/WSS**: All connections encrypted in transit
- Supabase: Auto-HTTPS
- Socket.IO: WSS (WebSocket Secure)
- Mobile: Uses system cert validation

**CORS**: Socket.IO allows `origin: '*'` for flexibility
- Client validates via JWT (not origin)
- Safe because all actions require authentication

**Rate Limiting**:
- Implement per endpoint (future enhancement)
- Supabase free tier has built-in rate limits

---

## 9. Performance & Scalability

### 9.1 Real-Time Scalability

**Socket.IO Architecture**:
- Single-instance acceptable up to ~100 concurrent connections
- Horizontal scaling: Multiple instances + sticky sessions
- Redis adapter (future): For multi-instance message broadcasting

**In-Memory State**:
- `activeTimers` map: O(1) lookup
- Room subscriptions: O(1) broadcast (Socket.IO optimized)
- No database queries from real-time layer

### 9.2 Database Scalability

**Supabase Free Tier Limits**:
- 50GB storage (sessions table well under)
- 2 concurrent connections (sufficient for modest user base)
- Unlimited API requests (but rate-limited)

**Optimization Strategies**:
- Index on `(user_id, timestamp)` for fast leaderboard queries
- Batch inserts on session completion
- Archive old sessions (future): Move to cold storage after 1 year

### 9.3 Frontend Performance

**Bundle Size**:
- React Native: ~2MB (EAS optimized build)
- React Web: ~150KB (Vite optimized, gzip)

**Runtime Performance**:
- Zustand: Minimal re-renders (selector optimization)
- React Query (future): Cache API responses, stale-while-revalidate
- Animations: GPU-accelerated (Reanimated, CSS transforms)

**Network Performance**:
- WebSocket: Lower latency than HTTP polling
- Fallback: HTTP long-polling on restricted networks
- Auto-reconnect: Exponential backoff

---

## 10. Development Workflow

### 10.1 Git Workflow

```bash
# Clone
git clone https://github.com/Bhuwan-Rajaa/Online-Timer-app.git
cd "timer app2"

# Create feature branch
git checkout -b feature/cool-feature

# Make changes, commit
git add .
git commit -m "feat: add cool feature"

# Push and create PR
git push origin feature/cool-feature
# Create PR on GitHub, wait for review

# Merge to main
# CI/CD auto-deploys to staging/production
```

### 10.2 Environment Configuration

**Mobile** (`.env` in `frontend/`):
```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**Web** (`.env` in `frontend-web/`):
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

**Backend** (`.env` in `backend/`):
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
PORT=3000
```

### 10.3 Testing Strategy

**Unit Tests** (future):
- Jest for backend
- Vitest for web frontend

**Integration Tests** (future):
- Supabase RLS tests
- Socket.IO event flow tests

**E2E Tests** (future):
- Cypress/Playwright for web
- Detox for React Native

### 10.4 Monitoring & Logging

**Backend Logs**:
- Render/Railway dashboard
- Console.log on connection, auth, session save

**Frontend Errors**:
- Browser console (web)
- Expo debug console (mobile)
- Future: Sentry integration

**Database Monitoring**:
- Supabase dashboard: Query performance, storage usage
- Real-time logs: RLS policy execution

---

## 11. Future Enhancements

### Phase 2 (Q3 2024)
- [ ] Web frontend feature parity
- [ ] Social features: Friend requests, friend groups
- [ ] Detailed session notes (add context to study sessions)
- [ ] Voice chat integration (for study groups)

### Phase 3 (Q4 2024+)
- [ ] iOS release via App Store
- [ ] HealthKit integration (Apple Health)
- [ ] Export study data (CSV, PDF reports)
- [ ] Achievements & badges system
- [ ] Custom timer presets
- [ ] Study streak tracking

### Scalability Improvements (Future)
- [ ] Redis caching layer for frequent queries
- [ ] Session archival (cold storage for old data)
- [ ] Multi-instance Socket.IO with Redis adapter
- [ ] CDN for static assets
- [ ] GraphQL API (alternative to REST)

---

## 12. Troubleshooting & Common Issues

### Socket.IO Connection Fails

**Symptoms**: "Socket failed to connect" error on startup

**Causes & Fixes**:
1. Backend not running: `npm run dev` in `backend/`
2. Wrong backend URL: Check `Constants.expoConfig?.hostUri` on mobile, or hardcode IP
3. Firewall blocking port 3000: Allow in Windows Defender/router settings
4. CORS issue: Verify `cors: { origin: '*' }` in server.ts

### Session Not Saving

**Symptoms**: Timer stops but doesn't appear in Sessions table

**Causes & Fixes**:
1. Supabase credentials invalid: Check `.env` files
2. RLS policy blocking: Verify `user_id = auth.uid()` policy exists
3. Network error on `supabase.from('Sessions').insert()`: Add retry logic

### Friends Not Appearing

**Symptoms**: Friend roster empty despite having friends in database

**Causes & Fixes**:
1. Friendships not accepted: Check Friendships table status = 'ACCEPTED'
2. `join_network` not emitted: Verify socket authenticated first
3. Friend room not joined: Socket must call `socket.join('friend_network_${id}')`

### Ephemeral Messages Not Received

**Symptoms**: Message sent but not shown on recipient

**Causes & Fixes**:
1. Recipient not connected: Verify Socket.IO connection active
2. Wrong target_user_id: Check UUID format matches auth.users
3. Message timeout: Messages expire after 5 minutes automatically

---

**End of Documentation**

For questions or contributions, see: https://github.com/Bhuwan-Rajaa/Online-Timer-app
