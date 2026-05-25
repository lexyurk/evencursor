# AGENTS.md

## Cursor Cloud specific instructions

### Overview

evencursor is a voice-first HUD bridge for Cursor Agent sessions on Even Realities smart glasses. It has two services:

| Service | Command | Port | Purpose |
|---------|---------|------|---------|
| Bridge server | `npm run dev:bridge` | 8787 | Node.js HTTP + WebSocket API (session management, spawns cursor-agent CLI) |
| Hub UI | `npm run dev:hub` | 5173 | Vite SPA (session dashboard, voice input, HUD rendering) |

### Running services

- Start bridge: `npm run dev:bridge` (uses `tsx watch`, auto-reloads on file changes)
- Start hub: `npm run dev:hub` (Vite dev server with HMR, binds 0.0.0.0)
- Both services are independent and can be started in any order.
- The bridge requires a `.env` file (copy from `.env.example`) but will start with defaults if missing.

### Key commands

See `package.json` scripts. Summary:

- `npm run typecheck` — runs tsc on both tsconfigs (hub + bridge)
- `npm test` — runs vitest
- `npm run build` — production build (vite for hub, tsc for bridge)

### Caveats

- The bridge spawns `cursor-agent` (or `$CURSOR_AGENT_BIN`) as a child process. If the CLI isn't installed, session creation still works via the API but sessions will immediately fail with exit code -2. This is expected in environments without the Cursor Agent CLI.
- The hub UI connects to the bridge via WebSocket at `/ws`. If the bridge isn't running, the hub still loads but won't show live session data.
- TypeScript uses two separate tsconfig files: `tsconfig.json` (hub/browser target with DOM libs) and `tsconfig.bridge.json` (Node.js target with NodeNext module resolution).
- The `.env` file is gitignored. Copy `.env.example` to `.env` for local config.
