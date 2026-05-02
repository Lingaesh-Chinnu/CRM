import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Sidebar from './Sidebar'
import Header from './Header'
import { logout } from '../../store/slices/authSlice'
import { api } from '../../services/api'

export default function MainLayout() {
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)

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
          window.location.replace('/login')
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

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="flex min-h-screen flex-col md:ml-72">
        <Header />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
