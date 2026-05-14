# Comprehensive Technical Documentation: Multiplayer Study Timer App (v2.0)

## Executive Summary

The **Multiplayer Study Timer App** is a subscription-free, real-time collaborative study platform designed for developers, students, and knowledge workers. It combines motivational co-presence with flexible time-tracking, enabling users to study together asynchronously without intrusive notifications, within a minimalist, developer-friendly dark-mode interface.

### Key Highlights
- **Real-Time Presence**: WebSocket-based friend activity visibility with zero database polling
- **Dual-Mode Timers**: Flexible Pomodoro (timed) and Stopwatch (unlimited) modes
- **Weekly Leaderboards**: Gamified competition with automatic weekly reset + historical data retention
- **Ephemeral Messaging**: Temporary in-memory messages (5-min auto-expiry, zero persistence)
- **Cross-Platform**: React Native (Android/iOS) + React Web (Desktop/Tablet)
- **Free-Tier Optimized**: Runs on Supabase + Render free tiers without rate limit violations

---

## 1. Project Overview

### 1.1 Mission
Provide a subscription-free, distraction-free study companion that leverages social motivation through presence awareness, without the toxicity of intrusive notifications or analytics tracking.

### 1.2 Target Platforms & Release Timeline

| Phase | Platform | Status | Timeline |
|-------|----------|--------|----------|
| **Phase 1** | Android APK (Expo) | 🔄 In Development | Q2 2024 |
| **Phase 2** | Web (React) | 🔄 In Development | Q3 2024 |
| **Phase 3** | iOS App Store | 📋 Planned | Q4 2024 |

### 1.3 Core Principles
- **Zero Persistence for Real-Time**: All presence and ephemeral messages live in-memory only
- **Client-Side Orchestration**: Frontend coordinates between Supabase (persistent) and Socket.IO (real-time)
- **Free-Tier Friendly**: Designed to never exceed free tier quotas on Supabase or Render
- **Graceful Degradation**: App remains functional if Socket.IO server is unavailable; timers sync on reconnect
- **Privacy First**: No analytics, ads, telemetry, or location tracking

---

## 2. System Architecture Overview

### 2.1 Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   FRONTEND CLIENTS                       │
│  ┌──────────────────┐        ┌────────────────────┐      │
│  │  React Native    │        │   React Web App    │      │
│  │  (Mobile)        │        │  (Desktop/Tablet)  │      │
│  │  + Zustand Store │        │  + Zustand Store   │      │
│  └────────┬─────────┘        └─────────┬──────────┘      │
└───────────┼──────────────────────────────┼────────────────┘
            │ JWT + WebSocket              │ JWT + WebSocket
            │                              │
    ┌───────┴───────────────────────────────┴──────┐
    │                                               │
