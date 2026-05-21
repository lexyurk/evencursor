export type AgentDetailHudArgs = {
  title: string;
  statusLine: string;
  lastDelta: string;
  footer: string;
};

export class GlassesAdapter {
  async init(): Promise<{ available: boolean }> {
    throw new Error("not implemented: init");
  }

  async showAgentList(rows: string[], footer: string): Promise<void> {
    throw new Error("not implemented: showAgentList");
  }

  async showAgentDetail(args: AgentDetailHudArgs): Promise<void> {
    throw new Error("not implemented: showAgentDetail");
  }

  async updateDetailDelta(lastDelta: string): Promise<void> {
    throw new Error("not implemented: updateDetailDelta");
  }

  onSelection(cb: (index: number, name: string) => void): () => void {
    throw new Error("not implemented: onSelection");
  }

  async openMic(onPcm: (frame: Uint8Array) => void): Promise<() => void> {
    throw new Error("not implemented: openMic");
  }

  async shutdown(): Promise<void> {
    throw new Error("not implemented: shutdown");
  }
}
