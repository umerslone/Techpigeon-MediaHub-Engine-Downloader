# Contributing Guide

Thanks for contributing to TechPigeon MediaHub Engine Downloader.

## Development Setup

### 1) Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 2) Frontend

Open a second terminal:

```powershell
cd pwa-frontend
npm install
npm run dev
```

Frontend: `http://localhost:3000`
Backend: `http://127.0.0.1:8000`

## Branching and Pull Requests

- Create a feature branch from `main`
- Keep PRs focused and small
- Include a clear summary of what changed and why
- Add test/verification steps in the PR description

Recommended PR checklist:

- [ ] Backend runs locally
- [ ] Frontend runs locally
- [ ] Affected download flow tested end-to-end
- [ ] No secrets or credentials added
- [ ] Documentation updated when behavior changes

## Code Style

### Backend (Python)

- Prefer explicit, readable code
- Keep functions focused
- Log meaningful events and failures
- Validate user input and return clear HTTP errors

### Frontend (TypeScript/React)

- Keep UI state transitions predictable
- Avoid hidden side effects
- Surface actionable user-facing errors
- Prefer accessible controls and labels

## Commit Messages

Use clear, descriptive messages:

- `fix: resolve fallback format selection without ffmpeg`
- `feat: add download folder open action in UI`
- `docs: add localhost and cloudflare tunnel setup`

## Reporting Bugs

Please include:

- OS and runtime versions (Python, Node)
- Exact URL type/platform tested
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs/screenshots

## Security Issues

For vulnerabilities, follow the private reporting process in `SECURITY.md`.
