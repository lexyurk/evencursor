# evencursor — Rework Spec

This is the single source of truth for the rework. Workers MUST read this before changing code. Keep it accurate; replace it if you discover constraints that contradict it.

## 1. Product

A voice-first Even Realities G2 plugin (Even Hub WebView app) that lets the wearer manage **Cursor Cloud Agents** with one short voice command and a few touchpad taps, while glanceable status renders on the glasses HUD.

The first version was overloaded: it ran a local Node bridge that shelled out to the `cursor-agent` CLI, parsed its output, and reproduced a session/question model. We are throwing that away.

The new app:

- Talks directly to the **Cursor Cloud Agent REST API** (`https://api.cursor.com/v1/agents`) over `fetch`/`EventSource` from the WebView. No local CLI. No Node bridge. No server-side session state.
- Captures audio in-browser (via `getUserMedia` on a phone, or via Even Hub `audioControl` PCM frames when running on real glasses) and pipes it to **Deepgram** live streaming over a WebSocket. Renders interim + final transcripts in real time. Recognizes commands prefixed with `/` (e.g. `/new`, `/cancel`, `/follow up`).
- Mirrors agent state onto the **Even Realities G2 HUD** using `@evenrealities/even_hub_sdk`. Touchpad gestures (swipe / press) scroll and pick.
- "Sign in with Cursor" = paste-once a Cursor user API key from [cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations). Stored via `bridge.setLocalStorage("cursor.apiKey", …)` (which persists on the Even App side) and falls back to `window.localStorage` in the browser. No extra OAuth, no Cursor-CLI auth file scraping. The Deepgram API key uses the same paste-once pattern under a separate key.

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   Even Hub WebView (Vite SPA)                    │
│                                                                  │
│  ┌──────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│  │  UI      │  │  CursorClient    │  │  DeepgramVoice         │  │
│  │  (vanilla│◀▶│  fetch/SSE       │  │  WS + AudioWorklet     │  │
│  │   TS)    │  │  /v1/agents      │  │  + command parser      │  │
│  └────┬─────┘  └──────────────────┘  └────────────────────────┘  │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  GlassesAdapter (Even Hub SDK: containers + HUD lines)   │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
              │                       │
              ▼                       ▼
   https://api.cursor.com/v1   wss://api.deepgram.com/v1/listen
```

There is no backend. Everything runs in the Vite app, served either by `vite preview` for sideload into Even Hub or via the `evenhub-simulator` for desktop preview.

If a future deployment hits CORS issues against `api.cursor.com` or `api.deepgram.com` from inside the WebView, the fallback is a tiny stateless `fetch`-proxy in `src/server/proxy.ts` (NOT a session manager). Workers MUST first try the direct path; only add the proxy if a real preflight is rejected, and keep it as thin as possible.

## 3. Repository layout

```
evencursor/
├── docs/
│   ├── product.md           (kept, unchanged)
│   └── spec.md              (this file)
├── public/
│   └── app.json             (Even Hub plugin manifest)
├── src/
│   ├── main.ts              (Vite entry: boots app, mounts UI)
│   ├── ui/
│   │   ├── App.ts           (top-level component)
│   │   ├── SignIn.ts        (paste Cursor + Deepgram keys)
│   │   ├── AgentsList.ts    (live list of cloud agents)
│   │   ├── AgentDetail.ts   (status, latest run, follow-up box)
│   │   ├── VoiceBar.ts      (mic button + live transcript)
│   │   └── styles.css
│   ├── cursor/
│   │   ├── client.ts        (CursorClient: listAgents, getAgent,
│   │   │                     createAgent, createRun, getRun,
│   │   │                     streamRun, cancelRun, listRepos)
│   │   ├── types.ts         (Agent, Run, RunEvent, RunStatus)
│   │   └── auth.ts          (key get/set via storage adapter)
│   ├── voice/
│   │   ├── deepgram.ts      (DeepgramLive: WS, sendPCM, on('transcript'))
│   │   ├── mic.ts           (browser getUserMedia → 16k mono PCM frames)
│   │   ├── commands.ts      (parseTranscript → CommandToken | TextToken)
│   │   └── types.ts
│   ├── glasses/
│   │   ├── adapter.ts       (GlassesAdapter: init, renderLines,
│   │   │                     showAgentList, listenSelection,
│   │   │                     pumpHostAudio)
│   │   └── pages.ts         (container layouts for the G2 canvas)
│   ├── storage/
│   │   └── storage.ts       (KeyStore: setKey/getKey, prefers Even Hub
│   │                         bridge, falls back to window.localStorage)
│   └── shared/
│       └── events.ts        (tiny EventEmitter; no deps)
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

