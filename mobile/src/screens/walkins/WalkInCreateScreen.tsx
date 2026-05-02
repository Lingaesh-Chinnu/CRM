// Placeholder component
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

export default function WalkInCreateScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Walk-in</Text>
      <Text style={styles.placeholder}>Walk-in creation screen coming soon...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  placeholder: { fontSize: 16, color: '#666' },
})