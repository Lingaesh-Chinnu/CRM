export async function openProtectedFile(api, url, fallbackMessage, setMessage) {
  try {
    const { data } = await api.get(url, { responseType: 'blob' })
    const objectUrl = window.URL.createObjectURL(data)
    window.open(objectUrl, '_blank', 'noopener,noreferrer')
  } catch (error) {
    let detail = error.response?.data?.detail
    if (!detail && error.response?.data instanceof Blob) {
      try {
        const parsed = JSON.parse(await error.response.data.text())
        detail = parsed.detail
      } catch {
        detail = ''
      }
    }
    setMessage?.(detail || fallbackMessage || 'File is not available.')
  }
}
