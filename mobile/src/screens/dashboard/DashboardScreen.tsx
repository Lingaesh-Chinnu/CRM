// ============================================================
// mobile/src/screens/dashboard/DashboardScreen.tsx
// ============================================================
import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { useSelector } from 'react-redux'
import { RootState } from '../../store'
import { api } from '../../services/api'

interface DashboardStats {
  total_leads: number
  total_walkins: number
  total_enrollments: number
  total_revenue: number
}

export default function DashboardScreen() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const { user } = useSelector((state: RootState) => state.auth)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const { data } = await api.get('/dashboard/summary/')
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Welcome back, {user?.name || 'User'}!</Text>
        <Text style={styles.branchText}>{user?.branch?.name}</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats?.total_leads || 0}</Text>
          <Text style={styles.statLabel}>Total Leads</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats?.total_walkins || 0}</Text>
          <Text style={styles.statLabel}>Total Walk-ins</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats?.total_enrollments || 0}</Text>
          <Text style={styles.statLabel}>Total Enrollments</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>₹{stats?.total_revenue?.toLocaleString() || 0}</Text>
          <Text style={styles.statLabel}>Total Revenue</Text>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    marginBottom: 10,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  branchText: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  statsContainer: {
    padding: 10,
  },
  statCard: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#3b82f6',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})