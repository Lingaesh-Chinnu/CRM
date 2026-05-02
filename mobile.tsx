// ============================================================
// mobile/App.tsx — React Native Entry Point
// ============================================================
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { Provider } from 'react-redux'
import { store } from './src/store'
import RootNavigator from './src/navigation/RootNavigator'
import Toast from 'react-native-toast-message'

export default function App() {
  return (
    <Provider store={store}>
      <NavigationContainer>
        <RootNavigator />
        <Toast />
      </NavigationContainer>
    </Provider>
  )
}


// ============================================================
// mobile/src/navigation/RootNavigator.tsx
// ============================================================
import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs'
import { useSelector } from 'react-redux'

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen'

// Tab screens
import DashboardScreen    from '../screens/dashboard/DashboardScreen'
import LeadsScreen        from '../screens/leads/LeadsScreen'
import LeadDetailScreen   from '../screens/leads/LeadDetailScreen'
import LeadCreateScreen   from '../screens/leads/LeadCreateScreen'
import WalkInsScreen      from '../screens/walkins/WalkInsScreen'
import WalkInDetailScreen from '../screens/walkins/WalkInDetailScreen'
import WalkInCreateScreen from '../screens/walkins/WalkInCreateScreen'
import EnrollmentsScreen  from '../screens/enrollments/EnrollmentsScreen'
import PaymentsScreen     from '../screens/payments/PaymentsScreen'
import PaymentAddScreen   from '../screens/payments/PaymentAddScreen'
import ProfileScreen      from '../screens/profile/ProfileScreen'

const Stack = createNativeStackNavigator()
const Tab   = createBottomTabNavigator()

function LeadsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="LeadsList"  component={LeadsScreen}       options={{ title: 'Leads' }} />
      <Stack.Screen name="LeadDetail" component={LeadDetailScreen}  options={{ title: 'Lead Detail' }} />
      <Stack.Screen name="LeadCreate" component={LeadCreateScreen}  options={{ title: 'Add Lead' }} />
    </Stack.Navigator>
  )
}

function WalkInsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="WalkInsList"  component={WalkInsScreen}       options={{ title: 'Walk-ins' }} />
      <Stack.Screen name="WalkInDetail" component={WalkInDetailScreen}  options={{ title: 'Walk-in Detail' }} />
      <Stack.Screen name="WalkInCreate" component={WalkInCreateScreen}  options={{ title: 'New Walk-in' }} />
    </Stack.Navigator>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Dashboard"   component={DashboardScreen}  options={{ title: 'Dashboard' }} />
      <Tab.Screen name="LeadsTab"    component={LeadsStack}        options={{ title: 'Leads' }} />
      <Tab.Screen name="WalkInsTab"  component={WalkInsStack}      options={{ title: 'Walk-ins' }} />
      <Tab.Screen name="Enrollments" component={EnrollmentsScreen} options={{ title: 'Enrollments' }} />
      <Tab.Screen name="Payments"    component={PaymentsScreen}    options={{ title: 'Payments' }} />
      <Tab.Screen name="Profile"     component={ProfileScreen}     options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}

export default function RootNavigator() {
  const { isAuthenticated } = useSelector((s: any) => s.auth)

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  )
}


// ============================================================
// mobile/src/services/api.ts — Axios config for mobile
// ============================================================
import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.yourcrm.com/api'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('access_token')
  if (token) config.headers!.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = await AsyncStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh })
          await AsyncStorage.setItem('access_token', data.access)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          await AsyncStorage.multiRemove(['access_token','refresh_token'])
        }
      }
    }
    return Promise.reject(error)
  }
)


// ============================================================
// mobile/src/screens/auth/LoginScreen.tsx
// ============================================================
import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native'
import { useDispatch } from 'react-redux'
import { login } from '../../store/slices/authSlice'
import type { AppDispatch } from '../../store'