┌───▼────────────────────────┐  ┌─────────────────▼─────────┐
│ SOCKET.IO SERVER           │  │ SUPABASE BACKEND          │
│ (Real-Time Layer)          │  │ (Persistent Layer)        │
│                            │  │                           │
│ • In-Memory Active Timers  │  │ • PostgreSQL Database     │
│ • Ephemeral Messages       │  │ • JWT Authentication      │
│ • Friend Presence Rooms    │  │ • Row-Level Security      │
│ • Live Broadcasting        │  │ • Data Durability         │
│                            │  │                           │
│ Runs on: Render/Railway    │  │ Runs on: Supabase Free    │
└────────────────────────────┘  └───────────────────────────┘
```

### 2.2 Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Mobile Frontend** | React Native + Expo + TypeScript | Cross-platform native app with live reload |
| **Web Frontend** | React + Vite + React Router | Responsive SPA for desktop/tablet |
| **State Management** | Zustand | Lightweight store for socket events + local state |
| **Real-Time Backend** | Node.js + Express + Socket.IO | WebSocket server for presence + messaging |
| **Persistent Backend** | Supabase (PostgreSQL + GoTrue) | User auth, database, RLS policies |
| **Animations** | Reanimated + Lottie (mobile), CSS (web) | Smooth 60fps animations |
| **Haptics** | Expo Haptics | Device vibration feedback on nudges |
| **Secure Storage** | Expo Secure Store | OS-level encrypted JWT storage (mobile) |
| **Deployment** | Render, Vercel | Free hosting with auto CI/CD |

### 2.3 Key Design Principles

**Separation of Concerns**:
- **Persistent Layer** (Supabase): Handles auth, user profiles, friendships, completed sessions
- **Real-Time Layer** (Socket.IO): Handles live presence, ephemeral messages (no persistence)
- **Client Orchestration**: Frontend manages local state, coordinates between both backends

**Zero Database Queries for Real-Time Data**:
- Active timers stored in Socket.IO server memory only
- Presence updates broadcast via WebSocket (no Supabase queries)
- Session data inserted to Supabase only on completion
- Scales to thousands of users without hitting free-tier database limits

**Graceful Degradation**:
- If Socket.IO unavailable: Timers still run locally; session saves to Supabase directly
- If Supabase unavailable: Cached data persists; real-time layer independent
- Automatic reconnection with exponential backoff

---

## 3. Backend Documentation
The backend is split into two distinct services: the Persistent Data Layer (Supabase) and the Real-Time Layer (Node.js/Socket.io). These services do not communicate with each other directly; the client acts as the orchestrator.

### 3.1. Persistent Data Layer (Supabase)
Supabase handles all Authentication and Database persistence.

#### 3.1.1. Authentication
* **Provider:** Supabase Auth (Email/Password).
* **Flow:** 1. User registers via React Native frontend.
    2. Supabase handles bcrypt hashing and salt generation.
    3. JWT is returned to the client and securely stored using `expo-secure-store`.
    4. Upon first login, the user completes the Onboarding flow, triggering a profile creation.

#### 3.1.2. Database Schema & Indexing (PostgreSQL)

**Table: `Profiles`**
Stores public user data and onboarding status.
* `id` (uuid, Primary Key, references `auth.users`)
* `username` (text, UNIQUE, indexed for debounced search)
* `has_onboarded` (boolean, default: false)
* `created_at` (timestamp, default: now())

**Table: `Friendships`**
Manages the social graph.
* `user_id_1` (uuid, references `Profiles.id`)
* `user_id_2` (uuid, references `Profiles.id`)
* `status` (enum: 'PENDING', 'ACCEPTED')
* `created_at` (timestamp, default: now())
* *Constraint:* Ensure unique pairs regardless of order.
* **Optimization:** `CREATE INDEX idx_friendships_users ON Friendships (user_id_1, user_id_2);` (Crucial for instant RLS checks).

**Table: `Sessions`**
The immutable ledger of all completed study sessions, serving as the basis for both the weekly reset leaderboard and all-time data retention.
* `id` (uuid, Primary Key)
* `user_id` (uuid, references `Profiles.id`)
* `topic` (text)
* `timer_type` (enum: 'POMODORO', 'STOPWATCH')
* `duration_seconds` (integer)
* `timestamp` (timestamp, default: now())
* **Optimization:** `CREATE INDEX idx_sessions_user_time ON Sessions (user_id, timestamp);` (Prevents full table scans on weekly leaderboard queries).

#### 3.1.3. Advanced Row Level Security (RLS)
To maintain instantaneous read times and prevent recursive loops on the free tier, RLS must be optimized.

1.  **Security Definer Function:** Create a PostgreSQL function `is_friend(target_user_id)` that runs with elevated privileges. It checks the `Friendships` table to verify if `auth.uid()` has an 'ACCEPTED' relationship with the target.
2.  **Policies:**
    * `Profiles`: `SELECT` is public. `UPDATE` restricted to `id = auth.uid()`.
    * `Friendships`: `SELECT/INSERT/UPDATE` restricted to rows where `user_id_1 = auth.uid()` OR `user_id_2 = auth.uid()`.
    * `Sessions`: `INSERT` restricted to `user_id = auth.uid()`. `SELECT` policy simplified to: `(user_id = auth.uid()) OR is_friend(user_id)`.

### 3.2. Real-Time Layer (Node.js & Socket.io)
This server strictly handles live presence and ephemeral messaging. It operates entirely in memory.

#### 3.2.1. Server Setup & Resilience
* **Framework:** Express.js + Socket.io.
* **Network Resilience:** Configure Socket.io with strict heartbeats (`pingInterval: 10000`, `pingTimeout: 5000`).
* **Fast Authentication:** Uses `jsonwebtoken` to locally verify the Supabase JWT using `SUPABASE_JWT_SECRET`. This provides zero-latency authentication and prevents Supabase rate-limiting when many users connect simultaneously.
* **Graceful Cleanup:** Implement a `disconnect` listener. If a socket drops while a user's timer state is active, the server automatically saves the session to Supabase and immediately broadcasts a `stop_timer` event to their friend room to prevent ghosting on the UI.

#### 3.2.2. WebSocket Event Dictionary

**Client-to-Server Events:**
* `authenticate`: Client sends Supabase JWT for verification.
* `join_network`: Client passes an array of accepted friend IDs to join specific broadcast rooms.
* `start_timer`: Payload: `{ topic, timer_type, start_time_iso, duration_target }`. Broadcast to friend rooms.
* `stop_timer`: Emits a signal that the user has stopped studying. Server handles duration calculation and Supabase insert.
* `send_ephemeral_message`: Payload: `{ target_user_id, message }`. Passed straight through RAM, zero persistence.
* `notify_friend_request`: Payload `{ target_user_id }`. Signals the backend to notify the target user of a new friend request.

**Server-to-Client Events:**
* `friend_presence_update`: Receives the timer payload from a friend.
* `receive_ephemeral_message`: Receives a text payload.
* `nudge_received`: Receives a "boost" notification.
* `friend_request_received`: Notifies the client to refresh their pending requests list.

---

## 4. Frontend Documentation

### 4.1 Frontend Overview: Two Implementations

The app has **two independent frontend codebases**:

| Platform | Framework | Location | Status | Deployment |
|----------|-----------|----------|--------|------------|
| **Mobile (Android/iOS)** | React Native + Expo + TypeScript | `frontend/` | 🔄 Phase 1 | EAS Build → APK |
| **Web (Desktop/Tablet)** | React + Vite + React Router | `frontend-web/` | 🔄 Phase 2 | Vercel |

Both share similar architecture (Zustand stores, Socket.IO client) but differ in UI components and platform-specific features.

### 4.2 React Native Frontend (Mobile)

#### 4.2.1 Project Structure

```
frontend/
├── src/
│   ├── lib/
│   │   └── supabase.ts          # Supabase client with Secure Store adapter
│   ├── store/
│   │   └── useStore.ts          # Zustand store (socket events + real-time state)
│   ├── screens/
│   │   ├── LoginScreen.tsx      # Email/password auth + onboarding
│   │   ├── HubScreen.tsx        # Main dashboard (roster + leaderboard + messages)
│   │   └── ActiveSessionScreen.tsx  # Timer UI (Pomodoro/Stopwatch)
│   └── assets/                  # Icons, animations, splash
├── App.tsx                       # Root navigation (React Navigation)
├── app.json                      # Expo config
├── package.json
├── tsconfig.json
└── index.ts                      # Entry point
```

#### 4.2.2 Supabase Client (`src/lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  {
    auth: {
      storage: ExpoSecureStoreAdapter,  // OS-level encrypted storage
      autoRefreshToken: true,            // Auto-refresh JWT before expiry
      persistSession: true,              // Persist JWT across app restarts
      detectSessionInUrl: false,         // Disable URL-based auth
    },
  }
);
```

**Key Features**:
- **Secure Storage**: JWTs stored in OS Keychain (iOS) / KeyStore (Android), not plain AsyncStorage
- **Auto-Refresh**: Supabase client automatically refreshes access token before expiry
- **Session Persistence**: User remains logged in after app restart
- **Platform Safety**: No sensitive data in device memory

#### 4.2.3 Zustand Store (`src/store/useStore.ts`)

```typescript
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
  activeTimers: Record<string, ActiveTimer>;      // userId → timer data
  messages: EphemeralMessage[];                    // Ephemeral, auto-expiring
  isConnected: boolean;                            // Socket connection status
  userProfile: any | null;
  
  initializeSocket: () => Promise<void>;
  disconnectSocket: () => void;
  startTimer: (payload: any) => void;
  stopTimer: () => Promise<void>;
  sendNudge: (target_user_id: string) => void;
  sendEphemeralMessage: (target_user_id: string, text: string) => void;
  setUserProfile: (profile: any) => void;
}
```

**Real-Time State Synchronization**:
- `activeTimers`: Friend presence updates via `friend_presence_update` event
- `messages`: Ephemeral messages via `receive_ephemeral_message` event
- `isConnected`: Tracks socket connection status for UI warnings

**Socket Initialization**:
```typescript
initializeSocket: async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const debuggerHost = Constants.expoConfig?.hostUri;
  const backendUrl = debuggerHost 
    ? `http://${debuggerHost.split(':')[0]}:3000` 
    : 'http://localhost:3000';
  
  const socket = io(backendUrl, { transports: ['websocket'] });
  
  socket.on('connect', () => {
    socket.emit('authenticate', session.access_token, (res) => {
      if (res.success) {
        // Fetch accepted friendships and join their presence rooms
        supabase.from('Friendships')
          .select('user_id_1, user_id_2')
          .or(`user_id_1.eq.${session.user.id},user_id_2.eq.${session.user.id}`)
          .eq('status', 'ACCEPTED')
          .then(({ data }) => {
            const friendIds = data.map(f => 
              f.user_id_1 === session.user.id ? f.user_id_2 : f.user_id_1
            );
            socket.emit('join_network', friendIds);
          });
      }
    });
  });
  
  socket.on('friend_presence_update', (payload) => {
    // Update activeTimers when friend starts/stops
  });
  
  socket.on('receive_ephemeral_message', ({ sender_id, message }) => {
    // Add message with 5-min auto-expiry
  });
  
  socket.on('nudge_received', () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  });
  
  set({ socket });
}
```

#### 4.2.4 Root Navigation (`App.tsx`)

```typescript
const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) return null; // Show splash while checking auth

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
- No session → `LoginScreen`
- Session exists → `HubScreen` (main dashboard)
- From Hub: tap "Start Timer" → `ActiveSessionScreen`

