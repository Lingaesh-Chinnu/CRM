function messageFromValue(value) {
  if (Array.isArray(value)) {
    return value.map(messageFromValue).filter(Boolean).join(', ')
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([field, nested]) => {
        const label = field.replace(/_/g, ' ')
        const message = messageFromValue(nested)
        return message ? `${label}: ${message}` : ''
      })
      .filter(Boolean)
      .join(' ')
  }
  return value == null ? '' : String(value)
}

export function apiErrorMessage(error, fallback = 'Unable to load this page.') {
  const status = error?.response?.status
  const data = error?.response?.data
  if (typeof data === 'string') {
    if (/<html|<!doctype/i.test(data)) {
      return status >= 500
        ? 'The server returned an error. Please try again later.'
        : fallback
    }
    const text = data.trim()
    if (text && text.length < 240) return text
  }
  const detail = data?.detail
  if (detail) return detail
  if (data?.errors) {
    const errorText = messageFromValue(data.errors)
    if (errorText) return errorText
  }
  const message = data?.message
  if (message) return message
  if (data && typeof data === 'object') {
    const fieldMessages = Object.entries(data)
      .map(([field, value]) => {
        const label = field.replace(/_/g, ' ')
        const message = messageFromValue(value)
        return `${label}: ${message}`
      })
      .join(' ')
    if (fieldMessages) return fieldMessages
  }
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to view this page.'
  if (status === 404) return 'This record was not found.'
  if (status >= 500) return 'The server returned an error. Please try again later.'
  if (error?.request) return 'Could not reach the server. Please check your connection and try again.'
  return fallback
}