The old layout (`src/bridge/*`, `src/hub/main.ts`, `src/hub/even.ts`, `src/hub/speech.ts`, `src/shared/protocol.ts`, `src/shared/protocol.test.ts`) is removed. The old README is replaced.

## 4. Dependencies

`package.json` should end up roughly:

```json
{
  "name": "evencursor",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc -p tsconfig.json --noEmit && vite build",
    "preview": "vite preview --host 0.0.0.0",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@deepgram/sdk": "^3 || ^4",
    "@evenrealities/even_hub_sdk": "^0.0.10"
  },
  "devDependencies": {
    "typescript": "^5.6",
    "vite": "^7",
    "vitest": "^3"
  }
}
```

(Pin to whatever the workspace lockfile already resolves; only add the Deepgram dep. Drop `dotenv`, `ws`, `zod`, `tsx`, `@types/ws`, the bridge build step, and any `dev:bridge` / `start:bridge` script.)

## 5. Cursor Cloud Agent API contract (subset we use)

Base: `https://api.cursor.com`
Auth: HTTP Basic, username = the user's API key, password empty, so the header is literally `Authorization: Basic ${btoa(apiKey + ":")}`.

| Method | Path                                            | Used for                                        |
|--------|-------------------------------------------------|-------------------------------------------------|
| GET    | `/v1/agents?limit=N`                            | List agents (newest first; includes archived)   |
| GET    | `/v1/agents/{id}`                               | Get durable agent metadata                      |
| POST   | `/v1/agents`                                    | Create agent + initial run                      |
| POST   | `/v1/agents/{id}/runs`                          | Follow-up prompt on existing agent              |
| GET    | `/v1/agents/{id}/runs?limit=N`                  | List runs for an agent                          |
| GET    | `/v1/agents/{id}/runs/{runId}`                  | Poll run status                                 |
| GET    | `/v1/agents/{id}/runs/{runId}/stream`           | SSE: `status`, `assistant`, `thinking`, `tool_call`, `result`, `done`, `error` |
| POST   | `/v1/agents/{id}/runs/{runId}/cancel`           | Cancel active run                               |
| GET    | `/v1/me`                                        | Validate API key on sign-in                     |
| GET    | `/v1/repositories`                              | Optional repo picker (≤1/min/user — rate-limited; treat as best-effort) |

Run status enum (observed): `CREATING | RUNNING | FINISHED | ERRORED | CANCELLED` (plus possibly `EXPIRED`). Treat unknown statuses as `RUNNING` if non-terminal in name, else `ERRORED`.

SSE stream details: events have `event:` + `data:` + optional `id:`. To resume after disconnect, reconnect with `Last-Event-ID`. On `410 stream_expired`, switch to polling `GET /v1/agents/{id}/runs/{runId}` once every 5 s until terminal.

Only one run per agent can be active at once (409 `agent_busy`). Disable the follow-up button while `latestRun.status ∈ {CREATING, RUNNING}`.

## 6. Deepgram live transcription contract

Browser-friendly path (no SDK Node baggage): open a WebSocket to

```
wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1
```

with subprotocol header `Sec-WebSocket-Protocol: token, ${deepgramApiKey}`. (Per Deepgram docs, the browser can authenticate via the `token` subprotocol so the API key never appears in the URL.)

Audio source:
- **Browser preview**: `getUserMedia({audio:true})` → `AudioContext({sampleRate:16000})` → `AudioWorklet` that emits Int16 PCM frames, send each frame with `socket.send(arrayBuffer)`.
- **Even Hub real glasses**: `bridge.audioControl(true)` then subscribe to `bridge.onEvenHubEvent(e => e.audioEvent?.audioPcm)` (already 16 kHz PCM bytes per SDK doc), forward each `Uint8Array` directly.

Send `{ "type": "KeepAlive" }` every 8 s while idle to avoid timeout. Send `{ "type": "CloseStream" }` to end gracefully.

Parse incoming JSON messages:
- `type === "Results"` → `channel.alternatives[0].transcript`, plus `is_final` and `speech_final`.
- On `speech_final === true`, flush the accumulated finalised transcript to the **command parser** (`src/voice/commands.ts`).

## 7. Voice commands

The user can naturally dictate, but a token starting with `/` becomes a command. Example transcripts and intended parse:

