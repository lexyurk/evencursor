import type { CommandToken, ParsedUtterance, TextToken } from "./types.js";

const VERB_PATTERNS: { pattern: RegExp; verb: string }[] = [
  { pattern: /^follow\s+up\b/i, verb: "followup" },
  { pattern: /^sign\s+out\b/i, verb: "signout" },
  { pattern: /^sign\s+in\b/i, verb: "signin" },
  { pattern: /^new\b/i, verb: "new" },
  { pattern: /^cancel\b/i, verb: "cancel" },
  { pattern: /^refresh\b/i, verb: "refresh" },
  { pattern: /^select\b/i, verb: "select" },
  { pattern: /^open\b/i, verb: "open" },
];

function matchVerb(text: string): { verb: string; consumed: number } | null {
  const trimmed = text.trimStart();
  for (const { pattern, verb } of VERB_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      return { verb, consumed: match[0].length };
    }
  }
  return null;
}

function findCommandStart(text: string): { prefixEnd: number; bodyStart: number } | null {
  const slashIndex = text.indexOf("/");
  const slashWord = text.match(/\bslash\b/i);
  const slashWordIndex = slashWord?.index ?? -1;

  if (slashIndex === -1 && slashWordIndex === -1) {
    return null;
  }

  if (slashIndex !== -1 && (slashWordIndex === -1 || slashIndex <= slashWordIndex)) {
    return { prefixEnd: slashIndex, bodyStart: slashIndex + 1 };
  }

  return {
    prefixEnd: slashWordIndex,
    bodyStart: slashWordIndex + slashWord![0].length,
  };
}

function parseCommandBody(body: string, rawPrefix: string): CommandToken | null {
  const matched = matchVerb(body);
  if (!matched) {
    return null;
  }

  const rest = body.slice(matched.consumed).trimStart();
  const rawBody = body.slice(0, matched.consumed).trimEnd();
  const raw = rawPrefix === "slash" ? `slash ${rawBody}` : `/${rawBody}`;

  return {
    kind: "command",
    verb: matched.verb,
    rest,
    raw,
  };
}

export function parseTranscript(text: string): ParsedUtterance {
  const normalized = text.replace(/\s+$/, "");
  const commandStart = findCommandStart(normalized);

  if (!commandStart) {
    return {
      tokens: normalized.length > 0 ? [{ kind: "text", text: normalized }] : [],
      firstCommand: null,
    };
  }

  const leadingText = normalized.slice(0, commandStart.prefixEnd);
  const rawPrefix = normalized[commandStart.prefixEnd] === "/" ? "/" : "slash";
  const body = normalized.slice(commandStart.bodyStart).trimStart();
  const command = parseCommandBody(body, rawPrefix);

  if (!command) {
    const tokens: Array<TextToken | CommandToken> = [];
    if (leadingText.length > 0) {
      tokens.push({ kind: "text", text: leadingText });
    }
    tokens.push({ kind: "text", text: normalized.slice(commandStart.prefixEnd) });
    return { tokens, firstCommand: null };
  }

  const tokens: Array<TextToken | CommandToken> = [];
  if (leadingText.length > 0) {
    tokens.push({ kind: "text", text: leadingText });
  }
  tokens.push(command);

  return {
    tokens,
    firstCommand: command,
  };
}
