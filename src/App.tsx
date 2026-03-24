import { useEffect, useMemo, useState } from 'react'
import type {
  AiIssueInsightsResult,
  CodeIssue,
  CommitItem,
  RepoInfo,
  RepoLanguageStats,
  RepoSearchHit,
  ScanCodeIssuesResult,
  StatusFile,
} from './types'
import { getGitTool, MISSING_GIT_TOOL_MESSAGE, requireGit } from './gitToolClient'
import { DiffViewer } from './DiffViewer'
import { FaIcon } from './FaIcon'
import { AppLoadingBar } from './AppLoadingBar'
import { MenuBar, type BranchMenuRow, type MenuId } from './MenuBar'
import { NoticeSidebar } from './NoticeSidebar'
import { getRepoLanguageVisual, RepoLanguageIcon, repoLangRowStyle } from './RepoLanguageVisual'

type RequirementType = 'Bugfix' | 'Feature' | 'Refactor' | 'Chore' | 'Docs' | 'Test'
type DiffMode = 'vs-master'

/** Pull, push-to-default, and diff base (change here if your default branch is `main` only). */
const BASE_BRANCH = 'master'

function formatCommitMessage(requirementType: RequirementType, message: string, ticketId: string) {
  const ticket = ticketId.trim() ? `[${ticketId.trim()}] ` : ''
  return `${requirementType}: ${ticket}${message.trim()}`
}

function buildIssuesScanSummary(issues: CodeIssue[]) {
  return issues
    .slice(0, 220)
    .map((i) => `[${i.severity}] ${i.file}:${i.line} ${i.category} — ${i.text}`)
    .join('\n')
}

