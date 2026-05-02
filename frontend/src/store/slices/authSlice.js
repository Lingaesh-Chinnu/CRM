// ============================================================
// frontend/src/store/slices/authSlice.js
// ============================================================
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../services/api'

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login/', credentials)
    // Persist tokens in localStorage
    localStorage.setItem('access_token',  data.access)
    localStorage.setItem('refresh_token', data.refresh)
    if (data.session_log_id) {
      localStorage.setItem('session_log_id', data.session_log_id)
    } else {
      localStorage.removeItem('session_log_id')
    }
    return data
  } catch (err) {
    return rejectWithValue(err.response?.data?.detail || 'Login failed')
  }
})

export const logout = createAsyncThunk('auth/logout', async (_, { getState }) => {
  const refresh = localStorage.getItem('refresh_token')
  const sessionLogId = localStorage.getItem('session_log_id')
  try { await api.post('/auth/logout/', { refresh, session_log_id: sessionLogId }) } catch {}
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('session_log_id')
})

export const refreshToken = createAsyncThunk('auth/refresh', async (_, { rejectWithValue }) => {
  try {
    const refresh = localStorage.getItem('refresh_token')
    if (!refresh) throw new Error('No refresh token')

    const { data } = await api.post('/auth/token/refresh/', { refresh })
    localStorage.setItem('access_token', data.access)
    return data
  } catch (err) {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('session_log_id')
    return rejectWithValue('Session expired')
  }
})

export const fetchMe = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/auth/me/')
    return data
  } catch (err) {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('session_log_id')
    return rejectWithValue('Session expired')
  }
})

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    isAuthenticated: !!localStorage.getItem('access_token'),
    loading: false,
    error: null,
    initialized: !localStorage.getItem('access_token'),
  },
  reducers: {
    clearError: (state) => { state.error = null },
    setUser: (state, action) => { state.user = action.payload },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        state.isAuthenticated = true
        state.user = action.payload.user
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
        state.isAuthenticated = false
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null
        state.isAuthenticated = false
      })
      .addCase(refreshToken.fulfilled, (state, action) => {
        state.isAuthenticated = true
      })
      .addCase(refreshToken.rejected, (state) => {
        state.isAuthenticated = false
        state.user = null
        state.initialized = true
      })
      .addCase(fetchMe.pending, (state) => {
        state.initialized = false
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload
        state.isAuthenticated = true
        state.initialized = true
      })
      .addCase(fetchMe.rejected, (state) => {
        state.isAuthenticated = false
        state.user = null
        state.initialized = true
      })
  },
})

export const { clearError, setUser } = authSlice.actions
export default authSlice.reducer
