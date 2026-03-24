type Props = { active: boolean }

/** Thin indeterminate bar under the header while Git operations run. */
export function AppLoadingBar({ active }: Props) {
  return (
    <div
      className={`app-loading-wrap${active ? ' app-loading-wrap--active' : ''}`}
      role={active ? 'progressbar' : undefined}
      aria-busy={active}
      aria-label={active ? 'Working' : undefined}
    >
      <div className="app-loading-bar" />
    </div>
  )
}
