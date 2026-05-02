import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useLocation } from 'react-router-dom'
import { login, clearError } from '../../store/slices/authSlice'
import toast from 'react-hot-toast'
import brandLogo from '../../assets/brand-logo.png'
import LoginAnimatedBackground from '../../components/common/LoginAnimatedBackground'

export default function LoginPage() {
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [loginType, setLoginType] = useState('admin')
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { loading, error } = useSelector((state) => state.auth)

  useEffect(() => {
    dispatch(clearError())
  }, [dispatch])

  const handleSubmit = async (e) => {
    e.preventDefault()
    dispatch(clearError())

    try {
      const data = await dispatch(login(credentials)).unwrap()
      const role = data?.user?.role

      if (loginType === 'admin' && role !== 'super_admin') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        throw new Error('Admin access required. Use an Admin account.')
      }

      if (loginType === 'user' && role === 'super_admin') {
        toast.success('Signed in as Admin')
      } else {
        toast.success('Login successful!')
      }

      const from = location.state?.from?.pathname || '/dashboard'
      navigate(from, { replace: true })
    } catch (err) {
      toast.error(err?.message || err || 'Login failed')
    }
  }

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <div className="login-libertinus relative min-h-screen overflow-hidden bg-slate-950">
      <LoginAnimatedBackground />

      <div className="relative grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_520px]">
        <section className="relative hidden px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
          <div className="flex items-center gap-4">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_60px_-30px_rgba(15,23,42,0.9)] backdrop-blur-sm sm:h-32 sm:w-32">
              <img src={brandLogo} alt="IIE Logo" className="h-20 w-20 object-contain sm:h-24 sm:w-24" />
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight text-white sm:text-3xl">Indra Institute of Education</p>
              <p className="mt-2 text-base text-slate-300 sm:text-lg">IT Training &amp; Testing Services</p>
            </div>
          </div>

          <div className="relative z-10 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Welcome
            </p>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-tight tracking-tight text-white xl:text-6xl">
              Your Workspace is ready for takeoff.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Guide every student with clarity and confidence.
              Turn enquiries into successful careers.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {['Gandhipuram', 'Hopes', 'Kuniyamuthur'].map((item) => (
                <span
                  key={item}
                  className="login-feature-chip rounded-full border border-cyan-400/20 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="login-card-shell w-full max-w-md rounded-[32px] border border-white/10 bg-white/95 p-7 shadow-[0_32px_100px_-35px_rgba(15,23,42,0.9)] backdrop-blur sm:p-9">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Login
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                Sign in to IIE
              </h2>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 rounded-3xl bg-slate-100 p-2">
              <button
                type="button"
                onClick={() => setLoginType('admin')}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${loginType === 'admin' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-white'}`}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => setLoginType('user')}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${loginType === 'user' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-white'}`}
              >
                User
              </button>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="username" className="mb-2 block text-sm font-semibold text-slate-700">
                    Username
                  </label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    className="login-input block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    placeholder="Enter your username"
                    value={credentials.username}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    className="login-input block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    placeholder={loginType === 'admin' ? 'Enter Admin password' : 'Enter your password'}
                    value={credentials.password}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="login-submit-btn w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{loading ? 'Signing in...' : `Sign in as ${loginType === 'admin' ? 'Admin' : 'User'}`}</span>
                <span aria-hidden="true" className="text-base">&rarr;</span>
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
