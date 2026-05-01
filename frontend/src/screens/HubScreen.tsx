import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

export default function HubScreen({ navigation }: any) {
  const initializeSocket = useStore(state => state.initializeSocket);
  const disconnectSocket = useStore(state => state.disconnectSocket);
  const isConnected = useStore(state => state.isConnected);

  const [weeklyGoal, setWeeklyGoal] = useState(120);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [weeklyProgress, setWeeklyProgress] = useState(0);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      initializeSocket();
      fetchStats();
      return () => {
        disconnectSocket();
      };
    }, [])
  );

  const fetchStats = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const userId = session.user.id;

    // Fetch user profile
    const { data: profile } = await supabase
      .from('Profiles')
      .select('username, weekly_goal_minutes')
      .eq('id', userId)
      .single();

    if (profile) {
      setWeeklyGoal(profile.weekly_goal_minutes || 120);
    }

    // Calculate start of week (Monday)
    const now = new Date();
    const day = now.getDay() || 7; 
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);

    // Fetch friends
    const { data: friends } = await supabase
      .from('Friendships')
      .select('user_id_1, user_id_2')
      .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
      .eq('status', 'ACCEPTED');

    const friendIds = friends ? friends.map(f => f.user_id_1 === userId ? f.user_id_2 : f.user_id_1) : [];
    const allIds = [userId, ...friendIds];
    
    // Fetch profiles of all
    const { data: profiles } = await supabase
      .from('Profiles')
      .select('id, username')
      .in('id', allIds);

    // Fetch sessions of all for the week
    const { data: allSessions } = await supabase
      .from('Sessions')
      .select('user_id, duration_seconds')
      .in('user_id', allIds)
      .gte('timestamp', startOfWeek.toISOString());

    const statsMap: Record<string, number> = {};
    allIds.forEach(id => statsMap[id] = 0);
    
    (allSessions || []).forEach(sess => {
      if (statsMap[sess.user_id] !== undefined) {
        statsMap[sess.user_id] += sess.duration_seconds;
      }
    });

    setWeeklyProgress(Math.floor(statsMap[userId] / 60));

    const board = (profiles || []).map(p => ({
      id: p.id,
      username: p.username,
      totalMinutes: Math.floor(statsMap[p.id] / 60)
    })).sort((a, b) => b.totalMinutes - a.totalMinutes);

    setLeaderboard(board);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const saveWeeklyGoal = async () => {
    const newGoal = parseInt(goalInput, 10);
    if (isNaN(newGoal) || newGoal <= 0) {
      Alert.alert('Invalid Goal', 'Please enter a valid number greater than 0.');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase
      .from('Profiles')
      .update({ weekly_goal_minutes: newGoal })
      .eq('id', session.user.id);

    if (error) {
      Alert.alert('Error', 'Failed to update goal');
    } else {
      setWeeklyGoal(newGoal);
      setIsEditingGoal(false);
    }
  };

  const progressPercent = Math.min(100, Math.round((weeklyProgress / weeklyGoal) * 100)) || 0;


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
        <View style={[styles.statusBadge, isConnected ? styles.connectedBadge : styles.disconnectedBadge]}>
          <Text style={[styles.statusIndicator, isConnected ? styles.connectedText : styles.disconnectedText]}>
            {isConnected ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        <View style={styles.goalHeaderRow}>
          <Text style={styles.infoText}>Weekly Progress</Text>
          <TouchableOpacity onPress={() => {
            setGoalInput(weeklyGoal.toString());
            setIsEditingGoal(!isEditingGoal);
          }}>
            <Text style={styles.editGoalText}>{isEditingGoal ? 'Cancel' : 'Edit Goal'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.goalBox}>
          {isEditingGoal ? (
            <View style={styles.goalEditRow}>
              <TextInput 
                style={styles.goalInput}
                value={goalInput}
                onChangeText={setGoalInput}
                keyboardType="numeric"
                placeholder="Minutes..."
                placeholderTextColor="#666"
              />
              <TouchableOpacity style={styles.saveGoalBtn} onPress={saveWeeklyGoal}>
                <Text style={styles.saveGoalText}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.goalRow}>
              <Text style={styles.goalValue}>{weeklyProgress} <Text style={styles.goalLabel}>/ {weeklyGoal} min</Text></Text>
              <Text style={styles.goalPercent}>{progressPercent}%</Text>
            </View>
          )}
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>

        <Text style={styles.infoText}>Start Session</Text>
        <View style={styles.actionsBox}>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => navigation.navigate('ActiveSession', { sessionType: 'POMODORO' })}
          >
            <Text style={styles.actionText}>Pomodoro Timer</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => navigation.navigate('ActiveSession', { sessionType: 'STOPWATCH' })}
          >
            <Text style={styles.actionText}>Stopwatch</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.infoText}>Weekly Leaderboard</Text>
        <View style={styles.networkBox}>
           {leaderboard.length > 0 ? (
             leaderboard.map((user, index) => (
               <View key={user.id} style={styles.leaderboardRow}>
                 <Text style={styles.leaderboardRank}>#{index + 1}</Text>
                 <Text style={styles.leaderboardName}>{user.username}</Text>
                 <Text style={styles.leaderboardScore}>{user.totalMinutes}m</Text>
               </View>
             ))
           ) : (
             <Text style={styles.dimText}>No stats available yet.</Text>
           )}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    padding: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 20,
  },
  title: {
    color: '#FFF',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 24,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  connectedBadge: {
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    borderColor: 'rgba(168, 85, 247, 0.3)',
  },
  disconnectedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusIndicator: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 12,
    fontWeight: '600',
  },
  connectedText: {
    color: '#A855F7',
  },
  disconnectedText: {
    color: '#A1A1AA',
  },
  content: {
    flex: 1,
  },
  infoText: {
    color: '#A1A1AA',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actionsBox: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    padding: 8,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
    marginBottom: 8,
  },
  actionText: {
    color: '#E9D5FF',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 14,
    fontWeight: '600',
  },
  networkBox: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    padding: 20,
    minHeight: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dimText: {
    color: '#52525B',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 14,
  },
  logoutButton: {
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 40,
  },
  logoutText: {
    color: '#FCA5A5',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 14,
    fontWeight: '600',
  },
  goalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 20,
    marginBottom: 12,
  },
  editGoalText: {
    color: '#A855F7',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  goalBox: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 8,
  },
  goalEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  goalInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    color: '#FFF',
    padding: 10,
    borderRadius: 8,
    marginRight: 10,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  saveGoalBtn: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  saveGoalText: {
    color: '#E9D5FF',
    fontWeight: '600',
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  goalValue: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  goalLabel: {
    color: '#A1A1AA',
    fontSize: 14,
    fontWeight: '500',
  },
  goalPercent: {
    color: '#A855F7',
    fontSize: 16,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#A855F7',
    borderRadius: 4,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  leaderboardRank: {
    color: '#A1A1AA',
    width: 30,
    fontWeight: '600',
  },
  leaderboardName: {
    color: '#FFF',
    flex: 1,
    fontWeight: '500',
  },
  leaderboardScore: {
    color: '#E9D5FF',
    fontWeight: '600',
  }
});
