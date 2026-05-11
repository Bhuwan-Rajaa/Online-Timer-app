import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';

export const Onboarding = () => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user, setProfile } = useStore();
  const navigate = useNavigate();

  const isValidUsername = (name: string) => /^[a-zA-Z0-9_]{3,15}$/.test(name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const trimmed = username.trim();
    if (!isValidUsername(trimmed)) {
      setError('Username must be 3-15 characters, alphanumeric and underscores only.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Use upsert to handle retries gracefully (e.g., if profile row exists from a failed attempt)
      const { data, error: upsertError } = await supabase
        .from('Profiles')
        .upsert(
          { id: user.id, username: trimmed, has_onboarded: true },
          { onConflict: 'id' }
        )
        .select('id, username, has_onboarded, weekly_goal_minutes')
        .single();

      if (upsertError) {
        if (upsertError.code === '23505') {
          throw new Error('Username is already taken. Try a different one.');
        }
        throw upsertError;
      }

      setProfile(data);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to set username');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-center" style={{ height: '100%', flexDirection: 'column' }}>
      <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 'bold' }}>Initialize Profile</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.875rem' }}>
          Choose a unique developer alias to be identified on the network.
        </p>

        {error && (
          <div style={{ padding: '0.75rem', background: 'rgba(239, 35, 60, 0.1)', border: '1px solid var(--danger)', borderRadius: '8px', color: 'var(--danger)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', outline: 'none', textAlign: 'center', fontSize: '1.125rem' }}
              placeholder="@alias"
            />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
              3-15 characters, letters, numbers, and underscores only.
            </p>
          </div>
          
          <button 
            type="submit" 
            disabled={loading || username.trim().length < 3}
            className="glass-button"
            style={{ width: '100%' }}
          >
            {loading ? 'Validating...' : 'Claim Alias'}
          </button>
        </form>
      </div>
    </div>
  );
};
