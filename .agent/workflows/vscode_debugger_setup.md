---
description: How to configure VS Code debugger and tasks for a portable Node.js environment
---

# VS Code Debugger Setup with Portable Node.js

This workflow documents the configuration required to launch the Visual Studio Code debugger with a portable Node.js installation (e.g., when `node` and `npm` are not in the system PATH).

## Prerequisites
- Portable Node.js directory path (e.g., `C:\GitRepos\node-v24.12.0-win-x64`).

## Configuration Steps

### 1. Configure `.vscode/launch.json`
Ensure the configuration uses the `pwa-chrome` type for modern debugger support.

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "pwa-chrome",
            "request": "launch",
            "name": "Launch Chrome against localhost",
            "url": "http://localhost:5173/rainfallldownload/",
            "webRoot": "${workspaceFolder}",
            "preLaunchTask": "npm: dev"
        }
    ]
}
```

### 2. Configure `.vscode/tasks.json`
The `npm` task must be manually configured to:
1.  Use the absolute path to the portable `npm.cmd`.
2.  **Crucial:** Add the portable Node.js directory to the `PATH` environment variable so `npm` can find `node.exe`.

```json
{
    "version": "2.0.0",
    "tasks": [
        {
            "type": "process",
            "command": "C:/GitRepos/node-v24.12.0-win-x64/npm.cmd", // ADJUST THIS PATH
            "args": ["run", "dev"],
            "options": {
                "env": {
                    "PATH": "C:\\GitRepos\\node-v24.12.0-win-x64;${env:PATH}" // ADJUST THIS PATH
                }
            },
            "label": "npm: dev",
            "detail": "vite",
            "isBackground": true,
            "problemMatcher": {
                "owner": "custom",
                "pattern": {
                    "regexp": "^$"
                },
                "background": {
                    "activeOnStart": true,
                    "beginsPattern": "^.*(Vite|VITE) v.*",
                    "endsPattern": "^.*Local:.*"
                }
            },
            "presentation": {
                "group": "server",
                "reveal": "always",
                "panel": "shared"
            }
        }
    ]
}
```

## Troubleshooting
If the task fails with "spawn unknown" or "node not found":
- Verify the `command` path points to `npm.cmd` (not just `npm`).
- Verify the `options.env.PATH` includes the directory containing `node.exe`.
