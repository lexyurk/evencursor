export class BrowserMic {
  async start(onPcm: (frame: Int16Array) => void): Promise<void> {
    throw new Error("not implemented: start");
  }

  async stop(): Promise<void> {
    throw new Error("not implemented: stop");
  }
}
