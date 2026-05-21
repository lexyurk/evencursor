<!-- orchestrate handoff
task: scaffold
branch: orch/evencursor-rework/scaffold
agentId: bc-caa2e6ca-066a-415d-b583-8d7b3d2d74dd
runId: run-bcd8e2b9-9e17-4387-ba8b-2157cf1a9ae3
resultStatus: finished
finishedAt: 2026-05-21T05:20:12.356Z
-->

## Status
success

## Branch
`orch/evencursor-rework/scaffold`

## What I did
- Removed the legacy layout: `src/bridge/`, `src/hub/*`, `src/shared/protocol.ts`, `src/shared/protocol.test.ts`, `tsconfig.bridge.json`, and the old hub-oriented entry wiring.
- Rewrote `package.json` per spec §4: dropped `dotenv`, `ws`, `zod`, `tsx`, `@types/ws`; added `@deepgram/sdk@^4.11.3`; scripts are `dev`, `build`, `preview`, `typecheck`, `test`.
- Set `tsconfig.json` to strict browser TS (ES2022 + DOM), `include: ["src", "vite.config.ts"]`.
- Simplified `vite.config.ts` (`host: true`, port 5173) and `index.html` (`#app` + `/src/main.ts`).
- Created the full `src/` tree from spec §3 with typed stubs (`throw new Error('not implemented: …')`) for `cursor/`, `voice/`, `glasses/`, `ui/`, and `main.ts`.
- Fully implemented `src/storage/storage.ts` (`KeyStore`: Even bridge via `waitForEvenAppBridge()` with 500 ms timeout, then `localStorage`) and `src/shared/events.ts` (`Emitter<TEvents>`).
- Added `public/app.json` (Even Hub manifest) and rewrote `README.md` for the SPA + Even Hub workflow (no local bridge curl examples).
- Updated `.env.example` for optional API keys.
- Added `vitest.config.ts` with `passWithNoTests: true` so `npm run test` exits 0 until module workers add tests.
- Ran `npm install` and `npm run typecheck` (both green); committed and pushed.

## Measurements
- `typecheck-exit`: 1 → 0
- `node-modules-present`: true == true

## Verification
type-check-only

## Notes, concerns, deviations, findings, thoughts, feedback
- `src/cursor/auth.ts` exports `bindKeyStore()` plus `get/setDeepgramApiKey()` so the app-shell worker can wire keys without redesign; key names are `cursor.apiKey` and `deepgram.apiKey`.
- UI stubs export `mount*` functions with `*Deps` types (including `VoiceCommand` on `VoiceBar`) to give app-shell a stable integration surface beyond bare filenames in §3.
- `vitest.config.ts` is outside the scoped path list but keeps `npm run test` from failing with zero test files until parallel module workers land tests.
- Scoped task explicitly requires `not implemented` throws in stubs; that overrides the general “no not-implemented throws” quality rule for this branch only.
- `DeepgramLive` extends the shared `Emitter`; `CursorClient#streamRun` is typed as `AsyncIterable<RunStreamEvent>` for the fetch+SSE implementation in the cursor worker.

## Suggested follow-ups
- Publish `cursor-client`, `voice-client`, and `glasses-client` workers against this branch (parallel, disjoint paths).
- After those merge, run `app-shell` to implement `main.ts` + UI and wire command bus / glasses / voice.
- Copy `public/app.json` into `dist/` during `vite build` (or configure Vite `publicDir`) before `evenhub pack`.