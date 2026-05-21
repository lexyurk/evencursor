import { describe, expect, it } from "vitest";
import { parseTranscript } from "../commands.js";

describe("parseTranscript", () => {
  it("parses slash new with prompt", () => {
    const result = parseTranscript("slash new fix the auth regression");
    expect(result.firstCommand).toEqual({
      kind: "command",
      verb: "new",
      rest: "fix the auth regression",
      raw: "slash new",
    });
    expect(result.tokens).toHaveLength(1);
  });

  it("parses /new with repo and prompt in rest", () => {
    const result = parseTranscript(
      "/new in lexyurk/evencursor fix the auth regression"
    );
    expect(result.firstCommand?.verb).toBe("new");
    expect(result.firstCommand?.rest).toBe(
      "in lexyurk/evencursor fix the auth regression"
    );
    expect(result.firstCommand?.raw).toBe("/new");
  });

  it("parses /cancel", () => {
    const result = parseTranscript("/cancel");
    expect(result.firstCommand).toEqual({
      kind: "command",
      verb: "cancel",
      rest: "",
      raw: "/cancel",
    });
  });

  it("parses /follow up with collapsed verb", () => {
    const result = parseTranscript("/follow up add a test for null user");
    expect(result.firstCommand).toEqual({
      kind: "command",
      verb: "followup",
      rest: "add a test for null user",
      raw: "/follow up",
    });
  });

  it("parses slash archive and slash delete", () => {
    expect(parseTranscript("slash archive").firstCommand?.verb).toBe("archive");
    expect(parseTranscript("/delete").firstCommand?.verb).toBe("delete");
    expect(parseTranscript("slash unarchive").firstCommand?.verb).toBe(
      "unarchive"
    );
  });

  it("parses /refresh", () => {
    const result = parseTranscript("/refresh");
    expect(result.firstCommand?.verb).toBe("refresh");
    expect(result.firstCommand?.rest).toBe("");
  });

  it("parses /select with index", () => {
    const result = parseTranscript("/select 2");
    expect(result.firstCommand).toEqual({
      kind: "command",
      verb: "select",
      rest: "2",
      raw: "/select",
    });
  });

  it("parses /open with repo", () => {
    const result = parseTranscript("/open lexyurk/evencursor");
    expect(result.firstCommand).toEqual({
      kind: "command",
      verb: "open",
      rest: "lexyurk/evencursor",
      raw: "/open",
    });
  });

  it("parses /sign in with collapsed verb", () => {
    const result = parseTranscript("/sign in");
    expect(result.firstCommand).toEqual({
      kind: "command",
      verb: "signin",
      rest: "",
      raw: "/sign in",
    });
  });

  it("returns text-only tokens for free-form dictation", () => {
    const result = parseTranscript("draft a follow-up for the auth bug");
    expect(result.firstCommand).toBeNull();
    expect(result.tokens).toEqual([
      { kind: "text", text: "draft a follow-up for the auth bug" },
    ]);
  });

  it("tolerates slash word with mixed case", () => {
    const result = parseTranscript("Slash NEW fix it");
    expect(result.firstCommand?.verb).toBe("new");
    expect(result.firstCommand?.rest).toBe("fix it");
    expect(result.firstCommand?.raw).toBe("slash NEW");
  });

  it("is case-insensitive on slash commands", () => {
    const result = parseTranscript("/FOLLOW UP ship the fix");
    expect(result.firstCommand?.verb).toBe("followup");
    expect(result.firstCommand?.rest).toBe("ship the fix");
  });

  it("preserves leading text before a command", () => {
    const result = parseTranscript("please /cancel now");
    expect(result.tokens).toEqual([
      { kind: "text", text: "please " },
      {
        kind: "command",
        verb: "cancel",
        rest: "now",
        raw: "/cancel",
      },
    ]);
    expect(result.firstCommand?.verb).toBe("cancel");
  });

  it("trims trailing whitespace", () => {
    const result = parseTranscript("/new fix it   ");
    expect(result.firstCommand?.rest).toBe("fix it");
  });
});
