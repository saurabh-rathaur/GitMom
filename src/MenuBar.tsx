import { useEffect, useMemo, useRef } from 'react'
import { FaBrand, FaIcon } from './FaIcon'

export type MenuId = 'file' | 'view' | 'project' | 'recent' | 'branches' | 'history'

export type BranchMenuRow = {
  key: string
  display: string
  isCurrent: boolean
}

type Props = {
  openMenu: MenuId | null
  setOpenMenu: (id: MenuId | null) => void
  busy: boolean
  repoPath: string
  currentBranch: string
  recentRepos: string[]
  branchList: BranchMenuRow[]
  branchInput: string
  onBranchInputChange: (value: string) => void
  newBranchName: string
  onNewBranchNameChange: (value: string) => void
  onBranchSwitch: () => void
  onBranchCreate: () => void
  onBranchMerge: () => void
  onOpenRepository: () => void
  onOpenRecent: (path: string) => void
  onRefreshRepo: () => void
  onShowWorkspace: () => void
  onShowHistory: () => void
  onShowSearch: () => void
  onShowLanguages: () => void
  onShowIssues: () => void
  onAiAssistant: () => void
  onFetch: () => void
  onPullBase: () => void
  onScrollToPanel: (id: string) => void
  onRefreshHistory: () => void
}

