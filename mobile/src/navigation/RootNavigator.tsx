// ============================================================
// mobile/src/navigation/RootNavigator.tsx
// ============================================================
import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useSelector } from 'react-redux'
import { RootState } from '../store'

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen'

// Tab screens
import DashboardScreen from '../screens/dashboard/DashboardScreen'
import LeadsScreen from '../screens/leads/LeadsScreen'
import LeadDetailScreen from '../screens/leads/LeadDetailScreen'
import LeadCreateScreen from '../screens/leads/LeadCreateScreen'
import WalkInsScreen from '../screens/walkins/WalkInsScreen'
import WalkInDetailScreen from '../screens/walkins/WalkInDetailScreen'
import WalkInCreateScreen from '../screens/walkins/WalkInCreateScreen'
import EnrollmentsScreen from '../screens/enrollments/EnrollmentsScreen'
import PaymentsScreen from '../screens/payments/PaymentsScreen'
import PaymentAddScreen from '../screens/payments/PaymentAddScreen'
import ProfileScreen from '../screens/profile/ProfileScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

function LeadsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="LeadsList" component={LeadsScreen} options={{ title: 'Leads' }} />
      <Stack.Screen name="LeadDetail" component={LeadDetailScreen} options={{ title: 'Lead Details' }} />
      <Stack.Screen name="LeadCreate" component={LeadCreateScreen} options={{ title: 'Create Lead' }} />
    </Stack.Navigator>
  )
}

function WalkInsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="WalkInsList" component={WalkInsScreen} options={{ title: 'Walk-ins' }} />
      <Stack.Screen name="WalkInDetail" component={WalkInDetailScreen} options={{ title: 'Walk-in Details' }} />
      <Stack.Screen name="WalkInCreate" component={WalkInCreateScreen} options={{ title: 'Create Walk-in' }} />
    </Stack.Navigator>
  )
}

function EnrollmentsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="EnrollmentsList" component={EnrollmentsScreen} options={{ title: 'Enrollments' }} />
    </Stack.Navigator>
  )
}

function PaymentsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="PaymentsList" component={PaymentsScreen} options={{ title: 'Payments' }} />
      <Stack.Screen name="PaymentAdd" component={PaymentAddScreen} options={{ title: 'Add Payment' }} />
    </Stack.Navigator>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Leads" component={LeadsStack} />
      <Tab.Screen name="WalkIns" component={WalkInsStack} />
      <Tab.Screen name="Enrollments" component={EnrollmentsStack} />
      <Tab.Screen name="Payments" component={PaymentsStack} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  )
}

export default function RootNavigator() {
  const { isAuthenticated } = useSelector((state: RootState) => state.auth)

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