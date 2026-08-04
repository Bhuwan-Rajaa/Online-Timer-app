import { createClient } from '@supabase/supabase-js';
import { io } from 'socket.io-client';

const SUPABASE_URL = 'https://wjqroovjtlbvcvofhbns.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqcXJvb3ZqdGxidmN2b2ZoYm5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMTA4MzUsImV4cCI6MjA5MjY4NjgzNX0.gSmiCOOgb816qspJwJTksFV3bl18cOnpwsM2mDEPZNI';
const SOCKET_URL = 'http://localhost:3000';

async function setupUser(email, password, username) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });

  let { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const signup = await supabase.auth.signUp({ email, password });
    data = signup.data;
  }
  const user = data.user;
  return {
    userId: user.id,
    token: data.session.access_token,
    username,
    supabase
  };
}

async function main() {
  const bob = await setupUser('bob_test@example.com', 'password123', 'bob_test');
  const alice = await setupUser('alice_test@example.com', 'password123', 'alice_test');

  console.log(`Bob: ${bob.userId}, Alice: ${alice.userId}`);

  const bobSocket = io(SOCKET_URL);
  const aliceSocket = io(SOCKET_URL);

  // Bob connects
  bobSocket.on('connect', () => {
    bobSocket.emit('authenticate', bob.token, () => {
      console.log('Bob authenticated');
      bobSocket.emit('join_network', [alice.userId]);
      
      // Wait 1 second then Alice connects
      setTimeout(() => {
        aliceSocket.connect();
      }, 1000);
    });
  });

  aliceSocket.on('connect', () => {
    aliceSocket.emit('authenticate', alice.token, () => {
      console.log('Alice authenticated');
      aliceSocket.emit('join_network', [bob.userId]);
    });
  });

  aliceSocket.on('friend_presence_update', (data) => {
    console.log('[Alice received presence]', data);
    if (data.isOnline) {
      console.log('SUCCESS: Alice sees Bob online!');
      process.exit(0);
    }
  });

  setTimeout(() => {
    console.log('TIMEOUT: Alice did not see Bob online!');
    process.exit(1);
  }, 5000);
}

main();
