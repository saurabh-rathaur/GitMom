import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { FaIcon } from './FaIcon'

export type ToastItem = {
  id: number
  message: string
  variant: 'info' | 'error'
}

const TOAST_MS = 3000
const ERROR_TOAST_MS = 4500
const MAX_VISIBLE = 8

type Props = {
  statusMessage: string
  errorMessage: string
}

/**
 * Right-side stacked notices (overlap style); each message auto-dismisses so users catch updates.
 */
export function NoticeSidebar({ statusMessage, errorMessage }: Props) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const skipFirstStatus = useRef(true)

  useEffect(() => {
    if (skipFirstStatus.current) {
      skipFirstStatus.current = false
      return
    }
    const text = statusMessage.trim()
    if (!text) return
    const id = ++idRef.current
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message: text, variant: 'info' }])
    window.setTimeout(() => {
      setToasts((p) => p.filter((t) => t.id !== id))
    }, TOAST_MS)
  }, [statusMessage])

  useEffect(() => {
    const text = errorMessage.trim()
    if (!text) return
    const id = ++idRef.current
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message: text, variant: 'error' }])
    window.setTimeout(() => {
      setToasts((p) => p.filter((t) => t.id !== id))
    }, ERROR_TOAST_MS)
  }, [errorMessage])

  if (toasts.length === 0) return null

  const ordered = [...toasts].reverse()

  return (
    <div className="notice-stack" aria-live="polite" aria-relevant="additions">
      {ordered.map((t, index) => (
        <div
          key={t.id}
          className={`notice-toast notice-toast--${t.variant} notice-toast--enter`}
          style={{ '--notice-layer': index } as CSSProperties}
          role="status"
        >
          <FaIcon
            name={t.variant === 'error' ? 'circle-exclamation' : 'circle-info'}
            className="notice-toast__ico"
          />
          <span className="notice-toast__text">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
