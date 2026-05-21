# Verifier artifacts for `app-shell`

These scripts repro the verification findings for the `app-shell` task on
branch `orch/evencursor-rework/app-shell`.

## Setup

```bash
cd .verifier
npm install
```

Run a headless Chrome with a remote debugging port the puppeteer scripts
connect to:

```bash
google-chrome --headless=new --disable-gpu --no-sandbox \
  --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile \
  about:blank
```

Start the dev server in another shell:

```bash
cd ..
npm run dev
```

Then run the scripts below.

## Live UI repro: SignIn → App.boot stuck state

`signin_live.mjs` pastes `CURSOR_API_KEY` (from env) plus a fake Deepgram
key, clicks **Validate & save**, and asserts that `.voice-bar` and
`.agents-list` mount inside 15 s.

```bash
CURSOR_API_KEY="..." node signin_live.mjs
```

**Expected**: passes.
**Observed (this verification run)**: `.app-shell` mounts but neither
`.voice-bar` nor `.agents-list` ever appear. `App.boot()` returns early
because `getCursorApiKey()` resolves to `undefined`.

## Diagnose: Even Hub bridge is non-functional in browser

`diagnose_keystore.mjs` reproduces the same flow, then asks the SDK
directly for `bridge.setLocalStorage("verifier_probe", "hello")` and
`bridge.getLocalStorage("cursor.apiKey")`.

```bash
CURSOR_API_KEY="..." node diagnose_keystore.mjs
```

Observed output (truncated):

```
{
  "bridgeResolved": true,
  "setResult": false,
  "getResult": "",
  "getCursor": "",
  "localStorageKeys": [],
  ...
}
```

The SDK's auto-initialised singleton resolves `waitForEvenAppBridge()` to
a real bridge object even with no Flutter container. `setLocalStorage`
returns `false` (no Flutter handler), `getLocalStorage` always returns
`""`, and the KeyStore never falls back to `window.localStorage` — so
`getCursorApiKey()` reads `undefined`, App.boot returns early, and the
core HUD components never mount.

This breaks `docs/spec.md` §9.3.

## parseTranscript → VoiceBar command bus round-trip

`voicebar_harness.spec-only.ts` mounts `VoiceBar` with `DeepgramLive` and
`BrowserMic` mocked, simulates `speech_final` chunks, and asserts the
right `VoiceCommand` is dispatched on the command bus. Covers `/refresh`,
`/select N`, `/new …`, `/follow up …`, `/sign out`, interim transcripts
(no dispatch), and free-form text (no dispatch).

```bash
npx vitest run --config .verifier/vitest.config.ts
```

Result: 7/7 tests pass.
