const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('gitTool', {
  /** Low-level IPC (also used if an older shell lacks a specific method). */
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  pickRepository: () => ipcRenderer.invoke('repo:pick'),
  loadRecentRepositories: () => ipcRenderer.invoke('repo:recent'),
  openRecentRepository: (folderPath) => ipcRenderer.invoke('repo:openRecent', folderPath),

  getRepoInfo: (repoPath) => ipcRenderer.invoke('git:info', repoPath),
  getStatus: (repoPath) => ipcRenderer.invoke('git:status', repoPath),
  getHistory: (repoPath) => ipcRenderer.invoke('git:history', repoPath),
  searchRepo: (repoPath, query) => ipcRenderer.invoke('git:search', repoPath, query),
  getLanguageStats: (repoPath) => ipcRenderer.invoke('git:languageStats', repoPath),
  scanCodeIssues: (repoPath) => ipcRenderer.invoke('git:scanIssues', repoPath),
  aiIssueInsights: (summaryText) => ipcRenderer.invoke('git:aiIssueInsights', summaryText),
  fetchUpdates: (repoPath) => ipcRenderer.invoke('git:fetch', repoPath),

  switchBranch: (repoPath, branchName) => ipcRenderer.invoke('git:switchBranch', repoPath, branchName),
  createBranch: (repoPath, branchName) => ipcRenderer.invoke('git:createBranch', repoPath, branchName),
  pullMaster: (repoPath, masterBranch) => ipcRenderer.invoke('git:pullMaster', repoPath, masterBranch),
  stageFiles: (repoPath, files) => ipcRenderer.invoke('git:stageFiles', repoPath, files),
  compareFilesWithBase: (repoPath, baseRef, files) =>
    ipcRenderer.invoke('git:compareFilesWithBase', repoPath, baseRef, files),
  diffWorkingFiles: (repoPath, mode, baseRef, files) =>
    ipcRenderer.invoke('git:diffWorkingFiles', repoPath, mode, baseRef, files),
  openNotepadCompare: (repoPath, baseRef, relPath) =>
    ipcRenderer.invoke('git:openNotepadCompare', repoPath, baseRef, relPath),
  unstageFiles: (repoPath, files) => ipcRenderer.invoke('git:unstageFiles', repoPath, files),

  commit: (repoPath, commitMessage, options) =>
    ipcRenderer.invoke('git:commit', repoPath, commitMessage, options),
  push: (repoPath, branchName) => ipcRenderer.invoke('git:push', repoPath, branchName),
  merge: (repoPath, sourceBranch) => ipcRenderer.invoke('git:merge', repoPath, sourceBranch),
  revertCommit: (repoPath, commitHash) => ipcRenderer.invoke('git:revertCommit', repoPath, commitHash),
  resolveConflictsHint: (repoPath) => ipcRenderer.invoke('git:resolveConflictsHint', repoPath),
})
