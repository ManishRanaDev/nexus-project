import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  SafeAreaView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import QRCode from 'react-native-qrcode-svg';

const socket = io('https://nexubacksend.shop', {
  transports: ['websocket'],
  secure: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
});

const CONTACT_ID = '918299515901@c.us';
const STORAGE_KEY = 'nexus-chat-918299515901';
const THEME_STORAGE_KEY = 'nexus-theme';
const LABEL = 'Stealth_Command';

// Random Nexus Server notification messages
const NEXUS_NOTIFICATIONS = [
  'Deployment started: v2.4.1',
  'Server spike detected: CPU 87%',
  'Database backup completed',
  'Auto-scaling initiated',
  'Cache cleared successfully',
  'SSL certificate renewed',
  'Security scan completed',
  'Memory optimization: +12%',
  'API response time: 45ms',
  'Load balancer updated',
  'New node added to cluster',
  'Failover test successful',
  'CDN cache refreshed',
  'Database query optimized',
  'System health: All OK',
  'Traffic spike: 2.3K req/s',
  'Backup verification passed',
  'Container restart: web-3',
  'Disk usage: 67% capacity',
  'Webhook delivered: 200 OK',
];

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  const [qr, setQr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'LOCKED' | 'FAKE' | 'REAL'>('LOCKED');
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(false);

  // Terminal states for FAKE mode
  const [terminalMessages, setTerminalMessages] = useState<
    { command: string; response: string; timestamp: string }[]
  >([
    {
      command: '',
      response:
        'Nexus Terminal v2.1.4\nType "help" for available commands.\nConnected to secure node.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [terminalInput, setTerminalInput] = useState('');

  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  // Load saved data
  useEffect(() => {
    loadSavedData();
    checkNotificationPermission();
  }, []);

  // Socket listeners
  useEffect(() => {
    socket.on('qr', setQr);
    socket.on('ready', () => setReady(true));
    socket.on('disconnected', (reason) => {
      setReady(false);
      Alert.alert('Disconnected', 'WhatsApp disconnected: ' + reason);
    });
    socket.on('message', (msg) => {
      if (msg.from === CONTACT_ID || msg.to === CONTACT_ID) {
        // Show notification only for incoming messages
        if (msg.from === CONTACT_ID) {
          showNexusNotification();
        }

        setMessages((prev) => {
          const updated = [...prev, msg];
          const filtered = updated.filter((m) => m.body || m.mediaUrl);
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
          return filtered;
        });
      }
    });

    return () => {
      socket.off('qr');
      socket.off('ready');
      socket.off('message');
    };
  }, [notificationPermission]);

  // Mode change
  useEffect(() => {
    if (mode === 'REAL') {
      socket.emit('request_status');
    }
  }, [mode]);

  // Notification listeners
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received:', notification);
      }
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Notification clicked:', response);
      }
    );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  const loadSavedData = async () => {
    try {
      const savedMessages = await AsyncStorage.getItem(STORAGE_KEY);
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      }

      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'dark') {
        setIsDarkMode(true);
      }
    } catch (error) {
      console.log('Error loading saved data:', error);
    }
  };

  const checkNotificationPermission = async () => {
    if (!Device.isDevice) {
      return;
    }

    const { status } = await Notifications.getPermissionsAsync();
    setNotificationPermission(status === 'granted');
  };

  const registerForPushNotificationsAsync = async () => {
    if (!Device.isDevice) {
      Alert.alert('Error', 'Must use physical device for push notifications');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      setNotificationPermission(false);
      Alert.alert(
        'Notifications Disabled',
        'Please enable notifications in Settings → Nexus Server → Notifications to receive alerts.'
      );
      return;
    }

    setNotificationPermission(true);

    // Configure notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#667eea',
      });
    }
  };

  const showNexusNotification = async () => {
    console.log('showNexusNotification called, permission:', notificationPermission);

    if (!notificationPermission) {
      console.log('Notification permission not granted');
      return;
    }

    const randomMessage =
      NEXUS_NOTIFICATIONS[Math.floor(Math.random() * NEXUS_NOTIFICATIONS.length)];

    console.log('Showing notification:', randomMessage);

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Nexus Server',
          body: randomMessage,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Show immediately
      });
      console.log('Notification scheduled successfully');
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  };

  const handleLogin = () => {
    if (pin === '1331') setMode('FAKE');
    else if (pin === '4387') setMode('REAL');
    else setMode('LOCKED');
  };

  const handleSendText = () => {
    const outgoing = {
      from: 'you',
      to: CONTACT_ID,
      body: newMessage,
      timestamp: Date.now(),
    };
    socket.emit('send_message', { message: newMessage });
    setMessages((prev) => {
      const updated = [...prev, outgoing];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    setNewMessage('');
  };

  const handleTerminalSend = () => {
    if (!terminalInput.trim()) return;

    const timestamp = new Date().toLocaleTimeString();
    const response = getTerminalResponse(terminalInput);

    if (response === '__CLEAR__') {
      setTerminalMessages([
        {
          command: '',
          response: 'Terminal cleared.',
          timestamp,
        },
      ]);
    } else {
      setTerminalMessages((prev) => [
        ...prev,
        {
          command: terminalInput,
          response,
          timestamp,
        },
      ]);
    }

    setTerminalInput('');
  };

  const getTerminalResponse = (cmd: string): string => {
    const lower = cmd.toLowerCase().trim();

    const responses: { [key: string]: string } = {
      help: 'Available commands:\n• system status\n• network scan\n• whoami\n• uptime\n• clear',
      'system status':
        '✓ CPU: 23% (Normal)\n✓ Memory: 4.2GB / 16GB\n✓ Disk: 234GB free\n✓ Network: Connected',
      'network scan':
        'Scanning...\n[172.16.0.1] Gateway - Online\n[172.16.0.45] Node - Online',
      whoami: 'User: admin@nexus\nPermission: Root\nSession: NX-7A4B-9C2D',
      uptime: 'System uptime: 47 days, 13 hours\nLoad average: 0.45',
      clear: '__CLEAR__',
    };

    if (responses[lower]) {
      return responses[lower];
    }

    // Random response
    const randomResponses = [
      'Processing request...\n✓ Operation completed',
      'Analyzing input...\n✓ Command executed',
      'Connecting to node...\n✓ Connection established',
    ];
    return randomResponses[Math.floor(Math.random() * randomResponses.length)];
  };

  const toggleTheme = async () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme ? 'dark' : 'light');
  };

  const currentTheme = isDarkMode ? darkTheme : lightTheme;

  // LOCKED MODE
  if (mode === 'LOCKED') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#667eea' }]}>
        <StatusBar style="light" />
        <View style={styles.loginBox}>
          <Text style={styles.loginTitle}>Welcome to Nexus</Text>
          <TextInput
            style={styles.loginInput}
            value={pin}
            onChangeText={setPin}
            placeholder="Enter PIN"
            secureTextEntry
            keyboardType="number-pad"
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // FAKE MODE
  if (mode === 'FAKE') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.background }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <StatusBar style={isDarkMode ? 'light' : 'dark'} />

        {/* Header */}
        <View style={[styles.header, { backgroundColor: currentTheme.headerBg }]}>
          <Text style={[styles.headerTitle, { color: currentTheme.headerText }]}>
            Nexus Terminal
          </Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={[styles.themeButton, { backgroundColor: currentTheme.suggestionBg }]}
              onPress={toggleTheme}
            >
              <Text style={{ fontSize: 16 }}>{isDarkMode ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.lockButton}
              onPress={() => {
                setMode('LOCKED');
                setQr(null);
                setReady(false);
              }}
            >
              <Text style={styles.lockButtonText}>Lock</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notification Banner */}
        {!notificationPermission && (
          <TouchableOpacity
            style={styles.notificationBanner}
            onPress={registerForPushNotificationsAsync}
          >
            <Text style={styles.notificationText}>🔔 Enable notifications</Text>
            <Text style={styles.notificationButton}>Enable</Text>
          </TouchableOpacity>
        )}

        {/* Messages */}
        <ScrollView style={styles.messagesContainer}>
          {terminalMessages.map((msg, i) => (
            <View key={i} style={styles.terminalMessage}>
              {msg.command ? (
                <View style={styles.commandBubble}>
                  <Text style={styles.commandText}>$ {msg.command}</Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.responseBubble,
                  { backgroundColor: currentTheme.messageBg },
                ]}
              >
                <Text style={[styles.responseText, { color: currentTheme.messageText }]}>
                  {msg.response}
                </Text>
                <Text style={[styles.timestamp, { color: currentTheme.footerText }]}>
                  {msg.timestamp}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={[styles.inputContainer, { backgroundColor: currentTheme.inputBg }]}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: currentTheme.messageBg,
                color: currentTheme.messageText,
              },
            ]}
            value={terminalInput}
            onChangeText={setTerminalInput}
            placeholder="Type a command..."
            placeholderTextColor={currentTheme.footerText}
            onSubmitEditing={handleTerminalSend}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: terminalInput.trim() ? '#667eea' : '#ccc' },
            ]}
            onPress={handleTerminalSend}
            disabled={!terminalInput.trim()}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // REAL MODE
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#f5f5f5' }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Stealth Chat</Text>
          <Text style={[styles.status, { color: ready ? '#4caf50' : '#ff9800' }]}>
            {ready ? '✓ Connected' : '⏳ Connecting...'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {notificationPermission && (
            <TouchableOpacity
              style={[styles.lockButton, { backgroundColor: '#4caf50' }]}
              onPress={showNexusNotification}
            >
              <Text style={styles.lockButtonText}>Test 🔔</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.lockButton}
            onPress={() => {
              setMode('LOCKED');
              setQr(null);
              setReady(false);
            }}
          >
            <Text style={styles.lockButtonText}>Lock</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notification Banner */}
      {!notificationPermission && (
        <TouchableOpacity
          style={styles.notificationBanner}
          onPress={registerForPushNotificationsAsync}
        >
          <View>
            <Text style={styles.notificationTitle}>🔔 Enable Notifications</Text>
            <Text style={styles.notificationSubtext}>
              Tap to receive Nexus Server alerts
            </Text>
          </View>
          <Text style={styles.notificationButton}>Enable</Text>
        </TouchableOpacity>
      )}

      {/* QR Code */}
      {!ready && qr && (
        <View style={styles.qrContainer}>
          <QRCode value={qr} size={200} />
          <Text style={styles.qrText}>Scan from WhatsApp → Linked Devices</Text>
        </View>
      )}

      {/* Messages */}
      {ready && (
        <>
          <ScrollView style={styles.messagesContainer}>
            {messages.slice(-20).map((msg, i) => {
              const isOutgoing = msg.from === 'you';
              return (
                <View
                  key={i}
                  style={[
                    styles.messageBubble,
                    isOutgoing ? styles.outgoingBubble : styles.incomingBubble,
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      isOutgoing ? styles.outgoingBubbleStyle : styles.incomingBubbleStyle,
                    ]}
                  >
                    <Text style={styles.senderLabel}>
                      {isOutgoing ? 'You' : LABEL}
                    </Text>
                    {msg.body ? (
                      <Text
                        style={[
                          styles.messageText,
                          { color: isOutgoing ? 'white' : '#333' },
                        ]}
                      >
                        {msg.body}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Type a message..."
              onSubmitEditing={handleSendText}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                { backgroundColor: newMessage.trim() ? '#667eea' : '#ccc' },
              ]}
              onPress={handleSendText}
              disabled={!newMessage.trim()}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const lightTheme = {
  background: '#f5f5f5',
  headerBg: 'white',
  headerText: '#333',
  messageBg: 'white',
  messageText: '#333',
  inputBg: 'white',
  footerText: '#999',
  suggestionBg: '#f0f0f0',
};

const darkTheme = {
  background: '#000000',
  headerBg: '#0a0a0a',
  headerText: '#ffffff',
  messageBg: '#1a1a1a',
  messageText: '#e0e0e0',
  inputBg: '#0a0a0a',
  footerText: '#666',
  suggestionBg: '#1a1a1a',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loginBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 24,
  },
  loginInput: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  loginButton: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  status: {
    fontSize: 12,
    marginTop: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  themeButton: {
    padding: 10,
    borderRadius: 6,
  },
  lockButton: {
    backgroundColor: '#f44336',
    padding: 10,
    borderRadius: 6,
    paddingHorizontal: 16,
  },
  lockButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  notificationBanner: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationTitle: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  notificationSubtext: {
    color: 'white',
    fontSize: 12,
    opacity: 0.9,
    marginTop: 4,
  },
  notificationText: {
    color: 'white',
    fontSize: 13,
  },
  notificationButton: {
    backgroundColor: 'white',
    color: '#667eea',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    fontWeight: '600',
  },
  qrContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 12,
    padding: 40,
  },
  qrText: {
    color: '#666',
    fontSize: 14,
    marginTop: 16,
  },
  messagesContainer: {
    flex: 1,
    padding: 20,
  },
  terminalMessage: {
    marginBottom: 16,
  },
  commandBubble: {
    backgroundColor: '#667eea',
    padding: 12,
    borderRadius: 18,
    alignSelf: 'flex-end',
    maxWidth: '70%',
    marginBottom: 8,
  },
  commandText: {
    color: 'white',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14,
  },
  responseBubble: {
    padding: 12,
    borderRadius: 18,
    alignSelf: 'flex-start',
    maxWidth: '70%',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  responseText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 6,
    textAlign: 'right',
  },
  messageBubble: {
    marginBottom: 12,
  },
  outgoingBubble: {
    alignItems: 'flex-end',
  },
  incomingBubble: {
    alignItems: 'flex-start',
  },
  bubble: {
    padding: 12,
    borderRadius: 18,
    maxWidth: '70%',
  },
  outgoingBubbleStyle: {
    backgroundColor: '#667eea',
  },
  incomingBubbleStyle: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  senderLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    opacity: 0.8,
    color: 'white',
  },
  messageText: {
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  },
  sendButton: {
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});