#### 4.2.5 Core Screens

**LoginScreen**:
- Email/password input
- Sign up / Sign in toggle
- Validates on Supabase
- Redirects to Onboarding on first signup

**HubScreen** (Main Dashboard):
- Live friend roster with avatars + presence indicators
- Active sessions feed (what friends are studying)
- Current week leaderboard
- Ephemeral messages display
- Message input terminal
- Nudge gesture recognition

**ActiveSessionScreen**:
- **Pomodoro Mode**: Circular countdown ring, time remaining, visual depletion
- **Stopwatch Mode**: Expanding wave animation (Lottie), elapsed time
- Stop button, pause (optional)
- Topic display, timer type indicator
- Sends events to Socket.IO in real-time

#### 4.2.6 UI/UX Design System

**Theme**: Minimalist Dark Mode (Developer-Friendly)

**Colors**:
- **Background**: `#000000` (true black, OLED-friendly), `#121212` (near-black)
- **Text Primary**: `#FFFFFF`, **Text Secondary**: `#A0A0A0` (muted)
- **Accents**: Neon Yellow `#FFFF00`, Electric Blue `#00D9FF`
- **Danger**: Red `#FF4444`

**Typography**:
- **Body**: Inter or Roboto (14px-16px, regular weight)
- **Headings**: Inter Bold (20px-24px)
- **Timers**: JetBrains Mono or Fira Code (CRITICAL: `fontVariant: ['tabular-nums']`)
  - Tabular-nums ensures consistent character widths; prevents horizontal jitter as numbers change

