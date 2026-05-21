const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320;

const WORKLET_SOURCE = `
class PcmDownsamplerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inputRate = options.processorOptions.inputSampleRate;
    this.ratio = this.inputRate / ${TARGET_SAMPLE_RATE};
    this.cursor = 0;
    this.frame = new Int16Array(${FRAME_SAMPLES});
    this.frameIndex = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) {
      return true;
    }

    while (this.cursor < channel.length) {
      const index = Math.floor(this.cursor);
      const nextIndex = Math.min(index + 1, channel.length - 1);
      const fraction = this.cursor - index;
      const sample =
        channel[index] * (1 - fraction) + channel[nextIndex] * fraction;
      const clamped = Math.max(-1, Math.min(1, sample));
      this.frame[this.frameIndex] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      this.frameIndex += 1;

      if (this.frameIndex >= this.frame.length) {
        this.port.postMessage(this.frame.slice());
        this.frameIndex = 0;
      }

      this.cursor += this.ratio;
    }

    this.cursor -= channel.length;
    return true;
  }
}

registerProcessor("pcm-downsampler", PcmDownsamplerProcessor);
`;

function createWorkletUrl(): string {
  const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

export class BrowserMic {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletUrl: string | null = null;

  async start(onPcm: (frame: Int16Array) => void): Promise<void> {
    await this.stop();

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    await this.audioContext.resume();

    this.workletUrl = createWorkletUrl();
    await this.audioContext.audioWorklet.addModule(this.workletUrl);

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-downsampler", {
      processorOptions: {
        inputSampleRate: this.audioContext.sampleRate,
      },
    });

    this.workletNode.port.onmessage = (event: MessageEvent<Int16Array>) => {
      onPcm(event.data);
    };

    this.sourceNode.connect(this.workletNode);
  }

  async stop(): Promise<void> {
    this.workletNode?.port.close();
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }

    if (this.audioContext) {
      await this.audioContext.close();
    }

    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
    }

    this.workletNode = null;
    this.sourceNode = null;
    this.stream = null;
    this.audioContext = null;
    this.workletUrl = null;
  }
}
