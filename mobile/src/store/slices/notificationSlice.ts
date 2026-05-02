// ============================================================
// mobile/src/store/slices/notificationSlice.ts
// ============================================================
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface Notification {
  id: number
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message: string
}

interface NotificationState {
  notifications: Notification[]
}

const initialState: NotificationState = {
  notifications: [],
}

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification: (state, action: PayloadAction<Omit<Notification, 'id'>>) => {
      state.notifications.push({
        id: Date.now(),
        ...action.payload,
      })
    },
    removeNotification: (state, action: PayloadAction<number>) => {
      state.notifications = state.notifications.filter(
        (notif) => notif.id !== action.payload
      )
    },
    clearAllNotifications: (state) => {
      state.notifications = []
    },
  },
})

export const { addNotification, removeNotification, clearAllNotifications } = notificationSlice.actions
export default notificationSlice.reducer