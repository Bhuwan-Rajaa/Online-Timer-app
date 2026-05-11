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
    return <div className="flex-center" style={{ height: '100vh' }}>Loading...</div>;
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
        .select('id, username, has_onboarded, weekly_goal_minutes')
        .eq('id', userId)
        .single();
      
      if (!error && data) {
        setProfile(data);
      } else {
        setProfile(null); // Force onboarding if no profile found
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
