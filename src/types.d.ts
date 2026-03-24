export type RepoInfo = {
  currentBranch: string
  branches: string[]
}

export type StatusFile = {
  status: string
  file: string
}

export type CommitItem = {
  hash: string
  author: string
  date: string
  subject: string
}

export type RepoSearchHit = {
  file: string
  line: number
  text: string
}

export type RepoSearchResult = {
  hits: RepoSearchHit[]
  truncated: boolean
}

export type RepoLanguageRow = {
  language: string
  fileCount: number
}

export type RepoLanguageStats = {
  totalTrackedFiles: number
  languageCount: number
  byLanguage: RepoLanguageRow[]
}

export type CodeIssueSeverity = 'high' | 'medium' | 'low' | 'info'

export type CodeIssue = {
  id: string
  category: string
  severity: CodeIssueSeverity
  file: string
  line: number
  text: string
}

export type ScanCodeIssuesResult = {
  issues: CodeIssue[]
  truncated: boolean
}

export type AiIssueInsightsResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'no_api_key' }
  | { ok: false; reason: 'api_error'; message: string }

declare global {
  interface Window {
    /** Present only when loaded inside Electron with `preload.cjs`. */
    gitTool?: {
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
  }
}

export {}
