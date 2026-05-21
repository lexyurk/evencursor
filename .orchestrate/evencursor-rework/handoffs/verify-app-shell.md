<!-- orchestrate handoff
task: verify-app-shell
branch: `orch/evencursor-rework/app-shell` (verifier artifacts committed at `ed8282c`)
agentId: bc-7a438b43-dd85-4682-b64e-1d9d9f2ae20c
runId: run-7c24c54c-26fa-41d3-b91a-f4ddcd42339a
resultStatus: finished
finishedAt: 2026-05-21T05:42:38.014Z
-->

Now I'll write the final verifier handoff.

## Verification
verifier-failed

## Target
`app-shell` on branch `orch/evencursor-rework/app-shell`

## Branch
`orch/evencursor-rework/app-shell` (verifier artifacts committed at `ed8282c`)

## Execution
- `rm -rf node_modules && npm install` on the worker's HEAD (`f96b0dc`) → exit 0, 71 packages.
- `npm run typecheck` → exit 0 (final-typecheck-exit = 0).
- `npm run test` → exit 0, **28 passed (5 files)**, no skips. After my verifier commit: `git ls-files src/**/*.test.ts` is unchanged; `npm run test` still 28/28.
- `npm run build` → exit 0, `dist/index.html 0.39 kB`, `dist/assets/index-…js 98.61 kB`, `dist/assets/index-…css 3.53 kB` (final-build-exit = 0).
- `git log --oneline` → confirms scaffold → cursor-client → voice-client → glasses-client → app-shell merge chain.
- `gh pr list --head orch/evencursor-rework/app-shell` → PR #2 exists, draft, base `main`, title **"Rework evencursor onto Cursor Cloud Agents + Deepgram + Even Hub HUD"** (matches the prompt verbatim). Body includes spec link, merged-branch list, build console output, and the §9 acceptance checklist.
- Started Vite dev server (`npm run dev`) on `:5173` and headless Chrome (`google-chrome --headless=new --remote-debugging-port=9222`) for live UI verification (commit `f96b0dc` and again on my verifier commit `ed8282c`).
- Live SignIn (`.verifier/signin_live.mjs`): pasted real `CURSOR_API_KEY` (env-injected) + fake Deepgram key → status `appShell` reached → `/v1/me` succeeded → SignIn screen swapped for App shell. Captured screenshot `signin_screen.png`.
- Live SignIn → AgentsList (`.verifier/signin_live.mjs`): waited 15s+ for `.voice-bar` and `.agents-list` after the swap → **timeout, neither selector ever appears**. Capture: `app_shell_stuck_after_signin.png` (only the header + "Sign out" button render).
- Diagnose (`.verifier/diagnose_keystore.mjs`): probed the SDK's bridge after sign-in. `waitForEvenAppBridge()` resolves to a bridge object even with no Flutter container; `bridge.setLocalStorage("verifier_probe","hello") → false`; `bridge.getLocalStorage("cursor.apiKey") → ""`; `localStorage` keys: `[]`. Console captures `[EvenAppBridge] postMessage: Flutter handler not available` repeatedly.
- VoiceBar command-bus harness (`.verifier/voicebar_harness.spec-only.ts`, jsdom + vitest): mounts the real `mountVoiceBar` with mocked `DeepgramLive` / `BrowserMic` / `getDeepgramApiKey`, simulates `speech_final` events, asserts the right `VoiceCommand` reaches the `onCommand` bus → **7/7 pass** (`/refresh`, `/select 3`, `slash new fix the auth regression`, `/follow up …`, `/sign out`, interim no-dispatch, free-form ignored).

## Findings

Per acceptance criterion:
- [x] **scaffold/cursor-client/voice-client/glasses-client merged into app-shell**: met (live, via `git log --oneline -20`, sees `Merge glasses-client into app-shell`, `Merge voice-client into app-shell`, plus the consolidated `Merge module branches and implement app-shell UI` commit).
- [x] **Sign-In screen validates the Cursor API key with `/v1/me` before persisting**: met live — real key from `CURSOR_API_KEY` env var produced a successful `/v1/me` call and the App shell mounted. Both deep-links match spec (`https://cursor.com/dashboard/integrations`, `https://console.deepgram.com/project/_/api-keys`).
- [ ] **Agents list page calls `CursorClient#listAgents` and renders results; polls every 10 s**: **not met live**. After SignIn, `.agents-list` is never inserted. `App.boot()` in `src/ui/App.ts` returns early because `await getCursorApiKey()` resolves to `undefined` — keys were never persisted (see "high"-severity finding below). Code path looks correct in source (10 s `setInterval`, in-flight debounce) but it can't run.
- [ ] **Selecting an agent opens detail view and attaches to `streamRun` SSE**: **not met live** (no list to select from in dev mode). Source review confirms `streamRun` uses `fetch` with `Authorization: Basic …` and an `AbortController` (correct per the gotcha), and `AgentDetail` closes the stream on terminal status. Not exercisable in dev.
- [x] **Voice bar streams mic audio to Deepgram, displays interim transcripts, and dispatches parsed slash-commands**: only the dispatch half is verifiable in this env. **Unit-verified** for `parseTranscript → VoiceCommand` round-trip (7/7 harness tests). Mic→Deepgram WS and interim transcript display are **blocked** (VoiceBar never mounts in dev mode; headless Chrome has no real mic anyway).
- [x] **GlassesAdapter mirrors agents-list and agent-detail to the HUD when available, silently no-ops in browser dev mode**: code-reviewed + unit-tested (`src/glasses/__tests__/*` runs in `npm run test`). On-device mirroring not testable here; the in-browser console emits `[glasses no-op] showAgentList …` correctly when bridge is undetected — but this exposes the same bug below: the SDK *does* return a bridge instance in browser, so `available=true` and `showAgentList` quietly fails through `postMessage`. Not technically a no-op, but harmless.
- [x] **`npm run typecheck`, `npm run build`, and `npm run test` all exit 0**: met. typecheck=0, build=0, test=0 with 28 passing tests on a fresh `npm install` (final-typecheck-exit=0, final-build-exit=0, total-test-count=28).
- [x] **A draft PR is opened against `main` with the rework summary**: met. PR #2 (draft, base `main`, correct title), body links spec, lists merged branches, includes build console snippet, and replicates the §9 checklist.

