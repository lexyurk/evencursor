# Blocked on `CURSOR_API_KEY`

- **Root planner cloud-agent id:** `bc-05eb7a1b-69c0-444c-85d1-a4ae763ef4d5`
- **Branch:** `cursor/orchestrate-evencursor-rework-f4d5`
- **Status:** `plan.json` is written and committed; the reconcile loop cannot start.

## What happens when the loop runs

```bash
$ bun cli.ts run --root /workspace/.orchestrate/evencursor
CURSOR_API_KEY required; see cursor-sdk/references/auth.md
$ echo $?
2
```

The orchestrate scripts (and the `@cursor/sdk` they sit on) abort before reading `plan.json` because no API key is available in this cloud-agent VM:

```
CLOUD_AGENT_INJECTED_SECRET_NAMES=ANTHROPIC_API_KEY,LINEAR_API_KEY,OPENAI_API_KEY,GOOGLE_API_KEY
```

No spawn surface exists without that key, so no workers can be created and no `state.json` is initialized.

## Remediation

Add a user API key (`crsr_…`) from <https://cursor.com/dashboard/integrations> to **Cursor Dashboard → Cloud Agents → Secrets** under the name `CURSOR_API_KEY`. The next cloud-agent invocation will pick it up automatically and the same `bun cli.ts run --root .orchestrate/evencursor` invocation will:

1. Initialize `state.json` from `plan.json`.
2. Spawn `foundation-protocol-and-docs` first (no dependencies).
3. Then in parallel: `cursor-cloud-client`, `ui-glasses-layout`, `voice-substrate` (subplanner).
4. Then `auth-signin-cursor` (depends on `cursor-cloud-client`).
5. Finally `integration-merge` (depends on all of the above).

If GitHub is not linked for the same user, cloud agents will fail with `ERROR_GITHUB_NO_USER_CREDENTIALS`; link GitHub once in the Cursor dashboard for the same user.

## Why this turn ends here

The orchestrate skill explicitly forbids planners from coding. With no way to spawn workers, the only honest move is to commit the plan, document the blocker, and hand back so the operator can unblock the substrate.
