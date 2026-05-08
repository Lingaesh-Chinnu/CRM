export function apiErrorMessage(error, fallback = 'Unable to load this page.') {
  const status = error?.response?.status
  const detail = error?.response?.data?.detail
  if (detail) return detail
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to view this page.'
  if (status === 404) return 'This record was not found.'
  if (status >= 500) return 'The server returned an error. Please try again later.'
  if (error?.request) return 'Could not reach the server. Please check your connection and try again.'
  return fallback
}
