<!-- orchestrate handoff
task: reverify-app-shell
branch: `orch/evencursor-rework/ship-app-shell` (verifier artifacts committed at `66826ec`, pushed to origin)
agentId: bc-bc8413a8-f307-44a0-a382-b740633bd70b
runId: run-bbf78b38-4a81-44be-a5b7-fa7da76a63b3
resultStatus: finished
finishedAt: 2026-05-21T06:10:33.907Z
-->

## Verification
live-ui-verified

## Target
`app-shell` on branch `orch/evencursor-rework/app-shell`

## Branch
`orch/evencursor-rework/ship-app-shell` (verifier artifacts committed at `66826ec`, pushed to origin)

## Execution

Automated suite on `orch/evencursor-rework/ship-app-shell` (the actual checked-out, "shippable" branch — it carries `app-shell` plus the KeyStore-fallback fix):

- `npm install` → exit 0 (112 packages, 0 vulns).
- `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) → exit 0.
- `npm run test` (`vitest run`) → exit 0. 6 files, **35 tests passed** (`commands` 13, `adapter` 4, `pages` 3, `deepgram` 3, `storage` 6, `cursor/client` 6).
- `npm run build` (`tsc --noEmit && vite build`) → exit 0. Output: `index.html 0.39 kB`, `index-CE2vub-E.css 3.53 kB`, `index-Dl__eUO3.js 98.82 kB`.

Live `/v1/me` against real Cursor API:
- `curl https://api.cursor.com/v1/me -H 'Authorization: Bearer $CURSOR_API_KEY'` → HTTP 200, body `{"apiKeyName":"orchestrate-cloud","userEmail":"alexey.yurkevich1@gmail.com",…}`. Confirms the SignIn validation contract works against the production API.
- `curl https://api.cursor.com/v1/agents` for the same key → HTTP 200, `{"agents":[]}` — the operator's account currently has zero agents, so the live AgentsList alone wouldn't render rows.

End-to-end browser flow — `npm run dev` (vite 7.3.3 on `:5173`) + Playwright headless Chromium against the running dev server, with `**/api.cursor.com/**` routed so:
- `/v1/me` passes through to api.cursor.com (real validation).
- `/v1/agents`, `/v1/agents/.../runs`, and `/v1/agents/.../runs/.../stream` are fulfilled from a fixture (2 agents, one RUNNING, one FINISHED; stream body is a real SSE `text/event-stream` payload with `status`, `assistant`, `thinking`, `tool_call` events). Without this the AgentsList would be empty because of the live account state above.

Harness: `verifier-app-shell/live_repro.mjs` (committed to branch). Stage-by-stage result (from `verify_summary.json`):

```
signin-shown                ok
app-mounted                 ok
agents-list-rendered        ok  (2 rows)
agent-detail-mounted        ok
sse-request-issued          ok
sse-response-received       ok  (200 text/event-stream)
assistant-log-streamed      ok  ("Looking at the billing module.\n[thinking] Considering options\n[tool] read_file")
```

`verify_network.json` confirms the Cursor API calls actually made by the page (status + content-type):
- `GET /v1/me` → 200 `application/json; charset=utf-8` (real cursor.com)
- `GET /v1/agents?limit=50` → 200 `application/json`
- `GET /v1/agents/agent_alpha/runs/run_alpha_1/stream` → 200 `text/event-stream`
- second `GET /v1/agents?limit=50` (10 s poll tick) → 200 `application/json`

Artifacts (`/opt/cursor/artifacts/` and `verifier-app-shell/`):
- 
- 
- 
- 

