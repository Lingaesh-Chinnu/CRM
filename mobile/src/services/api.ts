// ============================================================
// mobile/src/services/api.ts — Axios instance with interceptors
// ============================================================
import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { store } from '../store'
import { refreshToken, logout } from '../store/slices/authSlice'

const api = axios.create({
  baseURL: 'http://10.0.2.2:8000/api', // Android emulator localhost
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        await store.dispatch(refreshToken()).unwrap()
        const newToken = await AsyncStorage.getItem('access_token')
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return api(originalRequest)
      } catch (refreshError) {
        store.dispatch(logout())
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export { api }