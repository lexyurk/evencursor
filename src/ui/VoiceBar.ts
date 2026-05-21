export type VoiceCommand =
  | { verb: "new"; rest: string }
  | { verb: "cancel" }
  | { verb: "followup"; rest: string }
  | { verb: "refresh" }
  | { verb: "select"; index: number }
  | { verb: "open"; repo: string }
  | { verb: "signin" }
  | { verb: "signout" };

export type VoiceBarDeps = {
  root: HTMLElement;
  onCommand: (command: VoiceCommand) => void;
  openGlassesMic?: () => Promise<() => void>;
};

export function mountVoiceBar(_deps: VoiceBarDeps): () => void {
  throw new Error("not implemented: mountVoiceBar");
}
