// Placeholder component
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

export default function LeadCreateScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Lead</Text>
      <Text style={styles.placeholder}>Lead creation screen coming soon...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  placeholder: { fontSize: 16, color: '#666' },
})