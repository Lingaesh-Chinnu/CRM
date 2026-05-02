// ============================================================
// mobile/src/store/index.ts — Redux store
// ============================================================
import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import notifReducer from './slices/notificationSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    notifications: notifReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch