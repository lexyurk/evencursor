# app-shell verifier harness

Live UI verification for the `app-shell` task on `orch/evencursor-rework/ship-app-shell`.

## What it does

1. Boots the Vite dev server (caller responsibility — start with `npm run dev`
   before invoking the harness).
2. Launches headless Chromium via Playwright, sized to a phone viewport.
3. Routes `**/api.cursor.com/**`:
   - `/v1/me` passes through to the real Cursor API when `CURSOR_API_KEY` is
     exported, so we exercise the real `/v1/me` validation path.
   - `/v1/agents`, `/v1/agents/.../runs`, and
     `/v1/agents/.../runs/.../stream` are intercepted with deterministic
     fixtures so we can verify the SignIn → AgentsList → AgentDetail flow
     without depending on which agents the operator's account has.
4. Walks the SignIn screen, validates the key, clicks the first agent, and
   asserts the `text/event-stream` fetch is observed for the run stream
   endpoint.
5. Writes screenshots + a JSON summary to `/opt/cursor/artifacts/` for the
   planner.

## Run

```bash
npm install
npx playwright install chromium
npm run dev &
node verifier-app-shell/live_repro.mjs
```

Outputs:

- `verify_01_signin.png` — SignIn rendered.
- `verify_02_signin_filled.png` — keys pasted.
- `verify_03_agents_list.png` — AgentsList rendered with 2 rows.
- `verify_04_agent_detail.png` — AgentDetail mounted with the SSE-driven
  assistant log populated.
- `verify_summary.json` — stage-by-stage pass/fail summary.
- `verify_network.json` — relevant `api.cursor.com` requests.
- `verify_console.log` — browser console output.
