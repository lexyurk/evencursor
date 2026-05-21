<!-- orchestrate handoff
task: cursor-client
branch: orch/evencursor-rework/cursor-client
agentId: bc-dbb0d394-eeb9-4611-aed1-7046dc81cc7e
runId: run-8428c1f3-4a6e-4c3c-89a4-5053ea34832f
resultStatus: finished
finishedAt: 2026-05-21T05:22:25.444Z
-->

## Status
success

## Branch
`orch/evencursor-rework/cursor-client`

## What I did
- **`src/cursor/client.ts`** — Full `CursorClient`: `me`, `listAgents`, `getAgent`, `createAgent`, `listRuns`, `getRun`, `createRun`, `cancelRun`, `listRepositories`; shared `request()` with Basic auth, JSON error parsing into `CursorApiError`, and `withRetry()` (3 attempts, exponential backoff on 429/5xx). `streamRun` uses `fetch` + `ReadableStream` reader (no `EventSource`), manual SSE block parsing (`parseSseBlocks` / `mapSseBlockToRunStreamEvent`), `Last-Event-ID` support, and `StreamExpiredError` on HTTP 410.
- **`src/cursor/types.ts`** — Left scaffold types as-is (`Agent`, `Run`, `RunStatus`, `RunStreamEvent` union, `CreateAgentInput`, `CreateRunInput`, `CursorApiError`, `StreamExpiredError`).
- **`src/cursor/auth.ts`** — Left scaffold as-is (`getCursorApiKey` / `setCursorApiKey` via `bindKeyStore` + `cursor.apiKey`, `basicAuthHeader` with `btoa(apiKey + ":")`).
- **`src/cursor/__tests__/client.test.ts`** — Vitest with mocked `fetch`: Basic auth header, 401 error body parsing, SSE fragment splitting/mapping, chunk-boundary remainder, `withRetry` on 429.

## Measurements
- `cursor-test-count`: 0 → 6
- `typecheck-exit`: 0 == 0
- `npm run test -- src/cursor`: 0 passing → 6 passing

## Verification
unit-test-verified

## Notes, concerns, deviations, findings, thoughts, feedback
- Branch based on `origin/orch/evencursor-rework/scaffold`; `types.ts` and `auth.ts` were already complete there — only `client.ts` replaced stubs.
- `parseSseBlocks`, `mapSseBlockToRunStreamEvent`, and `withRetry` are exported from `client.ts` for focused unit tests (no network).
- `auth.ts` keeps scaffold’s `bindKeyStore()` indirection (app-shell must call it before `getCursorApiKey`); also retains Deepgram key helpers for downstream wiring.
- API response normalizers tolerate both camelCase and snake_case list cursors and wrapped `{ agent, run }` bodies without exporting `any`.

## Suggested follow-ups
- Merge parallel workers (`voice-client`, `glasses-client`) then run `app-shell` to wire `main.ts` + UI.
- Add an integration test against a recorded full `streamRun` response once a fixture is available.
- Confirm live API field names against OpenAPI if list/create responses differ from assumptions in normalizers.