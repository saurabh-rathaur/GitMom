
To replace the remote history entirely (use with care):

```bash
git push -u origin main --force
```

## Prerequisites

- **Node.js** 18+ and **npm**
- **Git** installed and on your **PATH** (GitMom runs `git` in the shell)
- For **development**: nothing else

## Run (development)

From the project folder:

```bash
npm install
npm run dev
```

This starts Vite and opens the **Electron** window. Use that window—not a browser tab on `localhost`—so the Git bridge works.

| Script        | Purpose                          |
|---------------|----------------------------------|
| `npm run dev` | Electron + Vite dev server       |
| `npm run dev:web` | Vite only (browser; **no Git**) |
| `npm start`   | Electron only (needs `dist` built first) |

## Build (production assets)

```bash
npm run build
```

Runs TypeScript check and Vite → output in **`dist/`**.

## Deploy — Windows installer (.exe)

Builds the app and runs **electron-builder** (NSIS installer + unpacked folder).

```bash
npm run dist:win
```

**Outputs** (under **`release/`**):

| Artifact | Description |
|----------|-------------|
| `GitMom Setup <version>.exe` | Installer (choose folder, wizard) |
| `win-unpacked/GitMom.exe` | Run without installing (smoke test) |

- **`release/`** is gitignored; rebuild before sharing an installer.
- Installer is **not** code-signed by default; Windows SmartScreen may warn until you sign with a real certificate.
- Packaged UI uses `file://` loading; the repo uses `base: './'` in Vite so the window is not blank.

**Folder-only package** (no Setup exe):

```bash
npm run pack
```

## Optional: AI summary (Issues tab)

Set before starting GitMom (PowerShell example):

```powershell
$env:GITMOM_OPENAI_KEY = "your-api-key"
# optional:
$env:GITMOM_OPENAI_MODEL = "gpt-4o-mini"
npm run dev
```

Or set **user environment variables** in Windows and restart the terminal.

## Version and branding

- App version: **`package.json`** → `version`
- Window title: **`electron/main.cjs`** → `APP_TITLE`

## Troubleshooting

| Problem | Check |
|---------|--------|
| Blank window after install | Rebuild with `npm run build` and `npm run dist:win`; ensure `vite.config.ts` has `base: './'`. |
| “Git” / bridge errors in browser | Use `npm run dev` Electron window, not `dev:web`. |
| Code-sign / symlink errors on build | Script sets `CSC_IDENTITY_AUTO_DISCOVERY=false`; enable Windows Developer Mode or run terminal as Administrator if tools still fail. |

---

**Made by Saurabh Rathaur** · GitMom v1.1