export default function App() {
  const [repoPath, setRepoPath] = useState('')
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null)
  const [files, setFiles] = useState<StatusFile[]>([])
  const [preview, setPreview] = useState('No staged changes.')
  const [history, setHistory] = useState<CommitItem[]>([])

  const [requirementType, setRequirementType] = useState<RequirementType>('Feature')
  const [commitMessage, setCommitMessage] = useState('')
  const [ticketId, setTicketId] = useState('')
  const [stageAll, setStageAll] = useState(false)
  const [pushToMaster, setPushToMaster] = useState(false)
  const [pushTarget, setPushTarget] = useState('')
  const [branchInput, setBranchInput] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [compareOutput, setCompareOutput] = useState('')
  const [diffPanelTitle, setDiffPanelTitle] = useState('Code diff preview')
  const [diffModalOpen, setDiffModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'workspace' | 'history' | 'search' | 'languages' | 'issues'>(
    'workspace'
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<RepoSearchHit[]>([])
  const [searchTruncated, setSearchTruncated] = useState(false)
  const [langStats, setLangStats] = useState<RepoLanguageStats | null>(null)
  const [issuesScan, setIssuesScan] = useState<ScanCodeIssuesResult | null>(null)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [aiInsights, setAiInsights] = useState<AiIssueInsightsResult | null>(null)
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [pushConfirmOpen, setPushConfirmOpen] = useState(false)

  const [statusMessage, setStatusMessage] = useState('Please select a Git repository folder.')
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [noDesktopBridge] = useState(() => typeof window !== 'undefined' && !getGitTool())
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null)

  const finalCommitMessage = useMemo(
    () => formatCommitMessage(requirementType, commitMessage || '<empty message>', ticketId),
    [requirementType, commitMessage, ticketId]
  )

  const issues = useMemo(() => issuesScan?.issues ?? [], [issuesScan])
  const selectedIssue = useMemo(() => {
    if (!selectedIssueId) return null
    return issues.find((i) => i.id === selectedIssueId) ?? null
  }, [issues, selectedIssueId])

  const branchMenuRows = useMemo((): BranchMenuRow[] => {
    if (!repoInfo?.branches) return []
    return repoInfo.branches.map((b) => {
      const display = b.replace('remotes/origin/', '')
      return {
        key: b,
        display,
        isCurrent: display === repoInfo.currentBranch,
      }
    })
  }, [repoInfo])

  /** One option per display name for the branch &lt;select&gt; */
  const branchSelectOptions = useMemo(() => {
    const seen = new Set<string>()
    return branchMenuRows.filter((r) => {
      if (seen.has(r.display)) return false
      seen.add(r.display)
      return true
    })
  }, [branchMenuRows])

  const refreshData = async (targetRepoPath: string) => {
    const git = requireGit()
    const [info, status, log] = await Promise.all([
      git.getRepoInfo(targetRepoPath),
      git.getStatus(targetRepoPath),
      git.getHistory(targetRepoPath),
    ])
    setRepoInfo(info)
    setFiles(status.files)
    setPreview(status.preview)
    setHistory(log)
    setPushTarget(info.currentBranch)
    setSelectedFiles([])
    setCompareOutput('')
    setDiffPanelTitle('Code diff preview')
    return { info, status, log }
  }

  /** After commit / push: empty message fields and reset stage-all. */
  const clearCommitForm = () => {
    setCommitMessage('')
    setTicketId('')
    setStageAll(false)
  }

  const statusSummaryLine = (fileCount: number) =>
    fileCount === 0
      ? 'Working tree clean (no pending changes).'
      : `${fileCount} changed path(s) — see Working tree and Staged summary below.`

  const run = async (task: () => Promise<void>) => {
    if (!getGitTool()) {
      setErrorMessage(MISSING_GIT_TOOL_MESSAGE)
      setStatusMessage('Use the Electron window: npm run dev')
      return
    }
    setBusy(true)
    setErrorMessage('')
    try {
      await task()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setErrorMessage(`Error: ${message}`)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void run(async () => {
      const recents = await requireGit().loadRecentRepositories()
      setRecentRepos(recents)
    })
  }, [])

  useEffect(() => {
    setSearchQuery('')
    setSearchHits([])
    setSearchTruncated(false)
    setLangStats(null)
    setIssuesScan(null)
    setSelectedIssueId(null)
    setAiInsights(null)
  }, [repoPath])

  useEffect(() => {
    if (activeTab !== 'languages' || !repoPath || !getGitTool()) return
    void run(async () => {
      const s = await requireGit().getLanguageStats(repoPath)
      setLangStats(s)
      setStatusMessage(
        `${s.languageCount} language kind(s) across ${s.totalTrackedFiles} tracked file(s) (by file name / extension).`
      )
    })
    // Intentionally only when switching to Languages or changing repo — not when `run` identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, repoPath])

  useEffect(() => {
    if (activeTab !== 'issues' || !repoPath || !getGitTool()) return
    void run(async () => {
      const r = await requireGit().scanCodeIssues(repoPath)
      setIssuesScan(r)
      setSelectedIssueId(null)
      setAiInsights(null)
      setStatusMessage(
        r.issues.length === 0
          ? 'No pattern-based issues in tracked files.'
          : `${r.issues.length} issue line(s).${r.truncated ? ' List capped at 500.' : ''}`
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, repoPath])

  const chooseRepo = async () =>
    run(async () => {
      const selected = await requireGit().pickRepository()
      if (!selected) return
      setRepoPath(selected)
      setStatusMessage('Current Branch: loading...')
      await refreshData(selected)
      const recents = await requireGit().loadRecentRepositories()
      setRecentRepos(recents)
      setStatusMessage('Repository loaded.')
      focusFilesSection()
    })

  const openRecent = async (path: string) =>
    run(async () => {
      const selected = await requireGit().openRecentRepository(path)
      setRepoPath(selected)
      await refreshData(selected)
      setStatusMessage('Recent repository opened — showing file section.')
      focusFilesSection()
    })

  const fetchLatest = async () =>
    run(async () => {
      if (!repoPath) return
      await requireGit().fetchUpdates(repoPath)
      await refreshData(repoPath)
      setStatusMessage('Fetched latest changes from remote repository.')
    })

  const switchBranch = async () =>
    run(async () => {
      if (!repoPath || !branchInput.trim()) return
      await requireGit().switchBranch(repoPath, branchInput.trim())
      await refreshData(repoPath)
      setStatusMessage(`Switched to branch: ${branchInput.trim()}`)
      setBranchInput('')
    })

  const createBranch = async () =>
    run(async () => {
      if (!repoPath || !newBranchName.trim()) return
      await requireGit().createBranch(repoPath, newBranchName.trim())
      await refreshData(repoPath)
      setStatusMessage(`Created and switched to branch: ${newBranchName.trim()}`)
      setNewBranchName('')
    })

  const pullFromMaster = async () =>
    run(async () => {
      if (!repoPath) return
      await requireGit().pullMaster(repoPath, BASE_BRANCH)
      await refreshData(repoPath)
      setStatusMessage(`Pulled changes from ${BASE_BRANCH}.`)
    })

  const commitChanges = async () =>
    run(async () => {
      if (!repoPath) return
      if (!commitMessage.trim()) {
        throw new Error('Commit message is required.')
      }
      await requireGit().commit(repoPath, finalCommitMessage, { stageAll })
      const { status } = await refreshData(repoPath)
      clearCommitForm()
      setStatusMessage(`Commit successful — form cleared. ${statusSummaryLine(status.files.length)}`)
    })

  const stageSelectedFiles = async () =>
    run(async () => {
      if (!repoPath) return
      if (selectedFiles.length === 0) {
        throw new Error('Select at least one file to stage.')
      }
      await requireGit().stageFiles(repoPath, selectedFiles)
      await refreshData(repoPath)
      setStatusMessage(`Staged ${selectedFiles.length} selected file(s).`)
    })

  const loadDiffForPaths = (paths: string[], mode: DiffMode = 'vs-master') =>
    run(async () => {
      if (!repoPath) return
      if (paths.length === 0) {
        throw new Error('Select file(s), or double-click a row for diff vs master.')
      }
      const base = BASE_BRANCH
      const text = await requireGit().diffWorkingFiles(repoPath, mode, base, paths)
      setCompareOutput(text)
      setDiffPanelTitle(`Working tree vs «${base}»`)
      setStatusMessage(`Diff vs ${base} — ${paths.length} file(s).`)
    })

  const loadDiff = (mode: DiffMode, onlyPaths?: string[]) => {
    const paths = onlyPaths && onlyPaths.length > 0 ? onlyPaths : selectedFiles
    return loadDiffForPaths(paths, mode)
  }

  const runProjectSearch = () =>
    run(async () => {
      if (!repoPath) return
      const q = searchQuery.trim()
      if (!q) {
        throw new Error('Type something to search in tracked files.')
      }
      const { hits, truncated } = await requireGit().searchRepo(repoPath, q)
      setSearchHits(hits)
      setSearchTruncated(truncated)
      const extra = truncated ? ' (list capped — refine your search).' : ''
      setStatusMessage(hits.length === 0 ? 'No matches in tracked files.' : `${hits.length} match line(s).${extra}`)
    })

  const openNotepadCompare = (onlyPath?: string) =>
    run(async () => {
      if (!repoPath) return
      const paths = onlyPath ? [onlyPath] : selectedFiles
      if (paths.length === 0) {
        throw new Error('Select a file, or double-click a row.')
      }
      const rel = paths[0]
      const msg = await requireGit().openNotepadCompare(repoPath, BASE_BRANCH, rel)
      setStatusMessage(
        paths.length > 1 ? `${msg} (${paths.length} selected — opened first file only.)` : msg
      )
    })

  const unstageSelectedFiles = async () =>
    run(async () => {
      if (!repoPath) return
      if (selectedFiles.length === 0) {
        throw new Error('Select at least one file to unstage.')
      }
      await requireGit().unstageFiles(repoPath, selectedFiles)
      await refreshData(repoPath)
      setStatusMessage(`Unstaged ${selectedFiles.length} file(s).`)
    })

  const copyDiffToClipboard = async () => {
    if (!compareOutput.trim()) {
      setStatusMessage('Nothing to copy — run a diff first.')
      return
    }
    try {
      await navigator.clipboard.writeText(compareOutput)
      setErrorMessage('')
      setStatusMessage('Diff copied to clipboard.')
    } catch {
      setErrorMessage('Clipboard copy failed.')
    }
  }

  const performPush = async () =>
    run(async () => {
      if (!repoPath || !repoInfo) return
      const branch = pushTarget.trim() || repoInfo.currentBranch
      const alsoDefault = pushToMaster
      await requireGit().push(repoPath, branch)
      if (alsoDefault) {
        await requireGit().push(repoPath, BASE_BRANCH)
      }
      const { status } = await refreshData(repoPath)
      clearCommitForm()
      setPushConfirmOpen(false)
      const pushed = `Pushed to ${branch}${alsoDefault ? ` and ${BASE_BRANCH}` : ''}.`
      setStatusMessage(`${pushed} Form cleared. ${statusSummaryLine(status.files.length)}`)
    })

  const isProtectedBranch = (branch: string) => {
    const normalized = branch.trim().toLowerCase()
    return normalized === 'master' || normalized === 'main'
  }

  const pushChanges = async () => {
    if (!repoInfo) return
    const branch = pushTarget.trim() || repoInfo.currentBranch
    const includesProtected = isProtectedBranch(branch) || (pushToMaster && isProtectedBranch(BASE_BRANCH))
    if (includesProtected) {
      setPushConfirmOpen(true)
      return
    }
    await performPush()
  }

  const mergeBranch = async () =>
    run(async () => {
      if (!repoPath || !branchInput.trim()) return
      await requireGit().merge(repoPath, branchInput.trim())
      await refreshData(repoPath)
      setStatusMessage(`Merged branch: ${branchInput.trim()}`)
      setBranchInput('')
    })

  const revertSelectedCommit = async (hash: string) =>
    run(async () => {
      if (!repoPath) return
      await requireGit().revertCommit(repoPath, hash)
      await refreshData(repoPath)
      setStatusMessage(`Reverted commit: ${hash}`)
    })

  const showConflictHelp = async () =>
    run(async () => {
      if (!repoPath) return
      const text = await requireGit().resolveConflictsHint(repoPath)
      setStatusMessage(`Resolve Conflicts:\n${text}`)
    })

  const toggleFile = (file: string, checked: boolean) => {
    setSelectedFiles((prev) => {
      if (checked) {
        return prev.includes(file) ? prev : [...prev, file]
      }
      return prev.filter((value) => value !== file)
    })
  }

  const selectAllFiles = () => {
    setSelectedFiles(files.map((file) => file.file))
  }

  const clearFileSelection = () => {
    setSelectedFiles([])
  }

  const suggestAiMessage = () => {
    const changedCount = files.length
    const scope = selectedFiles.length > 0 ? `${selectedFiles.length} selected file(s)` : `${changedCount} file(s)`
    const branch = repoInfo?.currentBranch || 'current-branch'
    setCommitMessage(`Improve ${scope} on ${branch} and align branch/file workflow UI`)
    setStatusMessage('AI suggestion added to commit message.')
  }

  const scrollToPanel = (id: string) => {
    setActiveTab('workspace')
    setOpenMenu(null)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }

  /** After opening a repo, show the file list section (working tree). */
  const focusFilesSection = () => {
    setActiveTab('workspace')
    setOpenMenu(null)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById('panel-files')
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        el?.classList.add('panel-files--flash')
        window.setTimeout(() => el?.classList.remove('panel-files--flash'), 1400)
      })
    })
  }

  const refreshRepository = () =>
    void run(async () => {
      if (!repoPath) return
      await refreshData(repoPath)
      if (activeTab === 'languages') {
        const s = await requireGit().getLanguageStats(repoPath)
        setLangStats(s)
      }
      if (activeTab === 'issues') {
        const r = await requireGit().scanCodeIssues(repoPath)
        setIssuesScan(r)
        setSelectedIssueId(null)
        setAiInsights(null)
      }
      setStatusMessage('Repository refreshed.')
    })

  return (
    <div className="app-shell">
      {noDesktopBridge ? (
        <section className="card electron-missing" role="alert">
          <h2>Desktop app required</h2>
          <p>{MISSING_GIT_TOOL_MESSAGE}</p>
          <p className="hint">
            Quick fix: close this browser tab, open a terminal in the GitMom project folder, run <code>npm run dev</code>,
            and use the <strong>Electron window</strong> that opens (not localhost in Chrome/Edge).
          </p>
        </section>
      ) : null}

      <header className="app-chrome">
        <MenuBar
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          busy={busy}
          repoPath={repoPath}
          currentBranch={repoInfo?.currentBranch || ''}
          recentRepos={recentRepos}
          branchList={branchMenuRows}
          branchInput={branchInput}
          onBranchInputChange={setBranchInput}
          newBranchName={newBranchName}
          onNewBranchNameChange={setNewBranchName}
          onBranchSwitch={() => void switchBranch()}
          onBranchCreate={() => void createBranch()}
          onBranchMerge={() => void mergeBranch()}
          onOpenRepository={() => void chooseRepo()}
          onOpenRecent={(p) => void openRecent(p)}
          onRefreshRepo={refreshRepository}
          onShowWorkspace={() => setActiveTab('workspace')}
          onShowHistory={() => setActiveTab('history')}
          onShowSearch={() => setActiveTab('search')}
          onShowLanguages={() => setActiveTab('languages')}
          onShowIssues={() => setActiveTab('issues')}
          onAiAssistant={() => setAiModalOpen(true)}
          onFetch={() => void fetchLatest()}
          onPullBase={() => void pullFromMaster()}
          onScrollToPanel={scrollToPanel}
          onRefreshHistory={() =>
            void run(async () => {
              if (!repoPath) return
              await refreshData(repoPath)
            })
          }
        />

        <div className="tool-strip" role="toolbar" aria-label="View and summary">
          <div className="tool-strip__tabs">
            <button
              type="button"
              className={activeTab === 'workspace' ? 'tool-tab is-active' : 'tool-tab'}
              onClick={() => setActiveTab('workspace')}
            >
              <FaIcon name="table-columns" className="tool-tab__ico" />
              Workspace
            </button>
            <button
              type="button"
              className={activeTab === 'history' ? 'tool-tab is-active' : 'tool-tab'}
              onClick={() => setActiveTab('history')}
            >
              <FaIcon name="clock-rotate-left" className="tool-tab__ico" />
              History
            </button>
            <button
              type="button"
              className={activeTab === 'search' ? 'tool-tab is-active' : 'tool-tab'}
              onClick={() => setActiveTab('search')}
            >
              <FaIcon name="magnifying-glass" className="tool-tab__ico" />
              Search
            </button>
            <button
              type="button"
              className={activeTab === 'languages' ? 'tool-tab is-active' : 'tool-tab'}
              onClick={() => setActiveTab('languages')}
            >
              <FaIcon name="layer-group" className="tool-tab__ico" />
              Languages
            </button>
            <button
              type="button"
              className={activeTab === 'issues' ? 'tool-tab is-active' : 'tool-tab'}
              onClick={() => setActiveTab('issues')}
            >
              <FaIcon name="triangle-exclamation" className="tool-tab__ico" />
              Issues
            </button>
          </div>
          <div className="tool-strip__stats">
            <span className="stat-pill">
              <FaIcon name="file-lines" className="stat-pill__ico" />Δ {files.length}
            </span>
            <span className="stat-pill">
              <FaIcon name="check-double" className="stat-pill__ico" />
              Sel {selectedFiles.length}
            </span>
            <span className="stat-pill">
              <FaIcon name="list-ul" className="stat-pill__ico" />
              Log {history.length}
            </span>
            <span className="stat-pill" title="Last project search (tracked files)">
              <FaIcon name="magnifying-glass" className="stat-pill__ico" />
              Hits {searchHits.length}
            </span>
            <span className="stat-pill" title="Distinct languages (tracked files, by extension)">
              <FaIcon name="layer-group" className="stat-pill__ico" />
              Langs {langStats?.languageCount ?? '—'}
            </span>
            <span className="stat-pill" title="Pattern scan hits (Issues tab)">
              <FaIcon name="triangle-exclamation" className="stat-pill__ico" />
              Issues {issues.length}
            </span>
          </div>
        </div>

        <div className="status-bar" role="status">
          <span className="status-bar__msg truncate" title={statusMessage}>
            {statusMessage}
          </span>
          {errorMessage ? (
            <span className="status-bar__err truncate" title={errorMessage}>
              {errorMessage}
            </span>
          ) : null}
        </div>

        <AppLoadingBar active={busy} />
      </header>

      <NoticeSidebar statusMessage={statusMessage} errorMessage={errorMessage} />

      <main className="main-workspace">
      {activeTab === 'search' ? (
        <section className="card card--repo-search" id="panel-search">
          <h2>
            <FaIcon name="magnifying-glass" className="working-tree__title-ico" />
            Search project
          </h2>
          <div className="repo-search__bar">
            <input
              id="repo-search-input"
              type="search"
              className="repo-search__input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runProjectSearch()
              }}
              placeholder="e.g. function name, error string, config key…"
              disabled={busy || !repoPath}
              autoComplete="off"
            />
            <button type="button" className="btn btn--primary" disabled={busy || !repoPath || !searchQuery.trim()} onClick={() => void runProjectSearch()}>
              <FaIcon name="magnifying-glass" className="btn-ico" />
              Search
            </button>
          </div>
          {searchTruncated ? (
            <p className="hint repo-search__warn">
              Showing the first 800 lines of output — narrow your search for a complete list.
            </p>
          ) : null}
          <div className="repo-search__results" role="list" aria-label="Search results">
            {searchHits.length === 0 ? (
              <p className="hint">{repoPath ? 'Run a search to see matching lines.' : 'Open a repository first.'}</p>
            ) : (
              searchHits.map((hit, i) => (
                <button
                  key={`${hit.file}:${hit.line}:${i}`}
                  type="button"
                  className="repo-search__row"
                  role="listitem"
                  title="Double-click: diff this file vs master in Workspace"
                  onDoubleClick={() => {
                    void (async () => {
                      await loadDiffForPaths([hit.file])
                      setActiveTab('workspace')
                      requestAnimationFrame(() => {
                        document.querySelector('.file-diff-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                      })
                    })()
                  }}
                >
                  <span className="repo-search__loc">
                    <span className="repo-search__file truncate">{hit.file}</span>
                    <span className="repo-search__line">:{hit.line}</span>
                  </span>
                  <span className="repo-search__text truncate">{hit.text}</span>
                </button>
              ))
            )}
          </div>
        </section>
      ) : activeTab === 'languages' ? (
        <section className="card card--repo-lang repo-lang--ui" id="panel-languages">
          <h2 className="repo-lang__title">
            <FaIcon name="layer-group" className="working-tree__title-ico" />
            Languages
          </h2>
          <div className="repo-lang__summary" role="status">
            {repoPath && langStats ? (
              <>
                <span className="repo-lang__metric">
                  <strong>{langStats.languageCount}</strong> languages
                </span>
                <span className="repo-lang__metric">
                  <strong>{langStats.totalTrackedFiles}</strong> tracked files
                </span>
              </>
            ) : (
              <span className="hint">{repoPath ? 'Loading…' : 'Open a repository to see language breakdown.'}</span>
            )}
          </div>
          <div className="repo-lang__grid-wrap">
            {!repoPath || !langStats ? (
              <p className="hint repo-lang__empty">{repoPath ? 'Loading…' : 'Open a repository first.'}</p>
            ) : (
              <ul className="repo-lang__grid" aria-label="Languages by file count">
                {langStats.byLanguage.map((row) => {
                  const pct =
                    langStats.totalTrackedFiles > 0
                      ? Math.round((row.fileCount / langStats.totalTrackedFiles) * 1000) / 10
                      : 0
                  const visual = getRepoLanguageVisual(row.language)
                  const barW = Math.min(100, Math.max(0, pct))
                  return (
                    <li
                      key={row.language}
                      className="repo-lang__tile"
                      style={repoLangRowStyle(visual.accent)}
                      title={`${row.language}: ${row.fileCount} files (${pct}%)`}
                    >
                      <div className="repo-lang__sq" aria-hidden>
                        <RepoLanguageIcon language={row.language} className="repo-lang__ico--sm" />
                      </div>
                      <div className="repo-lang__tile-main">
                        <span className="repo-lang__tile-name truncate">{row.language}</span>
                        <span className="repo-lang__tile-nums">
                          <span className="repo-lang__tile-files">{row.fileCount}</span>
                          <span className="repo-lang__tile-sep">·</span>
                          <span className="repo-lang__tile-pct">{pct}%</span>
                        </span>
                        <div className="repo-lang__micro-bar" aria-hidden>
                          <div className="repo-lang__micro-bar-fill" style={{ width: `${barW}%` }} />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      ) : activeTab === 'issues' ? (
        <section className="card card--repo-issues" id="panel-issues">
          <h2 className="repo-issues__heading">
            <FaIcon name="triangle-exclamation" className="working-tree__title-ico" />
            Issues
          </h2>
          <div className="repo-issues__toolbar">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy || !repoPath || issues.length === 0}
              onClick={() =>
                void run(async () => {
                  const summary = buildIssuesScanSummary(issues)
                  const res = await requireGit().aiIssueInsights(summary)
                  setAiInsights(res)
                  if (res.ok) {
                    setStatusMessage('AI summary ready.')
                  } else if (res.reason === 'no_api_key') {
                    setStatusMessage('Set GITMOM_OPENAI_KEY or OPENAI_API_KEY (optional) for AI summary.')
                  } else {
                    setStatusMessage('AI summary failed — see panel.')
                  }
                })
              }
            >
              <FaIcon name="wand-magic-sparkles" className="btn-ico" />
              AI summary
            </button>
          </div>
          <div className="repo-issues__split">
            <div className="repo-issues__list-col">
              {!repoPath || !issuesScan ? (
                <p className="hint">{repoPath ? 'Scanning…' : 'Open a repository first.'}</p>
              ) : issues.length === 0 ? (
                <p className="hint">No matches for common patterns (TODO, FIXME, debugger, eslint-disable, eval, …).</p>
              ) : (
                <ul className="repo-issues__list" aria-label="Code issues">
                  {issues.map((issue) => (
                    <li key={issue.id}>
                      <button
                        type="button"
                        className={`repo-issues__list-item ${selectedIssueId === issue.id ? 'is-active' : ''}`}
                        onClick={() => setSelectedIssueId(issue.id)}
                      >
                        <span className={`repo-issues__badge repo-issues__badge--${issue.severity}`}>{issue.severity}</span>
                        <span className="repo-issues__list-text">
                          <span className="repo-issues__list-cat truncate">{issue.category}</span>
                          <span className="repo-issues__list-loc truncate">
                            {issue.file}:{issue.line}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {issuesScan?.truncated ? (
                <p className="hint repo-issues__trunc">Showing first 500 lines — refine patterns in code to reduce noise.</p>
              ) : null}
            </div>
            <div className="repo-issues__detail-col">
              {aiInsights ? (
                <div className="repo-issues__ai-box">
                  <h3 className="repo-issues__detail-title">AI summary</h3>
                  {aiInsights.ok ? (
                    <pre className="repo-issues__ai-pre">{aiInsights.text}</pre>
                  ) : aiInsights.reason === 'no_api_key' ? (
                    <p className="hint">
                      Add environment variable <code className="repo-issues__code">GITMOM_OPENAI_KEY</code> or{' '}
                      <code className="repo-issues__code">OPENAI_API_KEY</code> before starting GitMom, then use <strong>AI summary</strong>{' '}
                      again.
                    </p>
                  ) : (
                    <p className="repo-issues__err">{aiInsights.message}</p>
                  )}
                </div>
              ) : null}
              {selectedIssue ? (
                <div className="repo-issues__detail">
                  <h3 className="repo-issues__detail-title">Issue detail</h3>
                  <p className="repo-issues__detail-meta">
                    <span className={`repo-issues__badge repo-issues__badge--${selectedIssue.severity}`}>
                      {selectedIssue.severity}
                    </span>
                    <span className="repo-issues__detail-cat">{selectedIssue.category}</span>
                  </p>
                  <p className="repo-issues__detail-path">
                    <strong>{selectedIssue.file}</strong>
                    <span className="repo-issues__detail-line">:{selectedIssue.line}</span>
                  </p>
                  <pre className="repo-issues__line-pre">{selectedIssue.text}</pre>
                  <div className="repo-issues__detail-actions">
                    <button
                      type="button"
                      className="btn btn--ghost-tiny"
                      onClick={() => {
                        void navigator.clipboard.writeText(selectedIssue.text)
                        setStatusMessage('Line copied.')
                      }}
                    >
                      <FaIcon name="copy" className="btn-ico" />
                      Copy line
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost-tiny"
                      onClick={() => {
                        void loadDiffForPaths([selectedIssue.file])
                        setActiveTab('workspace')
                        requestAnimationFrame(() => {
                          document.querySelector('.file-diff-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                        })
                      }}
                    >
                      <FaIcon name="code" className="btn-ico" />
                      Diff vs master
                    </button>
                  </div>
                </div>
              ) : (
                <div className="repo-issues__placeholder">
                  <p className="hint">
                    {issues.length === 0 ? '—' : 'Click an issue in the list for the full line, copy, and diff.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : activeTab === 'workspace' ? (
        <>
          <section className="card card--working-tree" id="panel-files">
            <div className="working-tree__head">
              <h2 className="working-tree__title">
                <FaIcon name="clone" className="working-tree__title-ico" />
                Working tree
              </h2>
            </div>

            <div className="working-tree__actions-row" role="toolbar" aria-label="Working tree actions">
              <div className="working-tree__action-group">
                <span className="working-tree__toolbar-label">Selection</span>
                <div className="working-tree__toolbar-btns">
                  <button type="button" disabled={busy || !repoPath || files.length === 0} onClick={selectAllFiles}>
                    <FaIcon name="list-check" className="btn-ico" />
                    All
                  </button>
                  <button type="button" disabled={busy || selectedFiles.length === 0} onClick={clearFileSelection}>
                    <FaIcon name="xmark" className="btn-ico" />
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={busy || !repoPath || selectedFiles.length === 0}
                    onClick={() => void stageSelectedFiles()}
                  >
                    <FaIcon name="plus" className="btn-ico" />
                    Stage
                  </button>
                  <button
                    type="button"
                    disabled={busy || !repoPath || selectedFiles.length === 0}
                    onClick={() => void unstageSelectedFiles()}
                  >
                    <FaIcon name="minus" className="btn-ico" />
                    Unstage
                  </button>
                </div>
              </div>
              <span className="working-tree__actions-sep" aria-hidden />
              <div className="working-tree__action-group">
                <span className="working-tree__toolbar-label">View code diff</span>
                <div className="working-tree__diff-btns">
                  <button
                    type="button"
                    className="btn-diff btn-diff--primary"
                    disabled={busy || !repoPath || selectedFiles.length === 0}
                    title="Working tree vs master"
                    onClick={() => void loadDiff('vs-master')}
                  >
                    <FaIcon name="code" className="btn-ico" />
                    Diff vs master
                  </button>
                  <button
                    type="button"
                    className="btn-diff"
                    disabled={busy || !repoPath || selectedFiles.length === 0}
                    title="Opens Notepad++ with base (master) vs working copy — then Plugins → Compare → Compare"
                    onClick={() => void openNotepadCompare()}
                  >
                    <FaIcon name="file-lines" className="btn-ico" />
                    N++ Compare
                  </button>
                </div>
              </div>
            </div>

            <p className="hint working-tree__count">
              Selected <strong>{selectedFiles.length}</strong> / {files.length} changed path(s)
            </p>

            <div className="file-list">
              {files.length === 0 ? <p className="hint">No local changes — working tree is clean.</p> : null}
              {files.map((f) => {
                const checked = selectedFiles.includes(f.file)
                return (
                  <label
                    key={`${f.status}-${f.file}`}
                    className="file-item"
                    title="Double-click: diff vs master. Shift+double-click: Notepad++ Compare."
                    onDoubleClick={(e) => {
                      e.preventDefault()
                      if (e.shiftKey) void openNotepadCompare(f.file)
                      else void loadDiff('vs-master', [f.file])
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={(e) => toggleFile(f.file, e.target.checked)} />
                    <span className="status">{f.status || '--'}</span>
                    <span className="file-item__path truncate">{f.file}</span>
                  </label>
                )
              })}
            </div>

            <div className="file-diff-panel">
              <div className="file-diff-panel__head">
                <h3 className="file-diff-panel__title">{diffPanelTitle}</h3>
                <div className="file-diff-panel__actions">
                  <button type="button" className="btn btn--ghost-tiny" disabled={!compareOutput.trim()} onClick={() => void copyDiffToClipboard()}>
                    <FaIcon name="copy" className="btn-ico" />
                    Copy
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost-tiny"
                    disabled={!compareOutput.trim()}
                    onClick={() => setDiffModalOpen(true)}
                  >
                    <FaIcon name="expand" className="btn-ico" />
                    Full
                  </button>
                </div>
              </div>
              <DiffViewer
                text={compareOutput}
                className="file-diff-panel__viewer"
                emptyHint="Select files, then Show diff vs master."
              />
            </div>
          </section>

          <section className="grid2">
            <div className="card" id="panel-branches">
              <h2>Branches</h2>
              <div className="branch-panel-simple">
                <p className="branch-current">
                  Current branch:{' '}
                  <strong className="branch-current__name">{repoInfo?.currentBranch || '—'}</strong>
                </p>
                <label className="field-label" htmlFor="branch-select-main">
                  Select branch
                </label>
                <select
                  id="branch-select-main"
                  className="branch-select"
                  value={branchInput}
                  onChange={(e) => setBranchInput(e.target.value)}
                  disabled={busy || !repoPath}
                >
                  <option value="">Select branch…</option>
                  {branchSelectOptions.map((row) => (
                    <option key={row.key} value={row.display}>
                      {row.display}
                      {row.isCurrent ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
                <div className="row branch-panel-simple__actions">
                  <button type="button" disabled={busy || !repoPath} onClick={() => void fetchLatest()}>
                    Fetch
                  </button>
                  <button type="button" disabled={busy || !repoPath} onClick={() => void pullFromMaster()}>
                    Pull
                  </button>
                  <button
                    type="button"
                    disabled={busy || !repoPath || !branchInput.trim()}
                    onClick={() => void mergeBranch()}
                  >
                    Merge
                  </button>
                  <button
                    type="button"
                    disabled={busy || !repoPath || !branchInput.trim()}
                    onClick={() => void switchBranch()}
                  >
                    Switch
                  </button>
                </div>
                <label className="field-label" htmlFor="new-branch-name">
                  New branch name
                </label>
                <div className="row">
                  <input
                    id="new-branch-name"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="e.g. feature/my-task"
                    disabled={busy || !repoPath}
                  />
                  <button type="button" disabled={busy || !repoPath || !newBranchName.trim()} onClick={() => void createBranch()}>
                    Create
                  </button>
                </div>
                <div className="branch-panel__staged" aria-label="Staged diff summary">
                  <h3 className="branch-panel__staged-title">Staged changes (stat)</h3>
                  <pre className="branch-panel__staged-pre">{preview}</pre>
                </div>
              </div>
            </div>

            <div className="card card--commit-push" id="panel-commit">
              <header className="commit-push__header">
                <div>
                  <h2 className="commit-push__title">
                    <FaIcon name="comment-dots" className="commit-push__title-ico" />
                    Commit &amp; push
                  </h2>
                  <p className="commit-push__subtitle">Commit, then push to remote</p>
                </div>
              </header>

              <section className="commit-push__section" aria-labelledby="commit-msg-heading">
                <h3 className="commit-push__section-title" id="commit-msg-heading">
                  Message
                </h3>
                <div className="commit-push__grid2">
                  <div className="commit-push__field">
                    <label className="field-label" htmlFor="commit-req-type">
                      Type
                    </label>
                    <select
                      id="commit-req-type"
                      className="commit-push__control"
                      value={requirementType}
                      onChange={(e) => setRequirementType(e.target.value as RequirementType)}
                    >
                      <option>Bugfix</option>
                      <option>Feature</option>
                      <option>Refactor</option>
                      <option>Chore</option>
                      <option>Docs</option>
                      <option>Test</option>
                    </select>
                  </div>
                  <div className="commit-push__field">
                    <label className="field-label" htmlFor="commit-ticket">
                      Ticket ID
                    </label>
                    <input
                      id="commit-ticket"
                      className="commit-push__control"
                      value={ticketId}
                      onChange={(e) => setTicketId(e.target.value)}
                      placeholder="Optional (e.g. JIRA-123)"
                    />
                  </div>
                </div>
                <label className="field-label" htmlFor="commit-body">
                  Description
                </label>
                <textarea
                  id="commit-body"
                  className="commit-push__message"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Summarize what changed and why…"
                  rows={4}
                />
                <div className="commit-push__toolbar">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy || !repoPath}
                    onClick={suggestAiMessage}
                  >
                    <FaIcon name="wand-magic-sparkles" className="btn-ico" />
                    AI suggest
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy || !repoPath}
                    onClick={() => void showConflictHelp()}
                  >
                    <FaIcon name="triangle-exclamation" className="btn-ico" />
                    Conflicts
                  </button>
                </div>
              </section>

              <section className="commit-push__section commit-push__section--preview" aria-label="Final commit message">
                <h3 className="commit-push__section-title">Final line (sent to Git)</h3>
                <div className="commit-push__preview-box" title={finalCommitMessage}>
                  {finalCommitMessage}
                </div>
              </section>

              <section className="commit-push__section commit-push__section--inline">
                <label className="commit-push__check">
                  <input type="checkbox" checked={stageAll} onChange={(e) => setStageAll(e.target.checked)} />
                  <span>
                    <strong>Stage all</strong> — run <code className="commit-push__code">git add .</code> before commit
                  </span>
                </label>
              </section>

              <div className="commit-push__primary-action">
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy || !repoPath}
                  onClick={() => void commitChanges()}
                >
                  <FaIcon name="check" className="btn-ico" />
                  Commit
                </button>
              </div>

              <div className="commit-push__divider" role="separator" />

              <section className="commit-push__section" aria-labelledby="push-heading">
                <h3 className="commit-push__section-title" id="push-heading">
                  Push to remote
                </h3>
                <div className="commit-push__field">
                  <label className="field-label" htmlFor="push-target-branch">
                    Remote branch
                  </label>
                  <input
                    id="push-target-branch"
                    className="commit-push__control commit-push__control--mono"
                    value={pushTarget}
                    onChange={(e) => setPushTarget(e.target.value)}
                    placeholder="Usually your current branch"
                  />
                </div>
                <label className="commit-push__check">
                  <input type="checkbox" checked={pushToMaster} onChange={(e) => setPushToMaster(e.target.checked)} />
                  <span>Also push to default branch (master / main)</span>
                </label>
                <div className="commit-push__push-row">
                  <button
                    type="button"
                    className="btn btn--push"
                    disabled={busy || !repoPath}
                    onClick={() => void pushChanges()}
                  >
                    <FaIcon name="cloud-arrow-up" className="btn-ico" />
                    Push
                  </button>
                </div>
              </section>
            </div>
          </section>
        </>
      ) : (
        <section className="card" id="panel-history">
          <h2>Commit history</h2>
          <div className="row">
            <button
              disabled={busy || !repoPath}
              onClick={() =>
                void run(async () => {
                  if (!repoPath) return
                  await refreshData(repoPath)
                })
              }
            >
              Refresh History
            </button>
          </div>
          <div className="history">
            {history.map((item) => (
              <div key={item.hash} className="commit">
                <p className="commit__subject truncate" title={`${item.hash} ${item.subject}`}>
                  <strong>{item.hash}</strong> {item.subject}
                </p>
                <p className="meta">
                  {item.author} - {item.date}
                </p>
                <button disabled={busy || !repoPath} onClick={() => void revertSelectedCommit(item.hash)}>
                  Revert Commit
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      </main>

      {aiModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>AI Assistant</h2>
            <p>Create a fast draft and apply it to message input.</p>
            <div className="row">
              <button
                onClick={() => {
                  suggestAiMessage()
                  setAiModalOpen(false)
                }}
              >
                Generate for current changes
              </button>
              <button onClick={() => setAiModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {diffModalOpen ? (
        <div className="modal-backdrop modal-backdrop--diff" onClick={() => setDiffModalOpen(false)}>
          <div
            className="modal modal--diff"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="diff-modal-title"
          >
            <div className="modal--diff__head">
              <h2 id="diff-modal-title">{diffPanelTitle}</h2>
              <div className="modal--diff__actions">
                <button type="button" onClick={() => void copyDiffToClipboard()}>
                  Copy
                </button>
                <button type="button" onClick={() => setDiffModalOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <DiffViewer text={compareOutput} className="modal--diff__body" emptyHint="No diff content." />
          </div>
        </div>
      ) : null}

      {pushConfirmOpen ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Confirm Push to Protected Branch</h2>
            <p>You are about to push to `master/main`. Please confirm this operation.</p>
            <p>
              Target Branch: <strong>{(pushTarget.trim() || repoInfo?.currentBranch || '-').trim()}</strong>
            </p>
            <p>
              Also push to master/main: <strong>{pushToMaster ? 'Yes' : 'No'}</strong>
            </p>
            <div className="row">
              <button
                disabled={busy}
                onClick={() => {
                  setPushConfirmOpen(false)
                  void performPush()
                }}
              >
                Confirm Push
              </button>
              <button disabled={busy} onClick={() => setPushConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

