# Comprehensive Technical Documentation: Multiplayer Study Timer App (v2.0)

## 1. Project Overview
This document outlines the complete architectural, backend, and frontend specifications for a highly scalable, subscription-free multiplayer study timer app. The platform provides real-time passive presence, dual-mode study timers (Pomodoro/Stopwatch), strictly weekly friend-group leaderboards with historical data retention, and ephemeral messaging. It is wrapped in a sleek, minimalist dark-mode interface designed for developers and deep-work enthusiasts.

**Target Platform (v1.0):** Android via Expo Go & Standalone APK (Cross-platform ready for future iOS release).

---

## 2. System Architecture
The application relies on a strictly decoupled architecture, separating the persistent database/auth layer from the real-time presence layer to maximize free-tier scalability and guarantee zero-cost operations.

* **Frontend:** React Native (Expo) + TypeScript
* **Persistent Backend:** Supabase (PostgreSQL + GoTrue Auth)
* **Real-time Backend:** Node.js + Express + Socket.io (Hosted on Render/Railway)
* **State Management:** Zustand (for lightweight, fast WebSocket state)

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
* **Graceful Cleanup:** Implement a `disconnect` listener. If a socket drops while a user's timer state is active, the server immediately broadcasts a `stop_timer` event to their friend room to prevent ghosting on the UI.

#### 3.2.2. WebSocket Event Dictionary

**Client-to-Server Events:**
* `authenticate`: Client sends Supabase JWT for verification.
* `join_network`: Client passes an array of accepted friend IDs to join specific broadcast rooms.
* `start_timer`: Payload: `{ topic, timer_type, start_time_iso, duration_target }`. Broadcast to friend rooms.
* `stop_timer`: Emits a signal that the user has stopped studying.
* `send_ephemeral_message`: Payload: `{ target_user_id, message }`. Passed straight through RAM, zero persistence.

**Server-to-Client Events:**
* `friend_presence_update`: Receives the timer payload from a friend.
* `receive_ephemeral_message`: Receives a text payload.
* `nudge_received`: Receives a "boost" notification.

---

## 4. Frontend Documentation

### 4.1. Core Tech Stack
* **Framework:** React Native + Expo (Managed Workflow)
* **Language:** TypeScript
* **Routing:** Expo Router
* **State Management:** Zustand (Volatile/Real-time) + React Query (Supabase Data Fetching)
* **Animations:** `react-native-reanimated`, `lottie-react-native`
* **Haptics:** `expo-haptics`

### 4.2. UI/UX Design System
* **Theme:** Minimalist Developer / Dark Mode.
* **Colors:** Backgrounds (`#000000`, `#121212`), Text (`#FFFFFF`, `#A0A0A0`), Active Accents (Neon Yellow/Electric Blue).
* **Typography:**
    * Body/Headings: Inter or Roboto.
    * **CRITICAL - Timers:** JetBrains Mono or Fira Code, with `fontVariant: ['tabular-nums']` explicitly declared in the StyleSheet to guarantee identical character widths and eliminate horizontal jitter.

### 4.3. App Architecture & Background State Management
React Native suspends JavaScript when the app is minimized. The architecture must compensate for OS-level backgrounding.

* **Background Alarms (`expo-notifications`):** When a Pomodoro is started, the app schedules a local push notification for the exact end time. If the app is backgrounded, the OS will reliably fire the alarm. If the timer is cancelled or finished early, the scheduled notification is cleared.
* **Presence Resync (`AppState` API):** When the app transitions from `background` to `active`, the client assumes its Zustand socket state is stale. It immediately emits a `request_presence_sync` to the Socket server to fetch the true active roster.

### 4.4. Core Screens & Logic

#### 4.4.1. Authentication & Onboarding
* **Login:** Terminal-style input.
* **Alias Claim:** Debounced Supabase query to ensure unique usernames.
* **Network Init:** Generates an Expo deep-link to invite friends.

#### 4.4.2. The Hub (Main Dashboard)
* **Live Roster:** Displays avatars of friends. Active studiers have a `reanimated` pulsing ring.
* **Active Sessions Feed:** Calculates the delta between `start_time_iso` and the local device clock for UI display, requiring zero polling.
* **The "Nudge" Mechanic:** Swiping a friend's card triggers a WebSocket event. The receiving device triggers `expo-haptics` (`ImpactFeedbackStyle.Heavy`) and briefly flashes the screen borders in the accent color, grabbing attention without intrusive OS banners.

#### 4.4.3. The Active Study Session
* **Stopwatch:** Counts up. Renders soft expanding wave animations (Lottie).
* **Pomodoro:** Calculates future end time. Renders depleting circular ring.
* **Completion & Optimistic UI:** Upon finishing, immediately update the local Zustand leaderboard/history state, then process the Supabase `INSERT` in the background.

#### 4.4.4. Leaderboard & Profile
* **Weekly Sprint:** A strict weekly reset query fetching `Sessions` where `timestamp > last Monday`. Groups by `user_id` and sums duration.
* **Historical Vault:** While the leaderboard resets, the past data is retained. Profile renders a GitHub-style heatmap showing all-time `Sessions` grouped by day.

### 4.5. Ephemeral Messaging Implementation
1. User types message in Terminal input.
2. `socket.emit('send_ephemeral_message', { target, text })`.
3. Target receives `receive_ephemeral_message`.
4. Message is appended to Zustand volatile store.
5. Component sets a 5-minute timeout to fade opacity.
6. When the app is closed, the Zustand store is destroyed by the OS. Zero database writes occur.

---

## 5. Deployment & Build Strategy

### 5.1. Phase 1: Local & Friend Group Testing
* **Environment:** Expo Go via `npx expo start`.

### 5.2. Phase 2: Android APK Distribution
* **Build Tool:** Expo Application Services (EAS).
* **Command:** `eas build -p android --profile preview`
* **Distribution:** Direct .apk sharing via Discord/WhatsApp. No Google Play account required.

### 5.3. Backend Deployment
* **Database:** Supabase Free Tier.
* **Real-time Server:** Render/Railway Free Tier. Connect to GitHub for automatic CI/CD.