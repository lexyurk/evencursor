<!-- orchestrate handoff
task: fix-keystore-fallback
branch: orch/evencursor-rework/fix-keystore-fallback
agentId: bc-70a89520-97cf-463a-ad8b-4e0ce8ed5148
runId: run-1ea353ff-e403-495a-8ce1-11ed33fec207
resultStatus: finished
finishedAt: 2026-05-21T05:51:56.828Z
-->

## Status
success

## Branch
`orch/evencursor-rework/fix-keystore-fallback`

## What I did
- Added `src/storage/bridge-probe.ts` — shared capability probe via `setLocalStorage`/`getLocalStorage` round-trip on sentinel key `evencursor.bridge-probe`; exports `getBridgeIfAvailable()` and `isEvenHubAvailable()`.
- Refactored `src/storage/storage.ts` — `KeyStore` uses probed bridge only when round-trip succeeds; always mirrors writes to `window.localStorage`; reads prefer bridge then fall back to `localStorage`; delete clears both layers.
- Refactored `src/glasses/adapter.ts` — `init()` uses `getBridgeIfAvailable()` so `available=true` only when storage probe passes.
- Added `src/storage/__tests__/storage.test.ts` (6 cases: probe success, set failure, readback failure, read fallback, delete both layers, no bridge).
- Extended `src/glasses/__tests__/adapter.test.ts` — probe-failure → `available=false` even when SDK returns a bridge object; existing tests updated with storage probe mocks.
- Added `jsdom` devDependency for storage tests.
- Removed `.verifier/` directory (verifier-only artifacts).
- Live-verified in browser dev mode: bridge probe returns `false`, keys persist in `localStorage`, `.voice-bar` + `.agents-list` render after sign-in, `GET /v1/agents` fires.

## Measurements
- `total-test-count`: 28 → 35
- `final-typecheck-exit`: 0 → 0
- `final-build-exit`: 0 → 0
- `live-signin-unlocks-agents`: false → true

## Verification
live-ui-verified

Live run against `npm run dev` + headless Chrome:
- Probe: `bridgeSetProbe: false`, `localStorageCursor` populated (fallback confirmed)
- UI: `hasVoice: true`, `hasList: true`, `agentRows: 50`, `agentsStatus: "50 agents"`
- Network: `GET https://api.cursor.com/v1/agents?limit=50`

Screenshots:
- `/opt/cursor/artifacts/keystore_fix_signin.png` — App shell after sign-in (SignIn form gone, header + sign-out visible)
- `/opt/cursor/artifacts/keystore_fix_agentslist.png` — VoiceBar + AgentsList with 50 agent rows

## Notes, concerns, deviations, findings, thoughts, feedback
- Pushed to `orch/evencursor-rework/fix-keystore-fallback` per branch discipline (not directly to `app-shell`); planner owns merge into PR #2.
- Global probe result is cached in `bridge-probe.ts` so `KeyStore` and `GlassesAdapter` share one round-trip per page load.
- `resetBridgeProbeCacheForTests()` exported for unit test isolation only.
- Glasses availability is gated on the storage probe (not a separate `getDeviceInfo()` probe); in browser dev mode both fail together, on-device both should succeed together.

## Suggested follow-ups
- Planner merge `fix-keystore-fallback` → `app-shell` and re-run verifier against PR #2.
- On-device G2 smoke test: confirm bridge probe passes and HUD mirroring + glasses mic path work.
- Manual AgentDetail SSE + voice `/refresh` once merged.