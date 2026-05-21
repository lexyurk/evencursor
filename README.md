# evencursor

Voice-first Even Realities G2 plugin for managing **Cursor Cloud Agents** from the glasses HUD or phone WebView.

The app is a Vite SPA with no local Node bridge. It talks directly to the [Cursor Cloud Agent REST API](https://cursor.com/docs/cloud-agent/api/endpoints), streams live transcription through [Deepgram](https://developers.deepgram.com/docs/live-streaming-audio), and renders glanceable status on the G2 display via [`@evenrealities/even_hub_sdk`](https://www.npmjs.com/package/@evenrealities/even_hub_sdk).

## Architecture

```text
Even Hub WebView (Vite SPA)
  ├── UI (vanilla TypeScript)
  ├── CursorClient → https://api.cursor.com/v1
  ├── DeepgramLive → wss://api.deepgram.com/v1/listen
  └── GlassesAdapter → Even Hub SDK (576×288 HUD)
```

Sign-in is paste-once: a Cursor user API key from [cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations) and a Deepgram API key from the [Deepgram console](https://console.deepgram.com/). Keys persist through the Even App bridge when available, otherwise `window.localStorage`.

## Requirements

- Node.js 20+
- [Even Hub CLI](https://hub.evenrealities.com/docs/reference/cli) for packaging (`evenhub`)
- Cursor Cloud Agent API key
- Deepgram API key

## Development

```bash
npm install
npm run typecheck
npm run dev
```

Open the Vite URL on your phone or in the [Even Hub simulator](https://hub.evenrealities.com/docs/getting-started/overview) for desktop preview. The glasses HUD adapter no-ops in a normal browser when the Even App bridge is absent.

## Even Hub install

1. Build the web app:

   ```bash
   npm run build
   ```

2. Pack the plugin (manifest lives in `public/app.json`; copy it into `dist/` if your bundler does not):

   ```bash
   cp public/app.json dist/app.json
   evenhub pack dist/app.json dist -o evencursor.ehpk
   ```

3. Upload `evencursor.ehpk` through the [Even Hub developer portal](https://hub.evenrealities.com/docs/reference/packaging).

Grant network access to `api.cursor.com` and `api.deepgram.com` as declared in `app.json`. Use `g2-microphone` on device or `phone-microphone` in the simulator.

## Scripts

| Script        | Purpose                          |
|---------------|----------------------------------|
| `npm run dev` | Vite dev server on port 5173     |
| `npm run build` | Typecheck + production bundle  |
| `npm run preview` | Preview production build     |
| `npm run typecheck` | `tsc --noEmit`               |
| `npm run test` | Vitest unit tests               |

## Spec

Implementation details and acceptance criteria: [`docs/spec.md`](docs/spec.md).

## License

MIT
