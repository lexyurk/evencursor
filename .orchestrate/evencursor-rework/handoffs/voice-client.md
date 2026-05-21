<!-- orchestrate handoff
task: voice-client
branch: orch/evencursor-rework/voice-client
agentId: bc-9b1ca8c4-7c0e-4dde-b8bf-7fe76b9c33f2
runId: run-675132b7-9c26-4566-9460-d763e6588740
resultStatus: finished
finishedAt: 2026-05-21T05:21:53.207Z
-->

## Status
success

## Branch
`orch/evencursor-rework/voice-client`

## What I did
- Merged upstream `orch/evencursor-rework/scaffold` into the voice-client branch to get the new SPA tree and shared `Emitter`.
- Implemented `src/voice/commands.ts` — `parseTranscript()` with `/` and literal `slash` prefixes, case-insensitive verbs, multi-word collapse (`follow up` → `followup`, `sign in` → `signin`), leading text tokens, and trailing-whitespace trim.
- Implemented `src/voice/deepgram.ts` — `DeepgramLive` WebSocket client using `new WebSocket(url, ['token', apiKey])` (key never in URL), PCM forwarding, 8s `KeepAlive`, graceful `CloseStream`, and `Results` → `transcript` event parsing.
- Implemented `src/voice/mic.ts` — `BrowserMic` with `getUserMedia`, `AudioContext`, and a Blob-loaded `AudioWorkletProcessor` that linearly resamples device-rate Float32 to 16 kHz mono Int16 frames.
- Left `src/voice/types.ts` as scaffolded (already matched the contract).
- Added `src/voice/__tests__/commands.test.ts` (13 cases covering every spec §7 row plus slash/case/whitespace variants) and `src/voice/__tests__/deepgram.test.ts` (3 cases: subprotocol auth, PCM send, Results parse).

## Measurements
- `voice-test-count`: 0 → 16
- `npm run typecheck`: fail → pass (exit 0)
- `npm run test -- src/voice`: 0 passing → 16 passing

## Verification
unit-test-verified

## Notes, concerns, deviations, findings, thoughts, feedback
- `BrowserMic` resamples explicitly in the worklet using `audioContext.sampleRate` passed via `processorOptions`, since Safari ignores `AudioContext({ sampleRate: 16000 })`.
- Command `raw` preserves the matched prefix form (`/new` vs `slash new`) and original verb casing from the transcript (e.g. `slash NEW` → `raw: "slash NEW"`).
- `parseTranscript` only handles the first command in an utterance; downstream app-shell is expected to consume `firstCommand` on `speech_final` per spec §6.
- Did not modify `package.json` / lockfile beyond what the scaffold merge brought in (`@deepgram/sdk` already present).

## Suggested follow-ups
- Wire `DeepgramLive` + `BrowserMic` + `parseTranscript` in `app-shell` (`main.ts` / `VoiceBar.ts`) with `speech_final` command dispatch.
- Add integration test or manual dev check for mic → Deepgram round-trip once Deepgram key is available.
- Consider exporting a small `VoiceSession` facade that bundles mic + deepgram + keepAlive lifecycle for app-shell.