Cross-branch sanity check — I also ran the same harness against the **plain `app-shell` branch** (= current PR #2 head, without `d717739` "Fix KeyStore bridge probe"). Result: `signin-shown` ok, `app-mounted` ok, then `agents-list-rendered` times out (browser console shows `[EvenAppBridge] postMessage: Flutter handler not available` and the SignIn `setKey` hangs because `bridge.setLocalStorage` waits for a non-existent Flutter handler). Confirmed in `/opt/cursor/artifacts/app-shell-only/verify_console.log`. So the shippable code path requires the `ship-app-shell` head, not `app-shell`.

## Findings

Target acceptance criteria:
- [x] `scaffold`, `cursor-client`, `voice-client`, `glasses-client` branches all merged into the app-shell branch: `git log --oneline` on `ship-app-shell` shows `Merge glasses-client into app-shell`, `Merge voice-client into app-shell`, `Implement Cursor Cloud Agent client (REST + SSE)`, `Implement glasses HUD adapter and page builders`, `Implement voice module …`, plus `Scaffold evencursor rework`. (met)
- [x] Sign-In validates the Cursor API key with `/v1/me` before persisting: `src/ui/SignIn.ts` calls `new CursorClient(key).me()` then `setCursorApiKey/setDeepgramApiKey`; live harness confirms a `GET /v1/me` to `api.cursor.com` returns 200 and the App view mounts immediately afterward. (met)
- [x] Agents list calls `CursorClient#listAgents` and renders results; polls every 10 s: harness shows two `GET /v1/agents?limit=50` requests in sequence (initial + 10 s poll); `src/ui/AgentsList.ts` uses `setInterval(load, 10_000)` with in-flight debounce. (met)
- [x] Selecting an agent opens detail view and attaches to `streamRun` SSE: harness click on `.agent-row` → `.agent-detail` selector becomes visible → `GET /v1/agents/agent_alpha/runs/run_alpha_1/stream` issued and answered with `Content-Type: text/event-stream`; assistant log populated from streamed deltas. (met)
- [x] Voice bar streams mic audio to Deepgram, displays interim transcripts, dispatches parsed slash-commands: not exercised live (no mic in headless VM) but the implementation is wired (`src/ui/VoiceBar.ts`) and `src/voice/__tests__/commands.test.ts` (13 tests) + `deepgram.test.ts` (3) cover the parsing/streaming surface; the VoiceBar mounts in the live screenshot (`verify_03_agents_list.png` shows the "Tap to speak" pill above AgentsList). (met by unit + UI mount evidence)
- [x] GlassesAdapter mirrors agents-list and agent-detail to the HUD when available, no-ops in browser: `src/glasses/adapter.ts` + 4 adapter tests; browser console shows `[EvenAppBridge] postMessage: Flutter handler not available` warnings without breaking anything (KeyStore-fix branch). (met)
- [x] `npm run typecheck`, `npm run build`, and `npm run test` all exit 0: see Execution. (met)
- [x] A draft PR is opened against `main`: PR #2, https://github.com/lexyurk/evencursor/pull/2, draft, base `main`. (met for the *existence* requirement)

Verifier-specific acceptance criteria:
- [x] Verification section contains current exit codes for typecheck/test/build: `typecheck=0`, `test=0` (35 tests), `build=0`.
- [x] Verification section confirms SignIn → AgentsList renders live: stages `signin-shown`, `app-mounted`, `agents-list-rendered (2 rows)` all green in the Playwright run; screenshots `verify_01..03`.
- [x] Verification section confirms AgentDetail attaches SSE on agent click: stages `agent-detail-mounted`, `sse-request-issued`, `sse-response-received (200 text/event-stream)`, `assistant-log-streamed` all green; URL `https://api.cursor.com/v1/agents/agent_alpha/runs/run_alpha_1/stream` recorded in `verify_network.json`.
- [ ] Active PR URL is referenced and its head matches `orch/evencursor-rework/ship-app-shell`: **NOT MET**. The only open PR for this work is PR #2 with head `orch/evencursor-rework/app-shell` (base `main`). The upstream `ship-app-shell` worker submitted a `ManagePullRequest` action to repoint/replace it but flagged it pending user approval and was blocked from doing it via `gh` (403 not accessible by integration). The shippable branch is at `orch/evencursor-rework/ship-app-shell@66826ec` and has all 35 tests green plus live-UI evidence, but the planner still needs to either approve the pending PR action, repoint PR #2 to `ship-app-shell`, or open a new PR.

## Measurements
- `final-typecheck-exit`: 0
- `final-build-exit`: 0
- `total-test-count`: 35

Other findings (severity-ordered):
- (high) PR-head mismatch: PR #2 head is `app-shell`, not `ship-app-shell`. PR #2 in its current state is **not shippable** — the live harness against the plain `app-shell` head hangs at sign-in because of the unguarded `EvenAppBridge.setLocalStorage` call (Flutter handler missing in a plain browser). The fix lives only on `ship-app-shell` (`d717739 Fix KeyStore bridge probe and localStorage fallback`). Planner must point a draft PR at `orch/evencursor-rework/ship-app-shell` before merging anything to `main`.
- (med) Real Cursor account has 0 agents, so a purely-live verification would show an empty AgentsList. The harness paints over this with deterministic fixtures so the rest of the flow is observable; the real `GET /v1/agents` was still issued and returned 200. If/when the operator's account holds agents, the same flow should work unmodified.
- (low) Voice/mic path can't be driven headlessly here (no audio input), but the VoiceBar mounts in the live screenshot and is covered by 16 voice unit tests (parser + DeepgramLive wire-format), so I considered the requirement met.
- (low) `AgentDetail` does a full `innerHTML` re-render on every status SSE event (carried over from upstream's own note). At 1–2 status updates per run this is fine; if a run emits many `status` events the follow-up textarea will lose focus mid-typing.

## Notes & suggestions
- Suggested planner action: either (a) repoint PR #2 from `orch/evencursor-rework/app-shell` to `orch/evencursor-rework/ship-app-shell`, or (b) open a new draft PR with `head=orch/evencursor-rework/ship-app-shell`, `base=main`. My verifier commit `66826ec` on `ship-app-shell` adds only `verifier-app-shell/*` and is safe to either include in or strip from that PR.
- Verifier artifacts committed for reuse: `verifier-app-shell/live_repro.mjs` (Playwright harness), `verifier-app-shell/README.md`, plus the four screenshots and the network/summary JSON. Re-running them locally is `npm install && npx playwright install chromium && (npm run dev &) && node verifier-app-shell/live_repro.mjs`.
- Voice/HUD on-device smoke (G2 hardware + working mic) is still untested; recommended as a follow-up worker before the rework is declared shippable to end-users.
- Consider tightening `AgentDetail` so status SSE events update the badge in place instead of `innerHTML`-rewriting the whole section — keeps the follow-up textarea focused while a run is streaming.