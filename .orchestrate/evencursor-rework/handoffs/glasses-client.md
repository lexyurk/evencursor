<!-- orchestrate handoff
task: glasses-client
branch: orch/evencursor-rework/glasses-client
agentId: bc-4168b0be-6ac0-4834-8d5b-47e25ff4583e
runId: run-0825be1d-c0ac-45a0-a7d8-133f3d212ab5
resultStatus: finished
finishedAt: 2026-05-21T05:22:09.779Z
-->

## Status
success

## Branch
`orch/evencursor-rework/glasses-client`

## What I did
- Implemented `src/glasses/pages.ts` with `buildAgentListPage` and `buildAgentDetailPage`: 576×288 layouts, list container with `isEventCapture: 1`, up to 8 rows truncated to 64 chars, text content capped at 1000 chars, container names capped at 16 chars, and exported container ID/name constants for the adapter.
- Implemented `src/glasses/adapter.ts` (`GlassesAdapter`): 500 ms bridge timeout with no-op dev mode, first-list `createStartUpPageContainer` then `rebuildPageContainer`, detail rebuilds, middle-container `textContainerUpgrade` for delta-only updates, selection forwarding from `listEvent`, mic open/close via `audioControl` + `audioEvent`, and `shutDownPageContainer(0)`.
- Added `src/glasses/__tests__/pages.test.ts` (canvas bounds, limits, 64-char row truncation) and `src/glasses/__tests__/adapter.test.ts` (no-op without bridge, create vs rebuild list flow, `textContainerUpgrade` on middle container).

## Measurements
- `glasses-test-count`: 0 → 6
- `typecheck-exit`: 0 → 0
- `npm run test -- src/glasses`: 0 passing → 6 passing

## Verification
unit-test-verified

## Notes, concerns, deviations, findings, thoughts, feedback
- Branched from `origin/orch/evencursor-rework/scaffold` (current workspace was still on the legacy layout).
- Empty agent lists use `itemCount: 1` with an empty item name so the SDK list container stays valid.
- `updateDetailDelta` reuses the last `statusLine` from `showAgentDetail` and combines it with the new delta before upgrading the middle container.
- `package-lock.json` was unchanged after `npm install` on the scaffold base; only `src/glasses/**` was committed.

## Suggested follow-ups
- Wire `GlassesAdapter` from `src/main.ts` in the app-shell task (list → detail navigation, selection callbacks, mic PCM to Deepgram).
- After integration, verify on real G2 hardware that list touchpad selection events and `audioControl` PCM frames behave as expected.