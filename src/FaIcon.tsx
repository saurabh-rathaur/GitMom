import type { CSSProperties } from 'react'

/** Font Awesome 6+ solid icon by name (without `fa-` prefix). */
export function FaIcon({
  name,
  className = '',
  style,
}: {
  /** e.g. `folder-open` → `fa-solid fa-folder-open` */
  name: string
  className?: string
  style?: CSSProperties
}) {
  const n = name.startsWith('fa-') ? name : `fa-${name}`
  return <i className={`fa-solid ${n} ${className}`.trim()} aria-hidden style={style} />
}

/** Brands set (e.g. git-alt). */
export function FaBrand({
  name,
  className = '',
  style,
}: {
  name: string
  className?: string
  style?: CSSProperties
}) {
  const n = name.startsWith('fa-') ? name : `fa-${name}`
  return <i className={`fa-brands ${n} ${className}`.trim()} aria-hidden style={style} />
}
