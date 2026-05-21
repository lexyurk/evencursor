export type DeepgramTranscript = {
  transcript: string;
  isFinal: boolean;
  speechFinal: boolean;
  words: { word: string; start: number; end: number }[];
};

export type CommandToken = {
  kind: "command";
  verb: string;
  rest: string;
  raw: string;
};

export type TextToken = {
  kind: "text";
  text: string;
};

export type ParsedUtterance = {
  tokens: Array<CommandToken | TextToken>;
  firstCommand: CommandToken | null;
};

export type DeepgramLiveEvents = {
  open: undefined;
  transcript: DeepgramTranscript;
  error: Error;
  close: undefined;
};
