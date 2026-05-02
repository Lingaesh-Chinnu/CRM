// ============================================================
// mobile/src/App.tsx — React Native Entry Point
// ============================================================
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { Provider } from 'react-redux'
import { store } from './store'
import RootNavigator from './navigation/RootNavigator'
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