export default function LoginScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const dispatch = useDispatch<AppDispatch>()
  const [loading, setLoading]   = useState(false)

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter username and password')
      return
    }
    setLoading(true)
    try {
      await dispatch(login({ username, password })).unwrap()
    } catch (err: any) {
      Alert.alert('Login Failed', err || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>CRM ERP</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Login</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  card:       { width: '88%', backgroundColor: '#fff', borderRadius: 16, padding: 28,
                shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  title:      { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 4, color: '#1a1a2e' },
  subtitle:   { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 24 },
  input:      { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14,
                fontSize: 16, marginBottom: 14, backgroundColor: '#fafafa' },
  btn:        { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText:    { color: '#fff', fontSize: 16, fontWeight: '600' },
})


// ============================================================
// mobile/src/screens/leads/LeadsScreen.tsx
// ============================================================
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { api } from '../../services/api'

interface Lead {
  id: number
  lead_number: string
  name: string
  phone: string
  course_name: string
  status: string
  walkin_date: string | null
}

const STATUS_COLORS: Record<string, string> = {
  new:       '#3b82f6',
  follow_up: '#f59e0b',
  walk_in:   '#8b5cf6',
  converted: '#10b981',
  lost:      '#ef4444',
}

export default function LeadsScreen() {
  const [leads,     setLeads]     = useState<Lead[]>([])
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(1)
  const [hasMore,   setHasMore]   = useState(true)
  const navigation = useNavigation<any>()

  const fetchLeads = useCallback(async (pg = 1, q = search) => {
    try {
      const { data } = await api.get('/leads/', { params: { page: pg, search: q } })
      if (pg === 1) {
        setLeads(data.results)
      } else {
        setLeads(prev => [...prev, ...data.results])
      }
      setHasMore(!!data.next)
    } catch (e) {
      console.error('Failed to fetch leads', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [search])

  useEffect(() => { fetchLeads(1) }, [fetchLeads])

  const onRefresh = () => {
    setRefreshing(true)
    setPage(1)
    fetchLeads(1)
  }

  const onEndReached = () => {
    if (hasMore && !loading) {
      const nextPage = page + 1
      setPage(nextPage)
      fetchLeads(nextPage)
    }
  }

  const renderItem = ({ item }: { item: Lead }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('LeadDetail', { id: item.id })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.leadNo}>{item.lead_number}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] || '#888' }]}>
          <Text style={styles.badgeText}>{item.status.replace('_', ' ')}</Text>
        </View>
      </View>
      <Text style={styles.name}>{item.name}</Text>
      <Text style={styles.meta}>{item.phone}  •  {item.course_name || 'No course'}</Text>
      {item.walkin_date && (
        <Text style={styles.walkIn}>Walk-in: {item.walkin_date}</Text>
      )}
    </TouchableOpacity>
  )

  if (loading && page === 1) {
    return <ActivityIndicator style={{ flex: 1, marginTop: 100 }} size="large" color="#4f46e5" />
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="Search leads..."
          value={search}
          onChangeText={(t) => { setSearch(t); setPage(1); fetchLeads(1, t) }}
        />
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('LeadCreate')}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={leads}
        renderItem={renderItem}
        keyExtractor={(i) => String(i.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 40 }}>No leads found</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f8f9fa' },
  searchRow:  { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff',
                borderBottomWidth: 1, borderBottomColor: '#eee' },
  search:     { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12,
                fontSize: 14, height: 40 },
  addBtn:     { backgroundColor: '#4f46e5', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  card:       { backgroundColor: '#fff', borderRadius: 12, padding: 16,
                shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  leadNo:     { fontSize: 12, color: '#888', fontWeight: '500' },
  badge:      { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:  { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  name:       { fontSize: 16, fontWeight: '600', color: '#1a1a2e', marginBottom: 4 },
  meta:       { fontSize: 13, color: '#666' },
  walkIn:     { fontSize: 12, color: '#4f46e5', marginTop: 6 },
})


// ============================================================
// mobile/package.json
// ============================================================
/* {
  "name": "crm-erp-mobile",
  "version": "1.0.0",
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start":   "expo start",
    "android": "expo start --android",
    "ios":     "expo start --ios"
  },
  "dependencies": {
    "expo":                              "~50.0.0",
    "@react-navigation/native":          "^6.1.0",
    "@react-navigation/native-stack":    "^6.9.0",
    "@react-navigation/bottom-tabs":     "^6.5.0",
    "react-native-screens":              "~3.29.0",
    "react-native-safe-area-context":    "4.8.2",
    "@reduxjs/toolkit":                  "^2.2.0",
    "react-redux":                       "^9.1.0",
    "axios":                             "^1.6.0",
    "@react-native-async-storage/async-storage": "^1.22.0",
    "react-native-toast-message":        "^2.2.0"
  }
} */
