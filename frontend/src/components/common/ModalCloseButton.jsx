import { useEffect } from 'react'

export default function ModalCloseButton({
  onClick,
  disabled = false,
  className = '',
  label = 'Close dialog',
  enableEscape = true,
}) {
  useEffect(() => {
    if (!enableEscape || disabled || !onClick) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClick(event)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disabled, enableEscape, onClick])

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-2xl font-semibold leading-none text-rose-600 transition duration-150 ease-out hover:scale-110 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:pointer-events-none disabled:opacity-50 sm:right-5 sm:top-5 ${className}`}
    >
      <span aria-hidden="true">×</span>
    </button>
  )
}
