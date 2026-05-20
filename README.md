# evencursor

Voice-first Even Realities HUD for managing Cursor Agent sessions.

\`evencursor\` is a small open-source bridge between:

- **Even Realities G2 / Even Hub** as a glanceable HUD.
- **Cursor Agent CLI** as the coding agent runtime.
- **Your voice** as the input layer for creating sessions and answering agent questions.

The goal is not to put an IDE on smart glasses. The goal is to keep Cursor work moving when the agent only needs a short human decision.

## Product Shape

The core interface is an **Agent Voice Inbox**:

~~~text
NEEDS YOU
Cursor: choose auth strategy
Cursor: approve test command
Cursor: clarify expected UX
~~~

You can:

1. Dictate a new Cursor task.
2. Review a compact task draft.
3. Launch a Cursor Agent session.
4. See which sessions are running, done, failed, or waiting for you.
5. Answer short agent questions by voice.
6. Send the answer back to the matching Cursor session.

## Architecture

~~~text
Even Hub web app / phone browser
        |
        | HTTP + WebSocket
        v
evencursor bridge
        |
        | cursor-agent CLI
        v
Cursor Agent sessions
~~~

The bridge is intentionally local-first. It does not require OpenClaw, Claude, Codex, or any private infrastructure.

## Current MVP

- Hub UI with session overview and question queue.
- Browser voice dictation via Web Speech API when available.
- Even Hub SDK adapter for rendering 1-3 line HUD summaries.
- Local bridge API for launching Cursor Agent sessions.
- Cursor session state normalized into \`running\`, \`waiting\`, \`done\`, and \`failed\`.
- Heuristic question extraction from Cursor output.
- Resume flow for sending a voice answer back into the Cursor session.

## Requirements

- Node.js 20+
- Cursor Agent CLI installed and authenticated:

~~~bash
cursor-agent status
~~~

If your binary is not named \`cursor-agent\`, set:

~~~bash
CURSOR_AGENT_BIN=/path/to/cursor-agent
~~~

## Setup

~~~bash
npm install
npm run typecheck
npm run dev:bridge
npm run dev:hub
~~~

Then open the Vite URL on your phone or through Even Hub.

## Bridge Environment

Create \`.env\` if needed:

~~~bash
EVENCURSOR_PORT=8787
CURSOR_AGENT_BIN=cursor-agent
EVENCURSOR_DEFAULT_WORKSPACE=/path/to/repo
~~~

## API Sketch

Create a session:

~~~bash
curl -X POST http://localhost:8787/api/sessions \\
  -H 'content-type: application/json' \\
  -d '{
    "title": "Fix auth regression",
    "workspace": "/path/to/repo",
    "prompt": "Investigate why auth tests fail. Return patch and tests.",
    "mode": "agent",
    "worktree": true
  }'
~~~

Answer a question:

~~~bash
curl -X POST http://localhost:8787/api/sessions/<id>/answer \\
  -H 'content-type: application/json' \\
  -d '{"text":"Inspect first. Do not modify backend auth yet."}'
~~~

## Safety Model

- Cursor command execution remains governed by Cursor Agent itself.
- \`evencursor\` does not auto-approve shell commands.
- The HUD should show decisions, blockers, artifacts, and risks, not full logs.
- Public deployments should put the bridge behind auth/TLS before exposing it outside localhost.

## Non-Goals

- Not a general multi-agent cockpit.
- Not an IDE replacement.
- Not an OpenClaw-specific project.
- Not a notification system.
- Not a cloud service by default.

## Roadmap

- Even R1 / glasses input event mapping.
- Native Even mic PCM transcription path.
- Better Cursor ACP integration once the practical API surface stabilizes.
- Authenticated remote relay for away-from-laptop operation.
- GitHub PR / branch artifact cards.
- Session comparison: run two Cursor sessions and show concise conclusion diff.

## License

MIT