export function MenuBar({
  openMenu,
  setOpenMenu,
  busy,
  repoPath,
  currentBranch,
  recentRepos,
  branchList,
  branchInput,
  onBranchInputChange,
  newBranchName,
  onNewBranchNameChange,
  onBranchSwitch,
  onBranchCreate,
  onBranchMerge,
  onOpenRepository,
  onOpenRecent,
  onRefreshRepo,
  onShowWorkspace,
  onShowHistory,
  onShowSearch,
  onShowLanguages,
  onShowIssues,
  onAiAssistant,
  onFetch,
  onPullBase,
  onScrollToPanel,
  onRefreshHistory,
}: Props) {
  const rootRef = useRef<HTMLElement | null>(null)

  const branchSelectDeduped = useMemo(() => {
    const seen = new Set<string>()
    return branchList.filter((r) => {
      if (seen.has(r.display)) return false
      seen.add(r.display)
      return true
    })
  }, [branchList])

  const repoFolderLabel = useMemo(() => {
    if (!repoPath.trim()) return 'No repository open'
    const parts = repoPath.replace(/[/\\]+$/, '').split(/[/\\]/)
    const leaf = parts.filter(Boolean).pop()
    return leaf || repoPath
  }, [repoPath])

  useEffect(() => {
    if (!openMenu) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openMenu, setOpenMenu])

  const toggle = (id: MenuId) => {
    setOpenMenu(openMenu === id ? null : id)
  }

  const item = (label: string, action: () => void, disabled?: boolean, icon?: string) => (
    <button
      type="button"
      className="menubar-dropdown__item"
      disabled={busy || disabled}
      onClick={() => {
        action()
        setOpenMenu(null)
      }}
    >
      {icon ? <FaIcon name={icon} className="menubar-dropdown__ico" /> : null}
      <span className="menubar-dropdown__label">{label}</span>
    </button>
  )

  return (
    <nav className="menubar" ref={rootRef} aria-label="Application menu">
      <div className="menubar__inner">
        <div className="menubar__brand" title="GitMom v1.1 — Made by Saurabh Rathaur">
          <FaBrand name="git-alt" className="menubar__brand-icon" />
          <div className="menubar__brand-text">
            <div className="menubar__title-row">
              <span className="menubar__title">GitMom</span>
              <span className="menubar__version">v1.1</span>
            </div>
            <span className="menubar__credit">Made by Saurabh Rathaur</span>
          </div>
        </div>

        <div className="menubar__menus">
          <div className={`menubar-menu ${openMenu === 'file' ? 'is-open' : ''}`}>
            <button type="button" className="menubar-menu__trigger" onClick={() => toggle('file')}>
              <FaIcon name="file-lines" className="menubar-menu__ico" />
              File
            </button>
            {openMenu === 'file' ? (
              <div className="menubar-dropdown" role="menu">
                {item('Open Repository…', onOpenRepository, false, 'folder-open')}
                {item('Refresh repository', onRefreshRepo, !repoPath, 'arrows-rotate')}
              </div>
            ) : null}
          </div>

          <div className={`menubar-menu ${openMenu === 'view' ? 'is-open' : ''}`}>
            <button type="button" className="menubar-menu__trigger" onClick={() => toggle('view')}>
              <FaIcon name="eye" className="menubar-menu__ico" />
              View
            </button>
            {openMenu === 'view' ? (
              <div className="menubar-dropdown" role="menu">
                {item('Workspace', onShowWorkspace, false, 'table-columns')}
                {item('History', onShowHistory, false, 'clock-rotate-left')}
                {item('Search project', onShowSearch, !repoPath, 'magnifying-glass')}
                {item('Languages', onShowLanguages, !repoPath, 'layer-group')}
                {item('Issues', onShowIssues, !repoPath, 'triangle-exclamation')}
                <div className="menubar-dropdown__sep" />
                {item('Scroll to files', () => onScrollToPanel('panel-files'), !repoPath, 'file-lines')}
                {item('Scroll to branches', () => onScrollToPanel('panel-branches'), !repoPath, 'code-branch')}
                {item('Scroll to commit', () => onScrollToPanel('panel-commit'), !repoPath, 'clipboard')}
                <div className="menubar-dropdown__sep" />
                {item('AI assistant…', onAiAssistant, !repoPath, 'wand-magic-sparkles')}
              </div>
            ) : null}
          </div>

          <div className={`menubar-menu ${openMenu === 'project' ? 'is-open' : ''}`}>
            <button type="button" className="menubar-menu__trigger" onClick={() => toggle('project')}>
              <FaIcon name="diagram-project" className="menubar-menu__ico" />
              Project
            </button>
            {openMenu === 'project' ? (
              <div className="menubar-dropdown" role="menu">
                {item('Open Repository…', onOpenRepository, false, 'folder-open')}
                {item('Refresh repository', onRefreshRepo, !repoPath, 'arrows-rotate')}
              </div>
            ) : null}
          </div>

          <div className={`menubar-menu ${openMenu === 'recent' ? 'is-open' : ''}`}>
            <button type="button" className="menubar-menu__trigger" onClick={() => toggle('recent')}>
              <FaIcon name="clock-rotate-left" className="menubar-menu__ico" />
              Recent
            </button>
            {openMenu === 'recent' ? (
              <div className="menubar-dropdown menubar-dropdown--wide" role="menu">
                <div className="menubar-dropdown__heading">Recent repositories</div>
                <div className="menubar-dropdown__scroll">
                  {recentRepos.length === 0 ? (
                    <div className="menubar-dropdown__empty">No recent repositories</div>
                  ) : (
                    recentRepos.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className="menubar-dropdown__item menubar-dropdown__item--path"
                        disabled={busy}
                        title={r}
                        onClick={() => {
                          onOpenRecent(r)
                          setOpenMenu(null)
                        }}
                      >
                        <FaIcon name="folder-closed" className="menubar-dropdown__ico menubar-dropdown__ico--muted" />
                        <span className="menubar-dropdown__label truncate">{r}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className={`menubar-menu ${openMenu === 'branches' ? 'is-open' : ''}`}>
            <button type="button" className="menubar-menu__trigger" onClick={() => toggle('branches')}>
              <FaIcon name="code-branch" className="menubar-menu__ico" />
              Branches
            </button>
            {openMenu === 'branches' ? (
              <div className="menubar-dropdown menubar-dropdown--branches" role="menu">
                <div className="menubar-dropdown__current">
                  <FaIcon name="code-branch" className="menubar-dropdown__ico menubar-dropdown__ico--inline" />
                  Current branch: <strong>{currentBranch || '—'}</strong>
                </div>
                {item('Fetch', onFetch, !repoPath, 'download')}
                {item('Pull', onPullBase, !repoPath, 'arrow-down')}
                {item('Merge selected branch', onBranchMerge, !repoPath || !branchInput.trim(), 'code-merge')}
                <div className="menubar-dropdown__sep" />
                <div className="menubar-dropdown__heading">Select branch</div>
                <div className="menubar-dropdown__form">
                  <select
                    className="menubar-dropdown__select"
                    value={branchInput}
                    onChange={(e) => onBranchInputChange(e.target.value)}
                    disabled={busy || !repoPath}
                    aria-label="Select branch"
                  >
                    <option value="">Select branch…</option>
                    {branchSelectDeduped.map((row) => (
                      <option key={row.key} value={row.display}>
                        {row.display}
                        {row.isCurrent ? ' (current)' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="menubar-dropdown__form-actions">
                    <button
                      type="button"
                      className="menubar-dropdown__btn"
                      disabled={busy || !repoPath || !branchInput.trim()}
                      onClick={() => {
                        onBranchSwitch()
                        setOpenMenu(null)
                      }}
                    >
                      Switch
                    </button>
                  </div>
                </div>
                <div className="menubar-dropdown__sep" />
                <div className="menubar-dropdown__heading">New branch</div>
                <div className="menubar-dropdown__form">
                  <input
                    type="text"
                    className="menubar-dropdown__input"
                    value={newBranchName}
                    onChange={(e) => onNewBranchNameChange(e.target.value)}
                    placeholder="Branch name"
                    disabled={busy || !repoPath}
                    aria-label="New branch name"
                  />
                  <div className="menubar-dropdown__form-actions">
                    <button
                      type="button"
                      className="menubar-dropdown__btn"
                      disabled={busy || !repoPath || !newBranchName.trim()}
                      onClick={() => {
                        onBranchCreate()
                        setOpenMenu(null)
                      }}
                    >
                      Create
                    </button>
                  </div>
                </div>
                <div className="menubar-dropdown__sep" />
                {item('Show branches panel', () => onScrollToPanel('panel-branches'), !repoPath, 'sitemap')}
              </div>
            ) : null}
          </div>

          <div className={`menubar-menu ${openMenu === 'history' ? 'is-open' : ''}`}>
            <button type="button" className="menubar-menu__trigger" onClick={() => toggle('history')}>
              <FaIcon name="list-ul" className="menubar-menu__ico" />
              History
            </button>
            {openMenu === 'history' ? (
              <div className="menubar-dropdown" role="menu">
                {item('Open history view', onShowHistory, false, 'clock-rotate-left')}
                {item('Search in project', onShowSearch, !repoPath, 'magnifying-glass')}
                {item('Languages in project', onShowLanguages, !repoPath, 'layer-group')}
                {item('Issues in project', onShowIssues, !repoPath, 'triangle-exclamation')}
                {item('Refresh history', onRefreshHistory, !repoPath, 'arrows-rotate')}
              </div>
            ) : null}
          </div>
        </div>

        <div className="menubar__status" aria-live="polite">
          <span className="menubar__path truncate" title={repoPath.trim() ? repoPath : undefined}>
            <FaIcon name="folder-open" className="menubar__status-ico" />
            {repoFolderLabel}
          </span>
          <span className="menubar__branch truncate" title={currentBranch}>
            <FaIcon name="code-branch" className="menubar__status-ico" />
            {currentBranch || '—'}
          </span>
        </div>
      </div>
    </nav>
  )
}
