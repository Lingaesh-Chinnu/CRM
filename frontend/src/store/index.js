// ============================================================
// frontend/src/store/index.js — Redux store
// ============================================================
import { configureStore } from '@reduxjs/toolkit'
import authReducer         from './slices/authSlice'
import notifReducer        from './slices/notificationSlice'

export const store = configureStore({
  reducer: {
    auth:          authReducer,
    notifications: notifReducer,
  },
})