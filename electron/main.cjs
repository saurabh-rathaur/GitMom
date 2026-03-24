const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const RECENT_LIMIT = 10
const APP_TITLE = 'GitMom v1.1'

function recentFilePath() {
  return path.join(app.getPath('userData'), 'recent-repos.json')
}

function readRecentRepos() {
  try {
    const filePath = recentFilePath()
    if (!fs.existsSync(filePath)) return []
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return Array.isArray(data) ? data.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

function writeRecentRepos(repos) {
  const unique = [...new Set(repos)].slice(0, RECENT_LIMIT)
  fs.writeFileSync(recentFilePath(), JSON.stringify(unique, null, 2), 'utf8')
  return unique
}

function addRecentRepo(repoPath) {
  const current = readRecentRepos().filter((r) => r !== repoPath)
  return writeRecentRepos([repoPath, ...current])
}

function runGit(repoPath, args) {
  const result = spawnSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
    shell: false,
  })
  if (result.error) {
    throw new Error(result.error.message)
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Git command failed').trim())
  }
  return (result.stdout || '').trim()
}

/**
 * Like runGit but allows extra exit codes (e.g. some Git builds use 1 for "diff had changes").
 * Still throws on real failures.
 */
function runGitAllowExit(repoPath, args, allowedCodes = [0, 1]) {
  const result = spawnSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
    shell: false,
  })
  if (result.error) {
    throw new Error(result.error.message)
  }
  const code = result.status === null ? -1 : result.status
  if (!allowedCodes.includes(code)) {
    throw new Error((result.stderr || result.stdout || 'Git command failed').trim())
  }
  return (result.stdout || '').trim()
}

