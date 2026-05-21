<!-- orchestrate handoff
task: ship-app-shell
branch: orch/evencursor-rework/ship-app-shell
agentId: bc-448774cb-6323-4a71-92c9-78c758e787e8
runId: run-15fc9ccf-f1a6-429b-b497-731519c48856
resultStatus: finished
finishedAt: 2026-05-21T05:58:26.193Z
-->

## Status
partial

## Branch
`orch/evencursor-rework/ship-app-shell`

## What I did
- Checked out `orch/evencursor-rework/fix-keystore-fallback` and pushed it as `orch/evencursor-rework/ship-app-shell` (no source edits).
- Re-ran `npm install && npm run typecheck && npm run test && npm run build` on a clean working tree — all exit 0, 35 tests passing.
- Regenerated live UI verification screenshots at `/opt/cursor/artifacts/keystore_fix_signin.png` and `/opt/cursor/artifacts/keystore_fix_agentslist.png` (Playwright against `npm run dev`; sign-in unlocks VoiceBar + AgentsList, 100 agent rows).
- Prepared consolidated draft PR body (spec link, all six child branches, §9 checklist post-fix, keystore-fix note, inline screenshot refs) via `ManagePullRequest` — registered for user approval.
- Attempted to close PR #2 and create/update via `gh` — blocked by integration permissions (`403 Resource not accessible by integration`).

## Measurements
- `final-typecheck-exit`: 0
- `final-test-count`: 35
- `final-build-exit`: 0
- `pr-url`: https://github.com/lexyurk/evencursor/pull/2 (still open on `orch/evencursor-rework/app-shell`; consolidated PR pending user approval of ManagePullRequest request targeting `orch/evencursor-rework/ship-app-shell`)

## Verification
live-ui-verified

Playwright headless run against `npm run dev`:
- `hasVoice: true`, `hasList: true`, `agentRows: 100`
- Screenshots saved to artifact paths above

## Notes, concerns, deviations, findings, thoughts, feedback
- GitHub token lacks permission to close PR #2, change its head branch, or create PRs via `gh`. `ManagePullRequest` `close` action is not available; `create_pr`/`update_pr` bodies were submitted but require user approval before the PR is actually created/updated.
- Original upstream artifact PNGs were absent in this environment; re-captured equivalent screenshots during consolidation verification.
- Branch `orch/evencursor-rework/ship-app-shell` is pushed and contains `fix-keystore-fallback` commits (`d717739`, `a4dae22`) atop the full app-shell merge stack.
- PR #2 remains open pointing at `app-shell` until the pending ManagePullRequest action is approved or the planner closes it manually.

## Suggested follow-ups
- Approve the pending ManagePullRequest to create/update the draft PR from `orch/evencursor-rework/ship-app-shell` against `main`, then close superseded PR #2.
- On-device G2 smoke: confirm bridge probe passes, HUD mirroring, glasses mic path.
- Manual verification of `/refresh`, mic + `/new`, AgentDetail SSE, and `/cancel` flows.