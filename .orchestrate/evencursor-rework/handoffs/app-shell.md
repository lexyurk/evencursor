<!-- orchestrate handoff
task: app-shell
branch: orch/evencursor-rework/app-shell
agentId: bc-131c1bc1-a5f6-440c-8a6e-8c4566da9bd0
runId: run-6e1ce5b1-05ea-42c4-b687-680cdcc0a2f4
resultStatus: finished
finishedAt: 2026-05-21T05:26:15.184Z
-->

## Status
success

## Branch
`orch/evencursor-rework/app-shell`

## What I did
- Merged `orch/evencursor-rework/cursor-client`, `voice-client`, and `glasses-client` into `app-shell` (fast-forward + merge commits; 28 unit tests still pass).
- Implemented `src/main.ts` — `KeyStore`, `bindKeyStore`, `GlassesAdapter.init()`, mount `SignIn` or `App` based on stored keys.
- Implemented `src/ui/SignIn.ts` — Cursor + Deepgram paste fields, `/v1/me` validation, `signedIn` event, dashboard deep links.
- Implemented `src/ui/App.ts` — layout shell, command bus (`/new`, `/cancel`, `/followup`, `/refresh`, `/select`, `/open`, `/signin`, `/signout`), glasses list/detail mirroring, selection callback, sign-out.
- Implemented `src/ui/AgentsList.ts` — `listAgents`, status badges, 10s poll with in-flight debounce, click-to-select.
- Implemented `src/ui/AgentDetail.ts` — metadata, follow-up, cancel, `streamRun` log + HUD deltas, terminal stream close.
- Implemented `src/ui/VoiceBar.ts` — mic toggle, `BrowserMic` / glasses PCM → `DeepgramLive`, interim transcript, `speech_final` → `parseTranscript`.
- Expanded `src/ui/styles.css` — mobile-first dark theme, ≥48px tap targets, colour-coded badges.
- Simplified `public/app.json` to minimal manifest (`name`, `version`, `entry`).
- Added `signout` verb to `src/voice/commands.ts` for `/sign out` voice command.
- Removed `.orchestrate/` from git index so it is not in the PR diff (files remain locally untracked).
- Opened draft PR #2 against `main`: https://github.com/lexyurk/evencursor/pull/2

## Measurements
- `final-typecheck-exit`: (n/a) → 0
- `final-build-exit`: (n/a) → 0
- `total-test-count`: 0 → 28
- `cursor-test-count`: 0 → 6
- `voice-test-count`: 0 → 16
- `glasses-test-count`: 0 → 6

## Verification
unit-test-verified

## Notes, concerns, deviations, findings, thoughts, feedback
- Module merges were clean (cursor fast-forward; voice/glasses merge commits). No `package.json` conflicts.
- `.orchestrate/` was dropped from the branch index via `git rm --cached` so PR #2 vs `main` has no orchestrator diff; working tree still has local `.orchestrate/` for the orchestrator.
- Live UI (Sign-In, mic, SSE) was not exercised with real API keys in this environment — automated typecheck/build/test only.
- `AgentDetail` full re-renders on run status SSE events (acceptable at this scale; may reset textarea focus mid-run).
- Glasses mic is preferred when `GlassesAdapter.init()` reports `available`; otherwise `BrowserMic` is used.

## Suggested follow-ups
- Manual verification on `npm run dev` with real Cursor + Deepgram keys (spec §9 items 3–7).
- On-device G2 check: list selection events and `audioControl` PCM → Deepgram path.
- Add integration test with recorded `streamRun` SSE fixture when available.
- Consider extracting a `VoiceSession` facade to simplify mic/Deepgram lifecycle in `VoiceBar`.