| Transcript                                                | Command       | Args                                        |
|-----------------------------------------------------------|---------------|---------------------------------------------|
| `slash new fix the auth regression`                       | `/new`        | `prompt = "fix the auth regression"`        |
| `/new in lexyurk/evencursor fix the auth regression`      | `/new`        | `repo = "lexyurk/evencursor", prompt = …`   |
| `/cancel`                                                 | `/cancel`     | acts on selected agent                      |
| `/follow up add a test for null user`                     | `/followup`   | `prompt = "add a test for null user"`       |
| `/refresh`                                                | `/refresh`    | re-list agents                              |
| `/select 2`                                               | `/select`     | `index = 2`                                 |
| `/open lexyurk/evencursor`                                | `/open`       | navigate to agents for repo                 |
| `/sign in`                                                | `/signin`     | open sign-in screen                         |
| (anything else)                                           | (no command)  | shown as draft                              |

The parser MUST tolerate Deepgram writing `slash` instead of `/` and MUST be case-insensitive on the verb. Multi-word verbs (`follow up`, `sign in`) collapse to one token.

## 8. Glasses HUD model

The G2 canvas is **576 × 288**, 4-bit greyscale. We render two pages:

**Page A — Agent list (default)**
- 1 list container (`isEventCapture: 1`) showing up to 8 agent rows formatted as `STATUS  NAME` (truncated to 64 chars).
- 1 text container at bottom for "X agents · tap to select".
- Bound to selection events to navigate to Page B.

**Page B — Agent detail**
- 1 text container (top): agent name (truncated).
- 1 text container (middle): latest run status + last assistant delta line.
- 1 text container (bottom): "Swipe up: back · Press: follow up".
- Re-rendered via `bridge.textContainerUpgrade` whenever status or transcript changes; full `rebuildPageContainer` only on page transitions.

`createStartUpPageContainer` is called exactly once on app boot. All subsequent layout changes go through `rebuildPageContainer`. Image containers are not used in the initial cut (they require extra round-trips and we don't need them yet).

## 9. Acceptance for the whole rework

The rework is "done" when:

1. `npm run typecheck` passes with **zero** errors against the new tree.
2. `npm run build` produces a `dist/` ready for `evenhub pack`.
3. `npm run dev` opens, the Sign-In screen renders, pasting a Cursor API key + Deepgram key persists and unlocks the Agents screen.
4. The Agents screen lists the user's real cloud agents (read from `/v1/agents`) and updates when `/refresh` is called.
5. Pressing the mic button opens a Deepgram WS, displays interim transcripts live, parses `/new …` and POSTs to `/v1/agents`, then shows the new agent at the top of the list.
6. Selecting an agent opens the detail page, attaches to the run's SSE stream, and shows live assistant deltas.
7. `/cancel` issues `POST /v1/agents/{id}/runs/{runId}/cancel` against the selected agent and the UI reflects `CANCELLED`.
8. Sign-out clears the stored keys via `bridge.setLocalStorage("cursor.apiKey", "")` and friends.
9. The Even Hub adapter renders a 1-line HUD summary on every state change (in dev, this is logged to console when the bridge is absent; on device it calls `textContainerUpgrade`).
10. All new TypeScript files are strict-mode clean (no `any` leaking out of module boundaries).

## 10. Non-goals (cut from V1)

- ACP / interactive resume flows.
- Local `cursor-agent` CLI integration. Dead, removed.
- Worktree management. The cloud agent owns its repo state.
- Persistent question/answer normalization. The cloud agent doesn't ask interactive questions the same way; if it needs input, the user issues a `/follow up …`.
- Multi-user accounts or remote relay servers.
- Anything that requires storing secrets server-side.

## 11. Style

- TypeScript strict. No `any` in exports. Prefer `unknown` + narrowing at boundaries.
- Vanilla DOM rendering (`element.innerHTML = …` is fine for this scale; no React). Escape user-controlled strings.
- One module = one responsibility. The three core modules (`cursor/`, `voice/`, `glasses/`) MUST NOT import from each other; they only know the storage adapter and the shared event emitter.
- Imports at the top of the file. No inline imports.
- Modern types: `string | undefined` instead of `Optional<string>`; `dict[K, V]` style is irrelevant (TS).

## 12. References

- Cursor Cloud Agent REST API — full content captured by the planner in this commit; re-fetch from `https://cursor.com/docs/cloud-agent/api/endpoints` if you suspect drift.
- Even Hub SDK README — `node_modules/@evenrealities/even_hub_sdk/README.md` is the authoritative API surface for this version of the SDK. Read it before touching `glasses/`.
- Deepgram live streaming — `https://developers.deepgram.com/docs/live-streaming-audio`. The browser WebSocket pattern (token subprotocol) is documented at `https://developers.deepgram.com/docs/browser-audio-streaming` and `https://developers.deepgram.com/docs/authenticating`.
