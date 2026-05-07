import { Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Sidebar from './Sidebar'
import Header from './Header'
import { logout } from '../../store/slices/authSlice'
import { api } from '../../services/api'

const appBasePath = (import.meta.env.VITE_APP_BASE_PATH || '').replace(/\/$/, '')

export default function MainLayout() {
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!user) return undefined

    const heartbeat = window.setInterval(() => {
      api.post('/auth/heartbeat/', {
        session_log_id: localStorage.getItem('session_log_id'),
      }).catch(() => {})
    }, 60000)

    return () => window.clearInterval(heartbeat)
  }, [user])

  useEffect(() => {
    if (!user || user.role === 'super_admin') return undefined

    const timeoutMs = 15 * 60 * 1000
    let timeoutId

    const resetTimer = () => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        dispatch(logout()).finally(() => {
          window.location.replace(`${appBasePath}/login`)
        })
      }, timeoutMs)
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      window.clearTimeout(timeoutId)
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer))
    }
  }, [dispatch, user])

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
      <div className="flex min-h-screen min-w-0 flex-col md:ml-72">
        <Header onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
