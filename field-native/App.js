import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
  StatusBar
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Get API base URL from app.json config (expo.extra.apiBaseUrl) or fallback
const getApiBaseUrl = () => {
  const extra = Constants.expoConfig?.extra;
  if (extra?.apiBaseUrl) return extra.apiBaseUrl;
  // Fallback for development
  return 'http://localhost:5530';
};

const API_BASE = getApiBaseUrl();
const TOKEN_KEY = '@npf_token';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Check for existing token on startup
  useEffect(() => {
    const init = async () => {
      try {
        const savedToken = await AsyncStorage.getItem(TOKEN_KEY);
        if (savedToken) {
          // Verify token is valid
          const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${savedToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            setToken(savedToken);
            setUser(data.user);
          } else {
            await AsyncStorage.removeItem(TOKEN_KEY);
          }
        }
      } catch (e) {
        console.log('Init error:', e);
      }
      // Force show login after max 2 seconds even if server down
      setTimeout(() => setLoading(false), 1500);
    };
    init();
  }, []);

  const login = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Enter username and password');
      return;
    }
    setLoggingIn(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.token) {
        await AsyncStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setUser(data.user);
      } else {
        Alert.alert('Login Failed', data.error || 'Invalid credentials');
      }
    } catch (e) {
      Alert.alert('Network Error', 'Cannot connect to server. Check internet and try again.');
    }
    setLoggingIn(false);
  };

  const logout = async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  // Loading screen
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0a1628" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0dccb0" />
          <Text style={styles.loadingText}>Loading NPF SitRep...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Login screen
  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0a1628" />
        <ScrollView contentContainerStyle={styles.scrollCenter}>
          <Text style={styles.title}>NPF FIELD AGENT</Text>
          <Text style={styles.subtitle}>Secure Login</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Username / Email"
            placeholderTextColor="#6b7a96"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            editable={!loggingIn}
          />
          
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#6b7a96"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loggingIn}
          />
          
          <TouchableOpacity 
            style={[styles.button, loggingIn && styles.buttonDisabled]} 
            onPress={login}
            disabled={loggingIn}
          >
            {loggingIn ? (
              <ActivityIndicator color="#0a1628" />
            ) : (
              <Text style={styles.buttonText}>LOGIN</Text>
            )}
          </TouchableOpacity>
          
          <Text style={styles.hint}>Server: {API_BASE}</Text>
          <Text style={styles.version}>v1.0.0 - Android 8+ Compatible</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Dashboard
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a1628" />
      <ScrollView style={styles.scroll}>
        <Text style={styles.title}>NPF DASHBOARD</Text>
        <Text style={styles.welcome}>Welcome, {user?.displayName || user?.username || 'Agent'}</Text>
        
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
          <TouchableOpacity style={styles.actionButton} onPress={() => Alert.alert('Coming Soon', 'Feature under development')}>
            <Text style={styles.actionText}>Submit SitRep</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => Alert.alert('Coming Soon', 'Feature under development')}>
            <Text style={styles.actionText}>Chat Command</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => Alert.alert('Coming Soon', 'Feature under development')}>
            <Text style={styles.actionText}>Voice Call</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Agent Info</Text>
          <Text style={styles.infoText}>Portal: {user?.portalId || 'N/A'}</Text>
          <Text style={styles.infoText}>Service: {user?.serviceNumber || 'N/A'}</Text>
        </View>
        
        <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={logout}>
          <Text style={styles.buttonText}>LOGOUT</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollCenter: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scroll: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0dccb0',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#8a9ab8',
    marginBottom: 32,
  },
  welcome: {
    fontSize: 16,
    color: '#8a9ab8',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    color: '#e8edf5',
    fontSize: 16,
  },
  button: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: '#0dccb0',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#0dccb080',
  },
  logoutButton: {
    backgroundColor: '#f87171',
    marginTop: 32,
    marginBottom: 50,
  },
  buttonText: {
    color: '#0a1628',
    fontWeight: 'bold',
    fontSize: 16,
  },
  hint: {
    color: '#6b7a96',
    fontSize: 12,
    marginTop: 24,
  },
  version: {
    color: '#4a5a76',
    fontSize: 11,
    marginTop: 8,
  },
  loadingText: {
    color: '#8a9ab8',
    marginTop: 16,
    fontSize: 14,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTitle: {
    color: '#e8edf5',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: 'rgba(13,204,176,0.2)',
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
  },
  actionText: {
    color: '#0dccb0',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 15,
  },
  infoText: {
    color: '#8a9ab8',
    fontSize: 14,
    marginBottom: 4,
  },
});
