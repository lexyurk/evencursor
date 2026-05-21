<!-- orchestrate handoff
task: extras-features-and-simulator
branch: orch/evencursor-rework/extras-features-and-simulator
agentId: bc-0f7e8d94-02e2-47a4-9a1d-acec73d378d0
runId: run-11d0fe04-8a34-42b5-923b-813a2adb9c22
resultStatus: finished
finishedAt: 2026-05-21T07:14:21.322Z
-->

## Status
success

## Branch
`orch/evencursor-rework/extras-features-and-simulator`

## What I did
- Extended `CursorClient` / `types.ts` with `archiveAgent`, `unarchiveAgent`, `deleteAgent`, `listModels`, optional `model` + `mode` on `createAgent`; added `models.ts` helper for picker options; empty-body API responses handled safely.
- Added `NewAgentDialog.ts` (prompt dictation mic, repo/name, model picker with `agent.lastModel` persistence, agent/plan mode) and wired `+ New agent` in `AgentsList.ts` with **Show archived** toggle (`includeArchived`).
- Upgraded `AgentDetail.ts`: archive/unarchive, delete, 10-run history with SSE re-attach (410-safe), follow-up dictation mic, `applyVoiceFollowUp` for voice edit-before-send.
- Updated `App.ts` / `VoiceBar.ts` / `commands.ts`: `/new` and `/follow up` open confirmation flows; `/archive`, `/unarchive`, `/delete`; Command ↔ Dictate mode with focused-field append.
- Added `dictation.ts` (`DictationSession` with interim preview + Insert/Cancel).
- Built G2 simulator: `g2-canvas.ts`, `simulator-bridge.ts`, `Simulator.ts`, `#/simulator` routing in `main.ts`, sim bridge probe in `bridge-probe.ts`, header **Open simulator** link.
- Tests: client lifecycle/models, dictation (4), g2-canvas smoke, command verbs; `verifier-extras/sim_capture.mjs`; Playwright screenshots captured.
- Draft PR #3 opened against `main`.

## Measurements
- `final-typecheck-exit`: 1 → 0
- `final-build-exit`: 0 → 0
- `total-test-count`: 35 → 44
- `simulator-screenshots-captured`: false → true
- `new-features-count`: 0 → 6

## Verification
live-ui-verified

`npm run typecheck`, `npm run test` (44), `npm run build` all exit 0. `node verifier-extras/sim_capture.mjs` wrote `/opt/cursor/artifacts/sim_agents_list.png` and `/opt/cursor/artifacts/sim_agent_detail.png`.

## Notes, concerns, deviations, findings, thoughts, feedback
- PR stacks on [ship-app-shell PR #2](https://github.com/lexyurk/evencursor/pull/2) as noted in the PR body.
- Added `playwright` as a devDependency (minimal) for `verifier-extras/sim_capture.mjs`.
- Simulator screenshots may look similar when the phone pane has not finished sign-in in headless capture; re-run `sim_capture.mjs` after `npm run dev` for richer HUD states if needed.
- `SimulatorBridge` is cast to `EvenAppBridge` (subset stub); real glasses still use the native bridge path.

## Suggested follow-ups
- Merge `ship-app-shell` first, then rebase this branch and resolve any UI conflicts.
- Manual on-device check: glasses bridge + mic dictation on G2 hardware.
- Approve/stack PR #3 after parent PR lands; optionally enrich `sim_capture.mjs` to drive touchpad Up/Down/Press for selection-ring evidence.