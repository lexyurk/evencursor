# Product Notes

## One-Liner

evencursor is a voice inbox for Cursor Agent sessions on Even Realities glasses.

## User

The first user is a developer/operator who already runs Cursor Agent and wants to keep agent work moving while away from a full keyboard.

## Core Loop

1. User dictates a Cursor task.
2. evencursor shows a compact task draft.
3. User confirms.
4. Cursor Agent runs in a local workspace, preferably in a worktree.
5. If Cursor needs human input, evencursor normalizes that into a short question.
6. User answers by voice.
7. Cursor resumes.

## Design Rule

The HUD never shows full logs. It shows:

- status;
- blocker;
- question;
- short answer draft;
- final artifact summary.

## First Good Demo

From glasses or phone:

1. Dictate: "Cursor, in this repo, inspect why the auth tests fail. Use a worktree. Ask before changing backend auth."
2. Launch session.
3. Cursor returns a clarification question.
4. Glasses show the question.
5. User answers: "Inspect first. Do not patch auth yet."
6. Cursor resumes.

## Open Questions

- Whether Even Hub mic control exposes enough audio for reliable native dictation.
- Whether Cursor ACP should replace CLI resume for long-lived interactive sessions.
- How much session history should be stored locally.
- What auth model is appropriate for remote operation.