function isGitRepo(folderPath) {
  try {
    runGit(folderPath, ['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}

function getRepoInfo(repoPath) {
  const currentBranch = runGit(repoPath, ['branch', '--show-current']) || '(detached HEAD)'
  const branchesRaw = runGit(repoPath, ['branch', '--all', '--no-color'])
  const branches = branchesRaw
    .split(/\r?\n/)
    .map((v) => v.replace('*', '').trim())
    .filter(Boolean)
  return { currentBranch, branches }
}

/** Git-quoted porcelain path → plain path (unquoted paths unchanged; avoids mangling first character). */
function dequoteGitPath(quoted) {
  let s = String(quoted || '').trimEnd()
  if (!s) return ''
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s
      .slice(1, -1)
      .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\([\\"])/g, '$1')
  }
  return s
}

/** Map porcelain v1 line → { status, file }. Uses regex + v1 flag (not slice(3)) so paths stay exact. */
function parsePorcelainV1Line(line) {
  const trimmed = String(line || '').replace(/\r$/, '')
  if (!trimmed || trimmed.startsWith('#')) return null
  const m = trimmed.match(/^(.{2})(\s+)(.+)$/)
  if (!m) return null
  const status = m[1]
  let rest = dequoteGitPath(m[3].trim())
  if (!rest) return null
  if (rest.includes(' -> ')) {
    rest = dequoteGitPath(rest.split(' -> ').pop().trim())
  } else if (rest.includes('\t')) {
    const parts = rest.split('\t').filter(Boolean)
    if (parts.length >= 2) rest = dequoteGitPath(parts[parts.length - 1].trim())
  }
  return { status, file: rest }
}

/**
 * Porcelain lines often start with a space (e.g. ` M file`). `runGit()` uses .trim() which
 * strips that leading space and breaks parsing — never trim the start of status output.
 */
function readGitPorcelain(repoPath) {
  const attempts = [
    ['-c', 'core.quotepath=false', 'status', '--porcelain=v1'],
    ['status', '--porcelain=v1'],
    ['status', '--porcelain'],
  ]
  let lastErr = ''
  for (const args of attempts) {
    const result = spawnSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      shell: false,
    })
    if (result.error) {
      lastErr = result.error.message
      continue
    }
    if ((result.status || 0) !== 0) {
      lastErr = (result.stderr || result.stdout || 'git status failed').trim()
      continue
    }
    const raw = String(result.stdout || '').replace(/^\uFEFF/, '')
    return raw.replace(/\r?\n+$/, '')
  }
  throw new Error(lastErr || 'git status failed')
}

function getStatus(repoPath) {
  const porcelain = readGitPorcelain(repoPath)
  const files = porcelain
    .split(/\r?\n/)
    .map((line) => parsePorcelainV1Line(line.replace(/^\uFEFF/, '')))
    .filter((row) => row && row.file)
  const preview = runGit(repoPath, ['diff', '--staged', '--stat']) || 'No staged changes.'
  return { files, preview }
}

function stageFiles(repoPath, files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('At least one file must be selected.')
  }
  const normalized = files
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  if (normalized.length === 0) {
    throw new Error('At least one valid file must be selected.')
  }
  runGit(repoPath, ['add', '--', ...normalized])
  return `Staged ${normalized.length} file(s).`
}

function normalizeFilePaths(files) {
  const normalized = (Array.isArray(files) ? files : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  if (normalized.length === 0) {
    throw new Error('At least one file must be selected.')
  }
  return normalized
}

function compareFilesWithBase(repoPath, baseRef, files) {
  const targetBase = String(baseRef || '').trim() || 'master'
  const normalized = normalizeFilePaths(files)

  const sections = normalized.map((file) => {
    const output = runGitAllowExit(repoPath, ['diff', '--no-color', '-U5', `${targetBase}...HEAD`, '--', file])
    return `### ${file}\n${output || '(No differences found)'}`.trim()
  })
  return sections.join('\n\n')
}

function isPathTracked(repoPath, relPath) {
  const r = spawnSync('git', ['ls-files', '--', relPath], {
    cwd: repoPath,
    encoding: 'utf8',
    shell: false,
  })
  return r.status === 0 && Boolean((r.stdout || '').trim())
}

/** Untracked paths: `git diff ref -- path` is empty — diff vs a real empty file (works on Windows; NUL is unreliable). */
function diffUntrackedVsEmpty(repoPath, relPath) {
  const runCombined = (args) => runGitAllowExit(repoPath, args, [0, 1])
  const workAbs = path.isAbsolute(relPath) ? relPath : path.join(repoPath, relPath)
  if (!fs.existsSync(workAbs)) return ''
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitmom-empty-'))
  const emptyFile = path.join(dir, 'empty')
  try {
    fs.writeFileSync(emptyFile, '', 'utf8')
    return runCombined(['diff', '--no-index', '--no-color', '-U5', '--', emptyFile, workAbs])
  } catch {
    return ''
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

/** First ref that exists locally; `null` if none (caller uses HEAD). */
function resolveDiffBaseRef(repoPath, preferred) {
  const candidates = [String(preferred || '').trim() || 'master', 'main', 'origin/master', 'origin/main']
  const seen = new Set()
  for (const c of candidates) {
    if (!c || seen.has(c)) continue
    seen.add(c)
    try {
      runGit(repoPath, ['rev-parse', '-q', '--verify', `${c}^{commit}`])
      return c
    } catch {
      /* try next */
    }
  }
  return null
}

/**
 * Per-path diff: working tree vs base (master/main), with untracked + rename-safe paths.
 * If diff vs base is empty but there are local edits vs HEAD, shows HEAD diff with a note.
 */
function diffWorkingFiles(repoPath, _mode, baseRef, files) {
  const paths = normalizeFilePaths(files)
  const runCombined = (args) => runGitAllowExit(repoPath, args, [0, 1])
  const resolved = resolveDiffBaseRef(repoPath, baseRef)
  const ref = resolved || 'HEAD'
  const warn = resolved
    ? ''
    : '### GitMom\nNo valid **master** / **main** / **origin/master** / **origin/main** ref in this repo — using **HEAD** as the diff base.\n\n'

  const chunks = paths.map((p) => {
    const header = (body) => (body.includes('diff --git') ? body : `### ${p}\n${body}`)

    if (isPathTracked(repoPath, p)) {
      if (!resolved) {
        const d = runCombined(['diff', '--no-color', '-U5', 'HEAD', '--', p])
        if (d) return header(d)
        return `### ${p}\n(No diff vs HEAD for this path.)\n`
      }
      const vsBase = runCombined(['diff', '--no-color', '-U5', ref, '--', p])
      if (vsBase) return header(vsBase)
      const vsHead = runCombined(['diff', '--no-color', '-U5', 'HEAD', '--', p])
      if (vsHead) {
        return `### ${p}\n(Working tree matches «${ref}»; showing changes vs **HEAD** instead.)\n${vsHead}`
      }
      return `### ${p}\n(No line diff vs «${ref}» or vs HEAD — try refreshing status.)\n`
    }

    const untracked = diffUntrackedVsEmpty(repoPath, p)
    if (untracked) return header(untracked)
    return `### ${p}\n(No in-app diff for this untracked path — use **Notepad++ Compare** in the toolbar.)\n`
  })

  const text = (warn + chunks.join('\n\n')).trim()
  return text || `(No diff output for these paths vs «${ref}».)`
}

function gitShowBlobBuffer(repoPath, objectSpec) {
  const result = spawnSync('git', ['show', objectSpec], {
    cwd: repoPath,
    encoding: 'buffer',
    maxBuffer: 50 * 1024 * 1024,
    shell: false,
  })
  if ((result.status || 0) !== 0) return null
  return result.stdout
}

function findNotepadPlusPlus() {
  const fromEnv = process.env.GITMOM_NOTEPADPP?.trim()
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv
  const bases = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ].filter(Boolean)
  for (const b of bases) {
    const exe = path.join(b, 'Notepad++', 'notepad++.exe')
    if (fs.existsSync(exe)) return exe
  }
  return null
}

function toGitPathspec(relPath) {
  return String(relPath || '').split(path.sep).join('/')
}

/**
 * Opens two temp tabs in Notepad++: base ref version vs working tree (Compare plugin: Plugins → Compare → Compare).
 */
function openNotepadCompareVsBase(repoPath, baseRef, relPath) {
  const npp = findNotepadPlusPlus()
  if (!npp) {
    throw new Error(
      'Notepad++ not found. Install it or set environment variable GITMOM_NOTEPADPP to notepad++.exe'
    )
  }
  const resolved = resolveDiffBaseRef(repoPath, baseRef) || 'HEAD'
  const spec = `${resolved}:${toGitPathspec(relPath)}`
  const workAbs = path.isAbsolute(relPath) ? relPath : path.join(repoPath, relPath)
  if (!fs.existsSync(workAbs)) {
    throw new Error(`Working tree file not found: ${relPath}`)
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitmom-npp-'))
  const safe = path.basename(relPath).replace(/[^\w.\-+@]+/g, '_') || 'file'
  const baseTmp = path.join(dir, `base-${String(resolved).replace(/[/\\]/g, '-')}-${safe}`)
  const workTmp = path.join(dir, `working-${safe}`)
  const blob = gitShowBlobBuffer(repoPath, spec)
  fs.writeFileSync(baseTmp, blob && blob.length ? blob : Buffer.alloc(0))
  fs.copyFileSync(workAbs, workTmp)
  const child = spawn(npp, ['-multiInst', '-nosession', baseTmp, workTmp], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: false,
  })
  child.unref()
  return `Notepad++: left = «${resolved}», right = working copy — run Plugins → Compare → Compare.`
}

function unstageFiles(repoPath, files) {
  const paths = normalizeFilePaths(files)
  try {
    runGit(repoPath, ['restore', '--staged', '--', ...paths])
  } catch {
    runGit(repoPath, ['reset', 'HEAD', '--', ...paths])
  }
  return `Unstaged ${paths.length} file(s).`
}

function getHistory(repoPath) {
  const raw = runGit(repoPath, ['log', '--pretty=format:%h|%an|%ad|%s', '--date=iso', '-n', '30'])
  if (!raw) return []
  return raw.split(/\r?\n/).map((line) => {
    const [hash, author, date, ...subject] = line.split('|')
    return { hash, author, date, subject: subject.join('|') }
  })
}

/** Tracked files in the working tree; `-F` = literal text (not regex). */
function searchRepoText(repoPath, rawQuery) {
  const q = String(rawQuery || '').trim()
  if (!q) {
    throw new Error('Enter text to search.')
  }
  if (q.length > 500) {
    throw new Error('Search text is too long (max 500 characters).')
  }
  const result = spawnSync(
    'git',
    ['-c', 'core.quotepath=false', 'grep', '-n', '-I', '-F', '--no-color', '-e', q, '--'],
    {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      shell: false,
    }
  )
  if (result.error) {
    throw new Error(result.error.message)
  }
  const code = result.status === null ? -1 : result.status
  if (code === 1) {
    return { hits: [], truncated: false }
  }
  if (code !== 0) {
    throw new Error((result.stderr || result.stdout || 'git grep failed').trim())
  }
  const raw = String(result.stdout || '').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const maxLines = 800
  const slice = lines.slice(0, maxLines)
  const hits = []
  for (const line of slice) {
    const m = line.match(/^(.+):(\d+):(.*)$/)
    if (m) {
      hits.push({ file: m[1], line: Number(m[2], 10), text: m[3] })
    }
  }
  return { hits, truncated: lines.length > maxLines }
}

/** Extension / basename → language label (tracked files only, via `git ls-files`). */
const EXT_TO_LANG = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.py': 'Python',
  '.pyw': 'Python',
  '.pyi': 'Python',
  '.java': 'Java',
  '.cs': 'C#',
  '.fs': 'F#',
  '.fsx': 'F#',
  '.vb': 'VB.NET',
  '.go': 'Go',
  '.rs': 'Rust',
  '.c': 'C',
  '.h': 'C/C++ header',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cxx': 'C++',
  '.hpp': 'C++',
  '.hh': 'C++',
  '.php': 'PHP',
  '.rb': 'Ruby',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.scala': 'Scala',
  '.r': 'R',
  '.dart': 'Dart',
  '.lua': 'Lua',
  '.pl': 'Perl',
  '.pm': 'Perl',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.fish': 'Shell',
  '.ps1': 'PowerShell',
  '.psm1': 'PowerShell',
  '.sql': 'SQL',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.xhtml': 'HTML',
  '.shtml': 'HTML',
  '.aspx': 'ASP.NET',
  '.ascx': 'ASP.NET',
  '.asmx': 'ASP.NET',
  '.ashx': 'ASP.NET',
  '.asax': 'ASP.NET',
  '.master': 'ASP.NET',
  '.cshtml': 'Razor',
  '.vbhtml': 'Razor',
  '.razor': 'Razor',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.less': 'Less',
  '.json': 'JSON',
  '.jsonc': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.xml': 'XML',
  '.md': 'Markdown',
  '.mdx': 'MDX',
  '.rst': 'reStructuredText',
  '.tex': 'TeX',
  '.tf': 'Terraform',
  '.hcl': 'HCL',
  '.ini': 'INI',
  '.toml': 'TOML',
  '.cfg': 'Config',
  '.conf': 'Config',
  '.properties': 'Properties',
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',
  '.svg': 'SVG',
  '.wasm': 'WebAssembly',
}

function readGitLsFiles(repoPath) {
  const result = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files'], {
    cwd: repoPath,
    encoding: 'utf8',
    shell: false,
  })
  if (result.error) {
    throw new Error(result.error.message)
  }
  if ((result.status || 0) !== 0) {
    throw new Error((result.stderr || result.stdout || 'git ls-files failed').trim())
  }
  const raw = String(result.stdout || '').replace(/^\uFEFF/, '')
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => dequoteGitPath(line.replace(/\r$/, '')))
    .filter(Boolean)
}

