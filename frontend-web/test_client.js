import { createClient } from '@supabase/supabase-js';
import { io } from 'socket.io-client';

const SUPABASE_URL = 'https://wjqroovjtlbvcvofhbns.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqcXJvb3ZqdGxidmN2b2ZoYm5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMTA4MzUsImV4cCI6MjA5MjY4NjgzNX0.gSmiCOOgb816qspJwJTksFV3bl18cOnpwsM2mDEPZNI';
const SOCKET_URL = 'http://localhost:3000';

async function setupUser(email, password, username) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });

  console.log(`Authenticating ${email}...`);
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error) {
    console.log(`Sign in failed, trying to sign up ${email}...`);
    const signup = await supabase.auth.signUp({ email, password });
    if (signup.error) {
      throw new Error(`Sign up failed: ${signup.error.message}`);
    }
    data = signup.data;
  }

  const user = data.user;
  if (!user) throw new Error('No user returned');

  // Check if profile exists
  const { data: profile } = await supabase
    .from('Profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.has_onboarded) {
    console.log(`Onboarding ${username}...`);
    const { error: profileError } = await supabase
      .from('Profiles')
      .upsert({ id: user.id, username, has_onboarded: true }, { onConflict: 'id' });
    
    if (profileError) {
      throw new Error(`Profile onboarding failed: ${profileError.message}`);
    }
  }

  return {
    userId: user.id,
    token: data.session.access_token,
    username,
    supabase
  };
}

async function main() {
  try {
    // 1. Setup Bob
    const bob = await setupUser('bob_test@example.com', 'password123', 'bob_test');
    console.log(`Bob initialized: ID=${bob.userId}`);

    // 2. Setup Alice (to ensure her profile exists)
    const alice = await setupUser('alice_test@example.com', 'password123', 'alice_test');
    console.log(`Alice initialized: ID=${alice.userId}`);

    // 3. Establish Friendship (ACCEPTED)
    console.log('Establishing friendship between Alice and Bob...');
    const isFirst = alice.userId < bob.userId;
    const user_id_1 = isFirst ? alice.userId : bob.userId;
    const user_id_2 = isFirst ? bob.userId : alice.userId;

    const { error: friendshipError } = await bob.supabase
      .from('Friendships')
      .upsert({
        user_id_1,
        user_id_2,
        status: 'ACCEPTED',
        requested_by: bob.userId
      }, { onConflict: 'user_id_1,user_id_2' });

    if (friendshipError) {
      console.error('Failed to establish friendship:', friendshipError);
    } else {
      console.log('Friendship established successfully!');
    }

    // 4. Connect Bob to Socket server
    console.log('Connecting Bob to socket server...');
    const socket = io(SOCKET_URL, {
      reconnection: true
    });

    socket.on('connect', () => {
      console.log('Bob socket connected. Authenticating...');
      socket.emit('authenticate', bob.token, (response) => {
        if (response?.success) {
          console.log('Bob socket authenticated successfully!');
          
          // Join network for Alice
          socket.emit('join_network', [alice.userId]);
          console.log(`Bob joined network for Alice (${alice.userId})`);

          // Start a mock active timer for Bob to show he is active studying!
          console.log('Bob starting a mock timer (10 mins topic: "Refactoring Realtime Features")...');
          socket.emit('start_timer', {
            topic: 'Refactoring Realtime Features',
            timer_type: 'POMODORO',
            start_time_iso: new Date().toISOString(),
            duration_target: 600
          });
        } else {
          console.error('Bob socket authentication failed:', response?.error);
        }
      });
    });

    socket.on('friend_presence_update', (data) => {
      console.log('[Bob received friend_presence_update]:', data);
    });

    socket.on('receive_ephemeral_message', (data) => {
      console.log(`[Bob received message from ${data.sender_id}]:`, data.message);
      
      // Auto-reply after 1 second
      setTimeout(() => {
        console.log(`Bob replying to ${data.sender_id}...`);
        socket.emit('send_ephemeral_message', {
          target_user_id: data.sender_id,
          message: `👋 Hey, got your message: "${data.message}"`
        });
      }, 1000);
    });

    socket.on('nudge_received', (data) => {
      console.log(`[Bob received NUDGE from ${data.sender_id}]`);
      
      // Auto-nudge back after 1.5 seconds
      setTimeout(() => {
        console.log(`Bob nudging back ${data.sender_id}...`);
        socket.emit('send_nudge', {
          target_user_id: data.sender_id
        });
      }, 1500);
    });

    socket.on('disconnect', (reason) => {
      console.log('Bob socket disconnected:', reason);
    });

  } catch (err) {
    console.error('Fatal error in test client:', err);
  }
}

main();
