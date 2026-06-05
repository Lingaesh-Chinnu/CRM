import { Outlet } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Sidebar from './Sidebar'
import Header from './Header'
import { logout, refreshToken } from '../../store/slices/authSlice'
import { api } from '../../services/api'

const appBasePath = (import.meta.env.VITE_APP_BASE_PATH || '').replace(/\/$/, '')

export default function MainLayout() {
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sessionWarningOpen, setSessionWarningOpen] = useState(false)
  const [sessionCountdown, setSessionCountdown] = useState(60)
  const warningOpenRef = useRef(false)
  const warningTimeoutRef = useRef(null)
  const logoutTimeoutRef = useRef(null)
  const countdownIntervalRef = useRef(null)
  const lastActivityRef = useRef(Date.now())

  useEffect(() => {
    if (!user) return undefined

    const markActivity = () => {
      lastActivityRef.current = Date.now()
    }
    const sendHeartbeat = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastActivityRef.current > 2 * 60 * 1000) return
      api.post('/auth/heartbeat/', {
        session_log_id: localStorage.getItem('session_log_id'),
      }).catch(() => {})
    }
    const activityEvents = ['mousemove', 'mousedown', 'click', 'keydown', 'touchstart']
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }))
    sendHeartbeat()
    const heartbeat = window.setInterval(sendHeartbeat, 60000)

    return () => {
      window.clearInterval(heartbeat)
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity))
    }
  }, [user])

  useEffect(() => {
    warningOpenRef.current = sessionWarningOpen
  }, [sessionWarningOpen])

  useEffect(() => {
    if (!user) return undefined

    const timeoutMs = user.role === 'super_admin' ? 60 * 60 * 1000 : 15 * 60 * 1000
    const warningMs = 60 * 1000

    const clearSessionTimers = () => {
      window.clearTimeout(warningTimeoutRef.current)
      window.clearTimeout(logoutTimeoutRef.current)
      window.clearInterval(countdownIntervalRef.current)
    }

    const redirectToLogin = () => {
      dispatch(logout()).finally(() => {
        window.location.replace(`${appBasePath}/login`)
      })
    }

    const showWarning = () => {
      setSessionCountdown(60)
      setSessionWarningOpen(true)
      window.clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = window.setInterval(() => {
        setSessionCountdown((current) => Math.max(current - 1, 0))
      }, 1000)
    }

    const resetTimer = () => {
      clearSessionTimers()
      if (warningOpenRef.current) {
        setSessionWarningOpen(false)
        setSessionCountdown(60)
      }
      warningTimeoutRef.current = window.setTimeout(showWarning, Math.max(timeoutMs - warningMs, 0))
      logoutTimeoutRef.current = window.setTimeout(redirectToLogin, timeoutMs)
    }

    const events = ['mousemove', 'mousedown', 'click', 'keydown', 'touchstart']
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      clearSessionTimers()
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer))
    }
  }, [dispatch, user])

  const stayLoggedIn = async () => {
    window.clearTimeout(warningTimeoutRef.current)
    window.clearTimeout(logoutTimeoutRef.current)
    window.clearInterval(countdownIntervalRef.current)
    setSessionWarningOpen(false)
    setSessionCountdown(60)
    try {
      await dispatch(refreshToken()).unwrap()
      await api.post('/auth/heartbeat/', {
        session_log_id: localStorage.getItem('session_log_id'),
      }).catch(() => {})
    } catch {
      dispatch(logout()).finally(() => {
        window.location.replace(`${appBasePath}/login`)
      })
      return
    }
    const event = new Event('mousemove')
    window.dispatchEvent(event)
  }

  const logoutNow = () => {
    window.clearTimeout(warningTimeoutRef.current)
    window.clearTimeout(logoutTimeoutRef.current)
    window.clearInterval(countdownIntervalRef.current)
    dispatch(logout()).finally(() => {
      window.location.replace(`${appBasePath}/login`)
    })
  }

  useEffect(() => {
    if (!mobileMenuOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileMenuOpen])

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-100">
      <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <div className="flex min-h-screen min-w-0 flex-col xl:ml-72">
        <Header onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5 xl:px-8">
          <Outlet />
        </main>
      </div>
      {sessionWarningOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Session Expiring</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Your session will expire in {sessionCountdown} seconds due to inactivity.
            </p>
            <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
              <button
                type="button"
                onClick={logoutNow}
                className="inline-flex min-w-[110px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Logout
              </button>
              <button
                type="button"
                onClick={stayLoggedIn}
                className="inline-flex min-w-[150px] justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
              >
                Stay Logged In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
