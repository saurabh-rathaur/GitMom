import type {
  AiIssueInsightsResult,
  CommitItem,
  RepoInfo,
  RepoLanguageStats,
  RepoSearchResult,
  ScanCodeIssuesResult,
  StatusFile,
} from './types'

/** Same shape as `window.gitTool` from `electron/preload.cjs` */
export type GitToolApi = {
  pickRepository: () => Promise<string | null>
  loadRecentRepositories: () => Promise<string[]>
  openRecentRepository: (folderPath: string) => Promise<string>
  getRepoInfo: (repoPath: string) => Promise<RepoInfo>
  getStatus: (repoPath: string) => Promise<{ files: StatusFile[]; preview: string }>
  getHistory: (repoPath: string) => Promise<CommitItem[]>
  searchRepo: (repoPath: string, query: string) => Promise<RepoSearchResult>
  getLanguageStats: (repoPath: string) => Promise<RepoLanguageStats>
  scanCodeIssues: (repoPath: string) => Promise<ScanCodeIssuesResult>
  aiIssueInsights: (summaryText: string) => Promise<AiIssueInsightsResult>
  fetchUpdates: (repoPath: string) => Promise<string>
  switchBranch: (repoPath: string, branchName: string) => Promise<RepoInfo>
  createBranch: (repoPath: string, branchName: string) => Promise<RepoInfo>
  pullMaster: (repoPath: string, masterBranch?: string) => Promise<string>
  stageFiles: (repoPath: string, files: string[]) => Promise<string>
  compareFilesWithBase: (repoPath: string, baseRef: string, files: string[]) => Promise<string>
  diffWorkingFiles: (
    repoPath: string,
    mode: 'vs-master',
    baseRef: string,
    files: string[]
  ) => Promise<string>
  openNotepadCompare: (repoPath: string, baseRef: string, relPath: string) => Promise<string>
  unstageFiles: (repoPath: string, files: string[]) => Promise<string>
  commit: (
    repoPath: string,
    commitMessage: string,
    options?: { stageAll?: boolean }
  ) => Promise<string>
  push: (repoPath: string, branchName: string) => Promise<string>
  merge: (repoPath: string, sourceBranch: string) => Promise<string>
  revertCommit: (repoPath: string, commitHash: string) => Promise<string>
  resolveConflictsHint: (repoPath: string) => Promise<string>
}

export const MISSING_GIT_TOOL_MESSAGE =
  'GitMom must run inside the Electron desktop window. From the project folder run: npm run dev — use the window that opens, not http://localhost:5173 in a browser. (npm run dev:web is browser-only and has no Git bridge.)'

type RawGitTool = Partial<GitToolApi> & {
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
}

const OUTDATED_SHELL_SEARCH =
  'Search needs the latest desktop bridge. Quit every GitMom/Electron window (preload does not hot-reload), then run npm run dev again from the GitMom project folder.'

const OUTDATED_SHELL_LANG =
  'The Languages view needs the latest desktop bridge. Quit every GitMom/Electron window, then run npm run dev again from the GitMom project folder.'

const OUTDATED_SHELL_ISSUES =
  'The Issues view needs the latest desktop bridge. Quit every GitMom/Electron window, then run npm run dev again from the GitMom project folder.'

/** Returns the preload bridge, or `undefined` in a normal browser / wrong entry. */
export function getGitTool(): GitToolApi | undefined {
  if (typeof window === 'undefined') return undefined
  const raw = (window as unknown as { gitTool?: RawGitTool }).gitTool
  if (!raw || typeof raw.pickRepository !== 'function') return undefined

  const invoke = typeof raw.invoke === 'function' ? raw.invoke.bind(raw) : undefined

  const searchRepo: GitToolApi['searchRepo'] =
    typeof raw.searchRepo === 'function'
      ? (raw.searchRepo as GitToolApi['searchRepo']).bind(raw)
      : invoke
        ? (repoPath, query) => invoke('git:search', repoPath, query) as Promise<RepoSearchResult>
        : async () => {
            throw new Error(OUTDATED_SHELL_SEARCH)
          }

  const getLanguageStats: GitToolApi['getLanguageStats'] =
    typeof raw.getLanguageStats === 'function'
      ? (raw.getLanguageStats as GitToolApi['getLanguageStats']).bind(raw)
      : invoke
        ? (repoPath) => invoke('git:languageStats', repoPath) as Promise<RepoLanguageStats>
        : async () => {
            throw new Error(OUTDATED_SHELL_LANG)
          }

  const scanCodeIssues: GitToolApi['scanCodeIssues'] =
    typeof raw.scanCodeIssues === 'function'
      ? (raw.scanCodeIssues as GitToolApi['scanCodeIssues']).bind(raw)
      : invoke
        ? (repoPath) => invoke('git:scanIssues', repoPath) as Promise<ScanCodeIssuesResult>
        : async () => {
            throw new Error(OUTDATED_SHELL_ISSUES)
          }

  const aiIssueInsights: GitToolApi['aiIssueInsights'] =
    typeof raw.aiIssueInsights === 'function'
      ? (raw.aiIssueInsights as GitToolApi['aiIssueInsights']).bind(raw)
      : invoke
        ? (summaryText) => invoke('git:aiIssueInsights', summaryText) as Promise<AiIssueInsightsResult>
        : async () => {
            throw new Error(OUTDATED_SHELL_ISSUES)
          }

  return { ...(raw as GitToolApi), searchRepo, getLanguageStats, scanCodeIssues, aiIssueInsights }
}

export function requireGit(): GitToolApi {
  const g = getGitTool()
  if (!g) {
    throw new Error(MISSING_GIT_TOOL_MESSAGE)
  }
  return g
}
