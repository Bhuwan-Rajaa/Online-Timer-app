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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setError('');

    try {
      // Create profile in Supabase
      const { data, error } = await supabase
        .from('Profiles')
        .insert([
          { id: user.id, username, has_onboarded: true }
        ])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // unique violation
          throw new Error('Username is already taken');
        }
        throw error;
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
              pattern="^[a-zA-Z0-9_]{3,15}$"
              title="3-15 characters, alphanumeric and underscores only."
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading || username.length < 3}
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