**Animations**:
- **Presence Indicator**: Reanimated pulsing ring (60fps, GPU-accelerated)
- **Stopwatch**: Lottie expanding wave loop (smooth, non-intrusive)
- **Nudge**: Haptics heavy impact + brief screen border flash (accent color)
- **Message Fade**: Opacity transition over 5 minutes before auto-removal

---

### 4.3 React Web Frontend

#### 4.3.1 Project Structure

```
frontend-web/
├── src/
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client
│   │   └── socket.ts            # Socket.IO client instance
│   ├── types/
│   │   └── index.ts             # Centralized shared types (e.g., TimerType, ActiveSession)
│   ├── store/
│   │   ├── useStore.ts          # Auth + local state (Zustand)
│   │   └── useNetworkStore.ts   # Friend presence + messages (Zustand)
│   ├── hooks/
│   │   └── useSocket.ts         # Socket initialization & event listeners
│   ├── components/
│   │   ├── Layout.tsx           # Main layout wrapper + sidebar
│   │   └── ...                  # Reusable UI components
│   ├── pages/
│   │   ├── Auth.tsx             # Login/Sign up
│   │   ├── Onboarding.tsx       # Username claim
│   │   ├── Hub.tsx              # Main dashboard
│   │   ├── Timer.tsx            # Pomodoro/Stopwatch UI
│   │   ├── Leaderboard.tsx      # Weekly rankings
│   │   └── Profile.tsx          # User profile + history heatmap
│   ├── App.tsx                  # React Router setup
│   ├── main.tsx
│   └── index.css                # Global styles
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

#### 4.3.2 Router Setup (`src/App.tsx`)

```typescript
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, isLoading } = useStore();

  if (isLoading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!profile?.has_onboarded) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
};

