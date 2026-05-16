import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000,
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY must be configured in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface AuthenticatedSocket extends Socket {
  user?: any;
}

// In-memory mapping to store active timers.
const activeTimers = new Map<string, any>(); // userId -> timerPayload
const onlineUsers = new Map<string, number>(); // userId -> connection count

io.on('connection', (socket: AuthenticatedSocket) => {
  console.log('New connection:', socket.id);

  socket.on('authenticate', async (token: string, callback) => {
    try {
      let user: any = null;
      
      if (process.env.SUPABASE_JWT_SECRET) {
        // Fast, local verification
        const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET) as any;
        // JWT from Supabase contains sub as user_id
        user = { id: decoded.sub };
      } else {
        // Fallback to network request if secret isn't provided
        console.warn('SUPABASE_JWT_SECRET not provided, falling back to network auth verification.');
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) throw new Error(error?.message || 'Invalid user');
        user = data.user;
      }
      
      socket.user = user;
      socket.join(`user_${user.id}`); // private room for direct messages/nudges
      
      const currentCount = onlineUsers.get(user.id) || 0;
      onlineUsers.set(user.id, currentCount + 1);
      if (currentCount === 0) {
        socket.to(`friend_network_${user.id}`).emit('friend_presence_update', { userId: user.id, isOnline: true, statusOnly: true });
      }

      console.log(`User ${user.id} authenticated on socket ${socket.id}`);
      if(callback) callback({ success: true, userId: user.id });
    } catch (err) {
      console.error('Auth server error:', err);
      if(callback) callback({ success: false, error: 'Authentication failed' });
    }
  });

  socket.on('join_network', (friendIds: string[]) => {
    if (!socket.user) return;
    const myId = socket.user.id;

    // Subscribe to friends' presence updates
    friendIds.forEach(id => {
      socket.join(`friend_network_${id}`);
      // Immediately push back the friend's current state to this socket
      const activeTimer = activeTimers.get(id);
      const isOnline = onlineUsers.has(id);

      if (activeTimer) {
        socket.emit('friend_presence_update', activeTimer);
      } else if (isOnline) {
        socket.emit('friend_presence_update', { userId: id, isOnline: true, statusOnly: true });
      }
    });

    // Also tell each of my friends who are already in my network room that I am online now
    // This fixes the race where the authenticate broadcast fires into an empty room
    const myActiveTimer = activeTimers.get(myId);
    if (myActiveTimer) {
      socket.to(`friend_network_${myId}`).emit('friend_presence_update', myActiveTimer);
    } else {
      socket.to(`friend_network_${myId}`).emit('friend_presence_update', { userId: myId, isOnline: true, statusOnly: true });
    }
  });

  socket.on('request_presence_sync', () => {
    if (!socket.user) return;
    // Client wants to know current active timers of friends.
    // The client should ideally send the friendIds they are interested in, 
    // or the server can just broadcast the latest state of anyone in their rooms.
    // However, since state is small, we can just answer with active timers of people they requested.
    // For simplicity, we skip full sync if not implemented strictly, 
    // but the documentation mentions `request_presence_sync`. 
  });

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
    
    // Broadcast to my friend network (all sockets who joined my friend_network_ room)
    socket.to(`friend_network_${socket.user.id}`).emit('friend_presence_update', timerData);
  });

  socket.on('stop_timer', async (data, callback) => {
    if (!socket.user) {
      if (callback) callback();
      return;
    }
    
    const activeTimer = activeTimers.get(socket.user.id);
    if (activeTimer) {
      activeTimers.delete(socket.user.id);
      
      // Calculate duration and save to Supabase
      const startTime = new Date(activeTimer.start_time_iso).getTime();
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      
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
      }

      socket.to(`friend_network_${socket.user.id}`).emit('friend_presence_update', {
        userId: socket.user.id,
        stopped: true,
        duration_seconds: durationSeconds
      });
    }
    if (callback) callback();
  });

  socket.on('send_ephemeral_message', ({ target_user_id, message }) => {
    if (!socket.user) return;
    io.to(`user_${target_user_id}`).emit('receive_ephemeral_message', {
      sender_id: socket.user.id,
      message
    });
  });

  socket.on('send_nudge', ({ target_user_id }) => {
    if (!socket.user) return;
    io.to(`user_${target_user_id}`).emit('nudge_received', {
      sender_id: socket.user.id
    });
  });

  socket.on('notify_friend_request', ({ target_user_id }) => {
    if (!socket.user) return;
    io.to(`user_${target_user_id}`).emit('friend_request_received');
  });

  socket.on('disconnect', async () => {
    if (socket.user) {
      const currentCount = onlineUsers.get(socket.user.id) || 0;
      if (currentCount <= 1) {
        onlineUsers.delete(socket.user.id);
        socket.to(`friend_network_${socket.user.id}`).emit('friend_presence_update', {
          userId: socket.user.id,
          isOnline: false,
          statusOnly: true
        });
      } else {
        onlineUsers.set(socket.user.id, currentCount - 1);
      }

      const activeTimer = activeTimers.get(socket.user.id);
      if (activeTimer) {
        activeTimers.delete(socket.user.id);
        
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

        socket.to(`friend_network_${socket.user.id}`).emit('friend_presence_update', {
          userId: socket.user.id,
          stopped: true,
          duration_seconds: durationSeconds
        });
      }
    }
    console.log('Socket disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO Server running on port ${PORT}`);
});
