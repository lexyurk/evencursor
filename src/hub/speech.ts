export type DictationResult = {
  supported: boolean;
  start: (onFinal: (text: string) => void, onPartial?: (text: string) => void) => void;
  stop: () => void;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export function createDictation(language = "en-US"): DictationResult {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Recognition) {
    return {
      supported: false,
      start: () => undefined,
      stop: () => undefined
    };
  }

  let recognition: SpeechRecognitionLike | undefined;

  return {
    supported: true,
    start: (onFinal, onPartial) => {
      recognition?.stop();
      recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language;
      recognition.onresult = (event) => {
        let partial = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0].transcript.trim();
          if (result.isFinal) {
            onFinal(transcript);
          } else {
            partial += transcript;
          }
        }
        if (partial && onPartial) {
          onPartial(partial);
        }
      };
      recognition.start();
    },
    stop: () => recognition?.stop()
  };
}