Other findings (severity-ordered):

- **(high) Live UI in `npm run dev` is broken: SignIn → App boot leaves an empty shell.**
  - Symptom: After a successful `/v1/me` validation the App shell mounts only the header (`evencursor` + `Sign out`); `.voice-bar` and `.agents-list` never appear.
  - Root cause: `KeyStore` (`src/storage/storage.ts`) and `GlassesAdapter` (`src/glasses/adapter.ts`) both call `waitForEvenAppBridge()` with a 500 ms timeout race. The SDK's auto-initialised singleton **always** resolves the promise (a global "Bridge initialized" object is published at DOMContentLoaded), so the race always picks the bridge — even when there is no Flutter host. Once the bridge wins the race, the `localStorage` fallback path in `KeyStore.getKey/setKey` is unreachable. `bridge.setLocalStorage(...)` returns `false` and `bridge.getLocalStorage(...)` returns `""`, so `SignIn`'s `setCursorApiKey` silently no-ops; `App.boot`'s `await getCursorApiKey()` resolves to `undefined`; the `if (!apiKey || …) return;` guard fires; nothing else mounts.
  - Evidence: `.verifier/diagnose_keystore.mjs` output shows `setResult: false`, `getResult: ""`, `localStorageKeys: []`, plus repeated `[EvenAppBridge] postMessage: Flutter handler not available` console warnings. Screenshot `app_shell_stuck_after_signin.png`.
  - This regresses **`docs/spec.md` §1** ("falls back to `window.localStorage` in the browser") and **§9.3** ("`npm run dev` opens, the Sign-In screen renders, pasting a Cursor API key + Deepgram key persists and unlocks the Agents screen"), and indirectly invalidates §9.4–§9.7 in dev mode.
  - Suggested fix direction (planner / next worker): probe the bridge with a real round-trip (e.g. `set` then `get` a sentinel key, or detect `flutter_inappwebview_callHandler`) before treating it as available; or always write *both* paths in `KeyStore` (bridge + `window.localStorage`) and read from the first non-empty source. The same probe should drive `GlassesAdapter.available` so glasses mirroring isn't reported as available when it's actually a no-op.

- **(med) Verification plan's §"Manual" steps cannot be executed against the worker's branch as-is.**
  - The plan asks the verifier to "Paste a Cursor API key (validates) and a Deepgram key; AgentsList renders.", "Click an agent; AgentDetail opens; SSE stream connects", "Press the mic button; speak `slash refresh`". None of these steps reach a working state in dev mode because of the bug above.

- **(low) `.orchestrate/` removal is fine but PR body's checklist self-marks `Glasses adapter HUD updates` as `[x]` while marking interactive flows as `(manual)`.** Given the bridge-detection bug, the `[x]` is misleading: in browser dev mode `available=true` but `showAgentList` invocations silently fail through `postMessage`. Not blocking, but worth tightening once the persistence path is fixed.

- **(low) Worker test counts preserved.** `cursor-test-count` 6, `voice-test-count` 13 (file `commands.test.ts`) + 3 (`deepgram.test.ts`) = 16, `glasses-test-count` 3 + 3 = 6. Aggregate matches the worker's `total-test-count`: **28**, no regression. (`final-typecheck-exit`: 0, `final-build-exit`: 0, `total-test-count`: 28.)

## Notes & suggestions
- The SignIn deep links and `/v1/me` validation flow are correct; the failure is purely in persistence + bridge detection. The simplest unblock is to short-circuit `KeyStore` to use `window.localStorage` when a sentinel round-trip via `bridge` returns `false`/`""`. That restores §9.3 immediately and makes the rest of the live verification plan executable. (Spec §12's note "Even Hub WebView may inject `window.evenAppBridge` asynchronously; `init()` must wait briefly before declaring unavailable" was implemented as a *time race* but should also include a *capability probe*, since the SDK now resolves immediately even on browser-only.)
- Verifier artifacts committed at `.verifier/` (commit `ed8282c`): `signin_live.mjs`, `diagnose_keystore.mjs`, `screenshot_stuck.mjs`, `voicebar_harness.spec-only.ts`, plus a local `vitest.config.ts` and `package.json` so `cd .verifier && npm install && npm run harness` is a one-shot repro of the parseTranscript→command-bus round-trip. The spec-suffix is `.spec-only.ts` (not `.spec.ts`/`.test.ts`) deliberately so workspace `npm run test` does not pick it up — test count stays at 28.
- Screenshots saved at `/opt/cursor/artifacts/signin_screen.png` and `/opt/cursor/artifacts/app_shell_stuck_after_signin.png` (the second is the smoking gun for the high-severity finding).
- PR #2 title and body are correct as-is; no PR-side changes required from this verifier (and per branch discipline I did not touch it).
- Dev server (`vite`) and headless Chrome are still running on the VM (per "do not kill apps" guidance), in tmux sessions `vite-dev` and `chrome`, in case the planner / next worker wants to attach and continue.