function App() {
  const { setUser, setProfile, setIsLoading } = useStore();
  useSocket(); // Initialize socket connection

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/onboarding" element={<Onboarding />} />
        
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Hub />} />
          <Route path="timer" element={<Timer />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

**Routes**:
- `/auth`: Login/Sign up (public)
- `/onboarding`: Username claim (protected, post-login)
- `/`: Nested layout with sub-routes:
  - `/timer`: Active timer session
  - `/leaderboard`: Weekly rankings
  - `/profile`: User profile + history

#### 4.3.3 Socket Hook (`src/hooks/useSocket.ts`)

Initializes Socket.IO connection, fetches friends, sets up event listeners:
```typescript
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
      socket.auth = { token: session.access_token };
      socket.connect();

      socket.on('connect', () => fetchFriendsAndJoin());
      socket.on('friend_presence_update', (data) => updateFriendPresence(data));
      socket.on('receive_ephemeral_message', (data) => addMessage(data));
      socket.on('nudge_received', () => triggerScreenShake());
    };

    initSocket();
    return () => socket.off('connect');
  }, [user]);
};
```

#### 4.3.4 Stores (Zustand)

**`useStore`** (Auth + Local State):
```typescript
interface AuthState {
  user: User | null;
  profile: { username: string; has_onboarded: boolean } | null;
  isLoading: boolean;
  localSession: LocalSession | null;
  setUser, setProfile, setIsLoading, setLocalSession;
}
```

**`useNetworkStore`** (Presence + Messages):
```typescript
interface NetworkState {
  friends: Record<string, FriendData>;  // userId → friend info
  messages: EphemeralMessage[];
  updateFriendPresence, addMessage, setFriends;
}
```

---

### 4.4 Shared Design System (Both Frontends)

**Dark Mode + Minimalism**:
- True black backgrounds (`#000000`)
- Monospace fonts for code-like feel
- Neon accents (yellow, blue) for CTAs
- No gradients, shadows, or decorations

**Responsive Design**:
- Mobile: Full-screen vertical layout
- Web: Sidebar navigation + content area
- Tablet: Adaptive layout (sidebar or bottom nav)

**Animations**:
- Subtle, not flashy
- 60fps target (use GPU acceleration)
- Haptics on mobile (heavy impact for nudges)

---

## 5. Database Schema & Queries

### 5.1 Complete Schema (Supabase PostgreSQL)

See `supabase_schema.sql` for SQL. Key tables:

| Table | Purpose | Retention |
|-------|---------|-----------|
| **auth.users** | Supabase auth entries | Indefinite |
| **Profiles** | Public user metadata | Indefinite |
| **Friendships** | Social graph (PENDING/ACCEPTED) | Indefinite |
| **Sessions** | Immutable study session ledger | Indefinite |

### 5.2 Critical Queries

**Weekly Leaderboard** (Current week only, O(n) with index):
```sql
SELECT user_id, SUM(duration_seconds) / 60 as total_minutes
FROM Sessions
WHERE timestamp > DATE_TRUNC('week', now())
GROUP BY user_id
ORDER BY total_minutes DESC;
```

**User History** (Heatmap data, 1-year lookback):
```sql
SELECT DATE(timestamp) as day, SUM(duration_seconds) as total
FROM Sessions
WHERE user_id = $1 AND timestamp > now() - interval '1 year'
GROUP BY day
ORDER BY day DESC;
```

**Accepted Friends**:
```sql
SELECT user_id_1, user_id_2 FROM Friendships
WHERE (user_id_1 = $1 OR user_id_2 = $1) AND status = 'ACCEPTED';
```

---

## 6. WebSocket API

### 6.1 Client-to-Server Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `authenticate` | `jwt: string` | Verify JWT, authenticate socket |
| `join_network` | `friendIds: string[]` | Subscribe to friends' presence rooms |
| `start_timer` | `{ topic, timer_type, start_time_iso, duration_target }` | Broadcast timer start |
| `stop_timer` | `{}` | Stop timer, server saves session to Supabase |
| `send_ephemeral_message` | `{ target_user_id, message }` | Send temporary message |
| `send_nudge` | `{ target_user_id }` | Send nudge (haptic feedback) |
| `notify_friend_request` | `{ target_user_id }` | Notify a user of a new friend request |

### 6.2 Server-to-Client Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `friend_presence_update` | `{ userId, topic, timer_type, start_time_iso, duration_target }` \| `{ userId, stopped: true }` | Friend started/stopped timer |
| `receive_ephemeral_message` | `{ sender_id, message }` | Received temporary message |
| `nudge_received` | `{ sender_id }` | Received nudge |
| `friend_request_received` | `{}` | Tells the client to re-fetch pending requests |

---

## 7. Deployment Strategy

### 7.1 Local Development

**Backend** (`backend/`):
```bash
npm install
cp .env.example .env
# Set SUPABASE_URL, SUPABASE_ANON_KEY
npm run dev  # Starts on port 3000
```

**Mobile Frontend** (`frontend/`):
```bash
npm install
# Set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
# Scan QR code with Expo Go app
```

**Web Frontend** (`frontend-web/`):
```bash
npm install
# Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev  # Starts on port 5173
```

### 7.2 Production Deployment

**Backend**: Render or Railway Free Tier
- Auto-deploy from GitHub main branch
- Environment: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET, PORT
- Cold starts: 5-10s (acceptable for presence server)

**Mobile APK**: EAS Build
- Command: `eas build -p android --profile preview`
- Distribution: Direct APK download, share via Discord

**Web**: Vercel
- Auto-deploy from GitHub main branch
- Environment: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- Domain: Vercel auto-generated or custom domain

---

## 8. Security & Privacy

### 8.1 Authentication & Authorization

- **JWT Storage**: OS-level encryption (Expo Secure Store mobile, localStorage web)
- **RLS Policies**: All tables have row-level security; users can only access own + friends' data
- **Server Validation**: Backend verifies user_id on session insert (no client trust)

### 8.2 Data Privacy

**Collected**:
- Email (auth only, never shared)
- Username (public, searchable)
- Study sessions (topic, duration, timer type)
- Friendships (bidirectional, private)

**NOT Collected**:
- Location, device ID, analytics, IP addresses, biometrics

**Data Retention**: Sessions indefinite; messages ephemeral (5 min max)

---

## 9. Performance & Scalability

### 9.1 Real-Time Scalability

- **Single-Instance**: Handles ~100 concurrent connections comfortably
- **Horizontal Scaling**: Multiple Socket.IO instances + Redis adapter (future)
- **In-Memory State**: O(1) lookup for active timers, no database queries

### 9.2 Database Scalability

- **Supabase Free**: 50GB storage, 2 concurrent connections, unlimited API requests (rate-limited)
- **Indexes**: Composite index on `(user_id, timestamp)` prevents full table scans
- **Archive Strategy** (future): Move sessions >1 year old to cold storage

### 9.3 Frontend Performance

- **Mobile Bundle**: ~2MB (EAS optimized, Expo managed)
- **Web Bundle**: ~150KB gzipped (Vite optimized)
- **Runtime**: Zustand selectors prevent unnecessary re-renders; Reanimated for 60fps animations

---

## 10. Monitoring & Troubleshooting

### Common Issues

**Socket Won't Connect**:
- Verify backend is running on correct port
- Check firewall allows port 3000
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` in backend `.env`

**Sessions Not Saving**:
- Check RLS policy: `user_id = auth.uid()` must exist
- Verify JWT is valid (check Supabase dashboard auth logs)
- Check Supabase credentials in backend `.env`

**Friends Don't Appear**:
- Verify friendships in Supabase with status = 'ACCEPTED'
- Check `join_network` is called after authenticate succeeds
- Inspect Socket.IO room subscriptions in server logs

**Messages Not Received**:
- Verify recipient is connected (check `isConnected` flag)
- Check target UUID format matches database
- Messages auto-expire after 5 minutes

---

## 11. Future Roadmap

- [ ] **Q2 2024**: Phase 1 - Android APK beta
- [ ] **Q3 2024**: Phase 2 - Web frontend + social features
- [ ] **Q4 2024**: Phase 3 - iOS App Store release, HealthKit integration
- [ ] **2025**: Voice chat, study groups, achievements, export data

---

**For questions or contributions**: https://github.com/Bhuwan-Rajaa/Online-Timer-app