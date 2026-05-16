# Project Handoff Document: Multiplayer Study Timer

## 1. Project Overview
This project is a real-time collaborative study timer application. It allows users to track their study sessions (using Pomodoro or Stopwatch methods), connect with friends, see what their friends are studying in real-time, and send ephemeral "nudges" or messages to each other. 

The application is built with a focus on minimalism, a dark-mode UI aesthetic (using a custom CSS variable system), and relies heavily on real-time WebSockets for presence, ensuring it stays well within free-tier limits of cloud providers.

## 2. Tech Stack & Architecture
- **Frontend (Web)**: React, Vite, TypeScript, Zustand (State Management), React Router. Hosted on Vercel.
- **Backend (Real-Time)**: Node.js, Express, Socket.IO, jsonwebtoken. Hosted on Render.
- **Backend (Persistence & Auth)**: Supabase (PostgreSQL, GoTrue).

### Core Architectural Principles
1. **Split Backend Strategy**: Supabase handles all persistent data (user profiles, auth, friend relationships, finished sessions). The custom Node.js Socket.IO server exclusively handles real-time transient data (active timers, live presence, temporary messages).
2. **Zero Database Polling**: Real-time presence updates are broadcast via WebSockets. No database queries are made to check who is online.
3. **Graceful Degradation**: If the WebSocket server disconnects, timers continue locally. If a socket drops while a timer is active, the backend catches the `disconnect` event, calculates the elapsed time, and securely saves the session to Supabase.
4. **Fast Authentication**: The Node server uses `jsonwebtoken` to verify Supabase JWTs locally using `SUPABASE_JWT_SECRET`, avoiding heavy API requests to Supabase for every socket connection.

## 3. Directory Structure
```
timer app2/
├── frontend-web/            # React SPA
│   ├── src/
│   │   ├── components/      # UI components (Layout, etc.)
│   │   ├── hooks/           # Custom hooks (useSocket)
│   │   ├── pages/           # Route views (Hub, Timer, Auth, Profile)
│   │   ├── store/           # Zustand stores (useStore, useNetworkStore)
│   │   ├── types/           # Shared TS interfaces
│   │   └── index.css        # Global styles and theme variables
├── backend/                 # Node.js WebSocket Server
│   ├── server.ts            # Main Socket.IO logic and auth
│   └── types.ts             # Shared TS interfaces (mirrors frontend)
├── Documentation.md         # Full, detailed technical documentation
└── supabase_schema.sql      # Database definitions
```

## 4. Database Schema (Supabase)
- `Profiles`: User metadata (`id`, `username`, `has_onboarded`). `username` is indexed for ILIKE search.
- `Friendships`: Social graph (`user_id_1`, `user_id_2`, `status`, `requested_by`). Note the constraint: `user_id_1 < user_id_2`.
- `Sessions`: Immutable ledger of finished timers (`id`, `user_id`, `topic`, `timer_type`, `duration_seconds`, `timestamp`).

## 5. WebSocket Event Dictionary
### Client -> Server
- `authenticate`: Validates JWT token.
- `join_network`: Subscribes the socket to friends' presence rooms.
- `start_timer`: Broadcasts active timer payload to friends.
- `stop_timer`: Instructs server to stop the timer, calculate duration, and insert into Supabase.
- `send_ephemeral_message`: Forwards a temporary message.
- `send_nudge`: Forwards a haptic nudge.
- `notify_friend_request`: Tells target user to refresh pending requests.

### Server -> Client
- `friend_presence_update`: Informs client a friend started/stopped a timer.
- `receive_ephemeral_message`: Inbound message.
- `nudge_received`: Triggers UI shake effect.
- `friend_request_received`: Triggers UI to re-fetch `Friendships`.

## 6. Recent Major Changes (Context for Next Agent)
- **Double-Save Bug Fixed**: Frontend no longer inserts into `Sessions`. The backend handles it entirely via the `stop_timer` or `disconnect` events.
- **State Recovery**: If the backend server restarts, `useSocket.ts` automatically re-broadcasts any locally active timers upon reconnecting.
- **Real-Time Friends**: `Hub.tsx` uses a debounced search to find users (`Profiles.ilike`). When a request is sent, a socket event notifies the recipient instantly.
- **Centralized Types**: `frontend-web/src/types/index.ts` and `backend/types.ts` contain synced interfaces like `ActiveSession` and `TimerType`.
- **Aesthetics**: Reverted to the original modern dark theme with purple accents (`#9d4edd`). The "Manage Network" and "Friends" sections in the Hub are separated into distinct visual panels.

## 7. Environment Variables Required
### Frontend (`frontend-web/.env`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SOCKET_URL` (URL of the deployed Node server)

### Backend (`backend/.env`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_JWT_SECRET` (Required for zero-latency local auth verification)

## 8. Development Commands
- **Frontend**: `cd frontend-web && npm run dev`
- **Backend**: `cd backend && npm run dev`

*See `Documentation.md` for a deeper dive into architecture, scaling, and the React Native mobile implementation roadmap.*
