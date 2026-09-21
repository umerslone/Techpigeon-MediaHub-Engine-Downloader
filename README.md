# TechPigeon MediaHub Engine Downloader

Open-source HD/4K video/audio downloader built with:
- FastAPI backend (`backend/`)
- Next.js frontend (`pwa-frontend/`)

This repository is configured for local development only.
Cloud deployment pipelines and provider-specific deployment scripts were removed for open-source release.

## Features

- Analyze each video URL and show dynamically available quality/format options
- Download video/audio with real progress tracking (SSE)
- Adaptive retry and fallback format handling (including no-FFmpeg systems)
- Local download details UI with quick open-folder action

## Security Notes (Open-Source Release)

- Cloud deployment files/scripts were removed from the repo.
- A hardcoded provider token was found in old deployment scripts and those files were removed.
- If this repo was ever pushed with those files, rotate those old credentials immediately.
- Never commit `.env` files, tokens, or private keys.

## Project Structure

- `backend/` FastAPI API and download engine
- `pwa-frontend/` Next.js web UI
- `browser-extension/` optional extension assets

## Prerequisites

- Python 3.11+ (3.12 recommended)
- Node.js 20+ and npm
- Git
- Optional: FFmpeg (recommended for best video/audio merge compatibility)

## 1) Backend Setup (Localhost)

From repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Backend URL:
- `http://127.0.0.1:8000`

Health check:
- `http://127.0.0.1:8000/`

## 2) Frontend Setup (Localhost)

Open a second terminal from repository root:

```powershell
cd pwa-frontend
npm install
npm run dev
```

Frontend URL:
- `http://localhost:3000`

By default frontend calls:
- `NEXT_PUBLIC_API_URL=http://localhost:8000`

Optional explicit env (`pwa-frontend/.env.local`):

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Quick start: copy `pwa-frontend/.env.local.example` to `pwa-frontend/.env.local` and update values.

Optional GitHub link env (recommended for public release):

```env
NEXT_PUBLIC_REPO_URL=https://github.com/<owner>/<repo>
NEXT_PUBLIC_CREATOR_URL=https://github.com/<owner>
```

## 3) How to Use

1. Open frontend at `http://localhost:3000`
2. Paste a video URL
3. Wait for dynamic quality list
4. Select quality and click Download
5. Watch progress and stats
6. Use `Open Download Folder` after success

Default download location:
- `%TEMP%\techpigeon_downloads`
- Example on Windows: `C:\Users\<you>\AppData\Local\Temp\techpigeon_downloads`

## 4) Browser Extension User Guide

The repository includes a companion extension in `browser-extension/`.

Current extension capabilities:
- Detects the active tab URL on supported media sites
- Calls backend `POST /api/analyze` and shows top quality options
- Starts downloads via backend `GET /api/download-stream`
- Lets users set/save backend API base URL in popup settings

Supported sites (as currently configured):
- YouTube (`youtube.com`, `youtu.be`)
- Bilibili
- OK.ru
- Dailymotion
- Vimeo
- TikTok

### Install in Chrome / Edge (Developer Mode)

1. Open extensions page:
	- Chrome: `chrome://extensions`
	- Edge: `edge://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `browser-extension/` folder
5. Pin the extension to your toolbar (optional)

### Use the extension

1. Start backend first (`http://127.0.0.1:8000` recommended)
2. Open a supported video page in browser
3. Click extension icon
4. Confirm/adjust `Backend API URL` in popup (default: `http://localhost:8000`)
5. Click `Download` on the quality row you want

### Extension notes

- If popup shows analysis errors, first verify backend is running and healthy.
- If you changed backend host/port, update the popup API base and retry.
- The extension host permissions currently include localhost endpoints.
- For non-localhost API domains, add that domain to `host_permissions` in `browser-extension/manifest.json`, then reload extension.

## 5) Create Cloudflare Tunnel (Optional)

Use this only if you want public temporary access to your local backend.

### Install cloudflared

```powershell
winget install Cloudflare.cloudflared
```

### Start tunnel to backend

```powershell
cloudflared tunnel --url http://localhost:8000
```

You will get a URL like:
- `https://<random-name>.trycloudflare.com`

### Point frontend to tunnel

Create/update `pwa-frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://<random-name>.trycloudflare.com
```

Restart frontend:

```powershell
cd pwa-frontend
npm run dev
```

## 6) Troubleshooting

### Frontend `EPERM ... .next\trace`

```powershell
cd pwa-frontend
Remove-Item -Recurse -Force .next
npm run dev
```

### Port already in use

```powershell
Get-NetTCPConnection -LocalPort 8000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 3000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### FFmpeg warning

If FFmpeg is missing, app uses safe single-stream fallback formats.
Install FFmpeg for broader format/merge support.

## Open-Source Guidelines

- Keep provider/API credentials out of source control
- Use environment variables for runtime secrets
- Open issues/PRs with reproducible steps and logs

## How Users Can Contribute and Send Stars

If your final public repo URL is configured, users can:
- Star the repository from the app's "Star This Repo" button
- Read contribution rules in `CONTRIBUTING.md`
- Open issues and submit pull requests

If the final repo URL is not yet configured/published, users can still:
- Star/follow the creator profile: `https://github.com/umerslone`
- Browse published repositories: `https://github.com/umerslone?tab=repositories`
- Use "Find & Star Repo" in the app to locate the project on GitHub search

## Open-Source Release Checklist

Use this checklist before every public release:

- Confirm working tree is clean: `git status`
- Ensure no secrets or env files are tracked:
	- `git ls-files *.env *.pem *.key`
	- Scan source for high-risk patterns (tokens/keys/password literals)
- Ensure generated artifacts are not tracked:
	- No `.venv*`, `node_modules`, `.next`, `__pycache__`, `*.tsbuildinfo`
- Verify cloud/deployment artifacts are not present (unless intentionally open-sourced)
- Verify required governance docs exist and are updated:
	- `README.md`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`
- Run local smoke tests:
	- Backend health endpoint responds
	- Frontend loads and can analyze/download
	- Browser extension popup can analyze current tab (if using extension)
- Re-check remote refs:
	- `git branch -r` only shows expected branches
	- Remove stale refs/branches before release
- Tag release only after checks pass and credentials are confirmed rotated if previously exposed

## License

Add your preferred open-source license file (for example `MIT`) before publishing.
