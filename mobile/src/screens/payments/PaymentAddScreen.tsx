// Placeholder component
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

export default function PaymentAddScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Payment</Text>
      <Text style={styles.placeholder}>Payment add screen coming soon...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  placeholder: { fontSize: 16, color: '#666' },
})