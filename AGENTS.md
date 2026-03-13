# AGENTS.md

## Scope
Repository-specific workflows and commands for `C:\GitRepos\rainfalldownload`.

## Core npm workflows
- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Run lint: `npm run lint`
- Run tests: `npm run test`
- Build production bundle: `npm run build`
- Preview production build: `npm run preview`

## CI workflow (GitHub Pages)
- Deploy workflow file: `.github/workflows/deploy.yml`
- Build job uses:
  - `npm ci`
  - `npm run build`
- Deploy triggers on pushes to `main` and manual dispatch.

## HRRR local service workflow
- Service docs: `services/hrrr_virtual_api/README.md`
- Local run commands:
  - `python -m venv .venv`
  - `pip install -r services/hrrr_virtual_api/requirements.txt`
  - `uvicorn services.hrrr_virtual_api.app:app --host 0.0.0.0 --port 8000`
- Optional env vars used by proxy/service:
  - `HRRR_SERVICE_URL`
  - `HRRR_PROXY_TARGET`
  - `HRRR_HERBIE_CACHE`

## VS Code debugger workflow (portable Node)
- Existing task configuration in `.vscode/tasks.json` runs:
  - `C:/GitRepos/node-v24.12.0-win-x64/npm.cmd run dev`
- Existing launch configuration in `.vscode/launch.json` opens:
  - `http://localhost:5173/rainfalldownload/`

## TODO
- Confirm whether portable Node path in `.vscode/tasks.json` should remain machine-specific or be parameterized for team use.
