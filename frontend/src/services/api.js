// ============================================================
// frontend/src/services/api.js — Axios instance with interceptors
// ============================================================
import axios from 'axios'

const apiBaseURL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const appBasePath = (import.meta.env.VITE_APP_BASE_PATH || '').replace(/\/$/, '')

const api = axios.create({
  baseURL: apiBaseURL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
})

const refreshApi = axios.create({
  baseURL: apiBaseURL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
})

function retryDelay(ms = 700) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    if (config.skipAuth) {
      return config
    }
    const token = localStorage.getItem('access_token')
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

    const canRetryRequest = (
      originalRequest
      && !originalRequest._networkRetry
      && String(originalRequest.method || 'get').toLowerCase() === 'get'
      && error.code !== 'ERR_CANCELED'
      && (
        !error.response
        || error.code === 'ECONNABORTED'
        || error.message?.toLowerCase().includes('timeout')
      )
    )

    if (canRetryRequest) {
      originalRequest._networkRetry = true
      await retryDelay()
      return api(originalRequest)
    }

    if (error.response?.status === 401 && !originalRequest?.skipAuth && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refresh = localStorage.getItem('refresh_token')
        if (!refresh) {
          throw new Error('No refresh token')
        }

        const { data } = await refreshApi.post('/auth/token/refresh/', { refresh })
        const newToken = data.access
        localStorage.setItem('access_token', newToken)
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return api(originalRequest)
      } catch (refreshError) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.replace(`${appBasePath}/login`)
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export { api }
export { apiBaseURL }