function languageFromPath(relPath) {
  const norm = String(relPath || '').replace(/\\/g, '/')
  const base = path.posix.basename(norm).toLowerCase()
  if (base === 'dockerfile' || /^dockerfile\./.test(base)) return 'Dockerfile'
  if (base === 'makefile' || base === 'gnumakefile') return 'Makefile'
  if (base === 'cmakelists.txt') return 'CMake'
  const ext = path.posix.extname(norm).toLowerCase()
  return EXT_TO_LANG[ext] || 'Other'
}

function getLanguageStats(repoPath) {
  const paths = readGitLsFiles(repoPath)
  const counts = new Map()
  for (const p of paths) {
    const lang = languageFromPath(p)
    counts.set(lang, (counts.get(lang) || 0) + 1)
  }
  const byLanguage = [...counts.entries()]
    .map(([language, fileCount]) => ({ language, fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount || a.language.localeCompare(b.language))
  return {
    totalTrackedFiles: paths.length,
    languageCount: counts.size,
    byLanguage,
  }
}

function parseGrepLine(line) {
  const m = String(line || '').match(/^(.+):(\d+):(.*)$/)
  if (!m) return null
  return { file: m[1], line: Number(m[2], 10), text: m[3] }
}

function runGitGrepExtended(repoPath, pattern) {
  const result = spawnSync(
    'git',
    ['-c', 'core.quotepath=false', 'grep', '-n', '-I', '-E', '--no-color', '-e', pattern, '--'],
    {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      shell: false,
    }
  )
  if (result.error) {
    throw new Error(result.error.message)
  }
  const code = result.status === null ? -1 : result.status
  if (code === 1) {
    return []
  }
  if (code !== 0) {
    throw new Error((result.stderr || result.stdout || 'git grep failed').trim())
  }
  return String(result.stdout || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean)
}

/** Pattern scan on tracked files (git grep). Same line keeps highest severity. */
function scanCodeIssues(repoPath) {
  const RULES = [
    { category: 'TODO / markers', severity: 'medium', pattern: '\\b(TODO|FIXME|HACK|XXX|WIP|BUG)\\b' },
    { category: 'Debug leftover', severity: 'low', pattern: '\\b(console\\.log|console\\.debug|debugger)\\b' },
    {
      category: 'Lint / type suppression',
      severity: 'medium',
      pattern: '(eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error)',
    },
    { category: 'Risky API', severity: 'high', pattern: '\\beval\\s*\\(' },
    { category: 'Deprecation', severity: 'low', pattern: '(@deprecated|\\bDEPRECATED\\b)' },
  ]
  const sevRank = { high: 3, medium: 2, low: 1, info: 0 }
  const byKey = new Map()
  const perRuleCap = 350

  for (const rule of RULES) {
    let lines = []
    try {
      lines = runGitGrepExtended(repoPath, rule.pattern)
    } catch {
      continue
    }
    for (const line of lines.slice(0, perRuleCap)) {
      const parsed = parseGrepLine(line)
      if (!parsed) continue
      const key = `${parsed.file}\0${parsed.line}`
      const prev = byKey.get(key)
      if (!prev || sevRank[rule.severity] > sevRank[prev.severity]) {
        byKey.set(key, {
          id: key,
          category: rule.category,
          severity: rule.severity,
          file: parsed.file,
          line: parsed.line,
          text: parsed.text.trimEnd(),
        })
      }
    }
  }

  let issues = [...byKey.values()].sort((a, b) => {
    const d = sevRank[b.severity] - sevRank[a.severity]
    if (d !== 0) return d
    const fc = a.file.localeCompare(b.file)
    if (fc !== 0) return fc
    return a.line - b.line
  })

  const MAX = 500
  const truncated = issues.length > MAX
  if (truncated) {
    issues = issues.slice(0, MAX)
  }
  return { issues, truncated }
}

async function openAiIssueInsights(summaryText) {
  const key = (process.env.GITMOM_OPENAI_KEY || process.env.OPENAI_API_KEY || '').trim()
  if (!key) {
    return { ok: false, reason: 'no_api_key' }
  }
  const model = (process.env.GITMOM_OPENAI_MODEL || 'gpt-4o-mini').trim()
  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a senior engineer. From grep-style scan lines, list concrete code-quality and security follow-ups. Output 6–12 short bullet lines starting with • or -. No markdown headings.',
      },
      {
        role: 'user',
        content: `Repository scan (truncated):\n\n${String(summaryText || '').slice(0, 16000)}`,
      },
    ],
    max_tokens: 650,
    temperature: 0.25,
  }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    })
    const raw = await res.text()
    if (!res.ok) {
      return { ok: false, reason: 'api_error', message: raw.slice(0, 500) }
    }
    const data = JSON.parse(raw)
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) {
      return { ok: false, reason: 'api_error', message: 'Empty AI response.' }
    }
    return { ok: true, text }
  } catch (e) {
    return { ok: false, reason: 'api_error', message: e.message || String(e) }
  }
}

function ensureWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 780,
    title: APP_TITLE,
    show: false,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  if (!app.isPackaged) {
    win.loadURL(devUrl)
  } else {
    const indexHtml = path.join(__dirname, '..', 'dist', 'index.html')
    win.loadFile(indexHtml).catch((err) => {
      console.error('GitMom: failed to load UI', indexHtml, err)
    })
  }
}

app.whenReady().then(() => {
  ipcMain.handle('repo:pick', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Please select a Git repository folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folderPath = result.filePaths[0]
    if (!isGitRepo(folderPath)) {
      throw new Error('Selected folder is not a Git repository.')
    }
    addRecentRepo(folderPath)
    return folderPath
  })

  ipcMain.handle('repo:recent', async () => readRecentRepos())

  ipcMain.handle('repo:openRecent', async (_e, folderPath) => {
    if (!folderPath || !isGitRepo(folderPath)) {
      throw new Error('Recent folder is missing or no longer a valid Git repository.')
    }
    addRecentRepo(folderPath)
    return folderPath
  })

  ipcMain.handle('git:info', async (_e, repoPath) => getRepoInfo(repoPath))
  ipcMain.handle('git:status', async (_e, repoPath) => getStatus(repoPath))
  ipcMain.handle('git:history', async (_e, repoPath) => getHistory(repoPath))

  ipcMain.handle('git:search', async (_e, repoPath, query) => searchRepoText(repoPath, query))

  ipcMain.handle('git:languageStats', async (_e, repoPath) => getLanguageStats(repoPath))

  ipcMain.handle('git:scanIssues', async (_e, repoPath) => scanCodeIssues(repoPath))

  ipcMain.handle('git:aiIssueInsights', async (_e, summaryText) => openAiIssueInsights(summaryText))

  ipcMain.handle('git:fetch', async (_e, repoPath) => runGit(repoPath, ['fetch', '--all', '--prune']))

  ipcMain.handle('git:switchBranch', async (_e, repoPath, branchName) => {
    if (!branchName || !String(branchName).trim()) {
      throw new Error('Branch name is required.')
    }
    runGit(repoPath, ['checkout', branchName.trim()])
    return getRepoInfo(repoPath)
  })

  ipcMain.handle('git:createBranch', async (_e, repoPath, branchName) => {
    if (!branchName || !String(branchName).trim()) {
      throw new Error('Branch name is required.')
    }
    runGit(repoPath, ['checkout', '-b', branchName.trim()])
    return getRepoInfo(repoPath)
  })

  ipcMain.handle('git:pullMaster', async (_e, repoPath, masterBranch) =>
    runGit(repoPath, ['pull', 'origin', masterBranch || 'master'])
  )

  ipcMain.handle('git:stageFiles', async (_e, repoPath, files) => stageFiles(repoPath, files))
  ipcMain.handle('git:compareFilesWithBase', async (_e, repoPath, baseRef, files) =>
    compareFilesWithBase(repoPath, baseRef, Array.isArray(files) ? files : [])
  )

  ipcMain.handle('git:diffWorkingFiles', async (_e, repoPath, mode, baseRef, files) =>
    diffWorkingFiles(repoPath, String(mode || '').trim(), baseRef, Array.isArray(files) ? files : [])
  )

  ipcMain.handle('git:openNotepadCompare', async (_e, repoPath, baseRef, relPath) =>
    openNotepadCompareVsBase(repoPath, baseRef, String(relPath || '').trim())
  )

  ipcMain.handle('git:unstageFiles', async (_e, repoPath, files) =>
    unstageFiles(repoPath, Array.isArray(files) ? files : [])
  )

  ipcMain.handle('git:commit', async (_e, repoPath, commitMessage, options) => {
    if (!commitMessage || !String(commitMessage).trim()) {
      throw new Error('Commit message is required.')
    }
    const shouldStageAll = Boolean(options && options.stageAll)
    if (shouldStageAll) {
      runGit(repoPath, ['add', '.'])
    }
    return runGit(repoPath, ['commit', '-m', String(commitMessage).trim()])
  })

  ipcMain.handle('git:push', async (_e, repoPath, branchName) => {
    if (!branchName || !String(branchName).trim()) {
      throw new Error('Target branch is required for push.')
    }
    return runGit(repoPath, ['push', '-u', 'origin', branchName.trim()])
  })

  ipcMain.handle('git:merge', async (_e, repoPath, sourceBranch) => {
    if (!sourceBranch || !String(sourceBranch).trim()) {
      throw new Error('Source branch is required.')
    }
    return runGit(repoPath, ['merge', sourceBranch.trim()])
  })

  ipcMain.handle('git:revertCommit', async (_e, repoPath, commitHash) => {
    if (!commitHash || !String(commitHash).trim()) {
      throw new Error('Commit hash is required.')
    }
    return runGit(repoPath, ['revert', '--no-edit', commitHash.trim()])
  })

  ipcMain.handle('git:resolveConflictsHint', async (_e, repoPath) =>
    runGit(repoPath, ['status'])
  )

  ensureWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) ensureWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
