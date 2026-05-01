import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useStore } from '../store/useStore';

export default function ActiveSessionScreen({ navigation, route }: any) {
  const { sessionType } = route.params; // 'POMODORO' | 'STOPWATCH'
  const stopTimer = useStore(state => state.stopTimer);
  const startTimer = useStore(state => state.startTimer);
  
  const [elapsed, setElapsed] = useState(0);
  const [isActive, setIsActive] = useState(false);
  
  // Pomodoro settings (in minutes)
  const [workMinutes, setWorkMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  
  // 'WORK' | 'BREAK'
  const [mode, setMode] = useState<'WORK' | 'BREAK'>('WORK');

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive) {
      interval = setInterval(() => {
        setElapsed(e => e + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive]);

  // Handle phase transitions
  useEffect(() => {
    if (sessionType === 'POMODORO' && isActive) {
      if (mode === 'WORK' && elapsed >= workMinutes * 60) {
        setMode('BREAK');
        setElapsed(0);
      } else if (mode === 'BREAK' && elapsed >= breakMinutes * 60) {
        setMode('WORK');
        setElapsed(0);
      }
    }
  }, [elapsed, isActive, mode, workMinutes, breakMinutes, sessionType]);

  const handleStart = () => {
    setIsActive(true);
    startTimer({
      topic: sessionType === 'POMODORO' ? 'Deep Work' : 'Stopwatch',
      timer_type: sessionType,
      start_time_iso: new Date().toISOString(),
      duration_target: sessionType === 'POMODORO' ? workMinutes * 60 : 0
    });
  };

  const handleStop = async () => {
    setIsActive(false);
    await stopTimer();
    navigation.goBack();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const adjustTime = (type: 'WORK' | 'BREAK', amount: number) => {
    if (type === 'WORK') {
      setWorkMinutes(prev => Math.max(1, Math.min(120, prev + amount)));
    } else {
      setBreakMinutes(prev => Math.max(1, Math.min(60, prev + amount)));
    }
  };

  const renderTimerText = () => {
    if (sessionType === 'POMODORO') {
      const totalSeconds = mode === 'WORK' ? workMinutes * 60 : breakMinutes * 60;
      return formatTime(Math.max(0, totalSeconds - elapsed));
    }
    return formatTime(elapsed);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {sessionType === 'POMODORO' 
          ? (isActive ? (mode === 'WORK' ? 'Focus Session' : 'Break Time') : 'Timer Setup') 
          : 'Stopwatch'}
      </Text>
      
      {!isActive && sessionType === 'POMODORO' && (
        <View style={styles.settingsContainer}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Work</Text>
            <View style={styles.adjustBox}>
              <TouchableOpacity onPress={() => adjustTime('WORK', -5)} style={styles.adjustBtn}><Text style={styles.adjustText}>-</Text></TouchableOpacity>
              <Text style={styles.settingValue}>{workMinutes}m</Text>
              <TouchableOpacity onPress={() => adjustTime('WORK', 5)} style={styles.adjustBtn}><Text style={styles.adjustText}>+</Text></TouchableOpacity>
            </View>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Break</Text>
            <View style={styles.adjustBox}>
              <TouchableOpacity onPress={() => adjustTime('BREAK', -1)} style={styles.adjustBtn}><Text style={styles.adjustText}>-</Text></TouchableOpacity>
              <Text style={styles.settingValue}>{breakMinutes}m</Text>
              <TouchableOpacity onPress={() => adjustTime('BREAK', 1)} style={styles.adjustBtn}><Text style={styles.adjustText}>+</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={[
        styles.timerCircle, 
        mode === 'BREAK' && isActive && styles.timerCircleBreak,
        !isActive && styles.timerCircleInactive
      ]}>
        <Text style={styles.timerText}>
          {renderTimerText()}
        </Text>
      </View>

      <View style={styles.bottomControls}>
        {!isActive ? (
          <TouchableOpacity style={styles.startButton} onPress={handleStart}>
            <Text style={styles.startText}>Start</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
            <Text style={styles.stopText}>End Session</Text>
          </TouchableOpacity>
        )}
        
        {!isActive && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleStop}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    color: '#A1A1AA',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 14,
    position: 'absolute',
    top: 60,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
  },
  settingsContainer: {
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 40,
    marginTop: 60,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  settingLabel: {
    color: '#A1A1AA',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    width: 60,
  },
  adjustBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
  },
  adjustBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  adjustText: {
    color: '#E9D5FF',
    fontSize: 18,
    fontWeight: '600',
  },
  settingValue: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    width: 40,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  timerCircle: {
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
    backgroundColor: 'rgba(168, 85, 247, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 5,
    marginVertical: 20,
  },
  timerCircleBreak: {
    borderColor: 'rgba(52, 211, 153, 0.3)', // Emerald color for break
    backgroundColor: 'rgba(52, 211, 153, 0.05)',
    shadowColor: '#34D399',
  },
  timerCircleInactive: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    shadowOpacity: 0,
    elevation: 0,
  },
  timerText: {
    color: '#FFF',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 56,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 60,
    width: '100%',
    alignItems: 'center',
  },
  startButton: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderRadius: 24,
    marginBottom: 16,
  },
  startText: {
    color: '#E9D5FF',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontWeight: '600',
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stopButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    borderRadius: 24,
  },
  stopText: {
    color: '#FCA5A5',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontWeight: '600',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelText: {
    color: '#A1A1AA',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  }
});
