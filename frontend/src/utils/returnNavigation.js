export const FOLLOW_UP_SUCCESS_MESSAGE = 'Follow-up updated successfully'

export function currentReturnTo(location) {
  return `${location.pathname}${location.search || ''}`
}

export function withReturnTo(to, returnTo) {
  const value = String(to || '')
  if (!returnTo || value.includes('next=')) return value
  return `${value}${value.includes('?') ? '&' : '?'}next=${encodeURIComponent(returnTo)}`
}

function normalizeInternalPath(value) {
  if (!value) return ''
  if (typeof value === 'object' && value.pathname) {
    return `${value.pathname}${value.search || ''}`
  }
  const path = String(value)
  return path.startsWith('/') && !path.startsWith('//') ? path : ''
}

export function resolveReturnTo(location, fallback) {
  const params = new URLSearchParams(location.search || '')
  return (
    normalizeInternalPath(params.get('next')) ||
    normalizeInternalPath(location.state?.returnTo) ||
    normalizeInternalPath(location.state?.from) ||
    fallback
  )
}

