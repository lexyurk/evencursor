import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerUpgrade,
  type EvenAppBridge
} from "@evenrealities/even_hub_sdk";
import { getBridgeIfAvailable } from "../storage/bridge-probe.js";
import {
  buildAgentDetailPage,
  buildAgentListPage,
  buildDetailStatusContent,
  DETAIL_STATUS_CONTAINER_ID,
  DETAIL_STATUS_CONTAINER_NAME
} from "./pages.js";

export type AgentDetailHudArgs = {
  title: string;
  statusLine: string;
  lastDelta: string;
  footer: string;
};

export class GlassesAdapter {
  private bridge: EvenAppBridge | undefined;
  private available = false;
  private startupInitialized = false;
  private detailStatusLine = "";

  async init(): Promise<{ available: boolean }> {
    this.bridge = (await getBridgeIfAvailable()) ?? undefined;
    this.available = this.bridge !== undefined;
    return { available: this.available };
  }

  async showAgentList(rows: string[], footer: string): Promise<void> {
    if (!this.available || !this.bridge) {
      this.noOp("showAgentList", rows, footer);
      return;
    }

    const page = buildAgentListPage(rows, footer);
    if (!this.startupInitialized) {
      await this.bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer(page)
      );
      this.startupInitialized = true;
      return;
    }

    await this.bridge.rebuildPageContainer(new RebuildPageContainer(page));
  }

  async showAgentDetail(args: AgentDetailHudArgs): Promise<void> {
    if (!this.available || !this.bridge) {
      this.noOp("showAgentDetail", args);
      return;
    }

    this.detailStatusLine = args.statusLine;
    await this.bridge.rebuildPageContainer(
      new RebuildPageContainer(buildAgentDetailPage(args))
    );
  }

  async updateDetailDelta(lastDelta: string): Promise<void> {
    if (!this.available || !this.bridge) {
      this.noOp("updateDetailDelta", lastDelta);
      return;
    }

    const content = buildDetailStatusContent(this.detailStatusLine, lastDelta);
    await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: DETAIL_STATUS_CONTAINER_ID,
        containerName: DETAIL_STATUS_CONTAINER_NAME,
        contentOffset: 0,
        contentLength: content.length,
        content
      })
    );
  }

  onSelection(cb: (index: number, name: string) => void): () => void {
    if (!this.available || !this.bridge) {
      this.noOp("onSelection");
      return () => {};
    }

    return this.bridge.onEvenHubEvent((event) => {
      const listEvent = event.listEvent;
      if (!listEvent) {
        return;
      }

      const index = listEvent.currentSelectItemIndex ?? -1;
      const name = listEvent.currentSelectItemName ?? "";
      if (index < 0) {
        return;
      }

      cb(index, name);
    });
  }

  async openMic(onPcm: (frame: Uint8Array) => void): Promise<() => void> {
    if (!this.available || !this.bridge) {
      this.noOp("openMic");
      return () => {};
    }

    await this.bridge.audioControl(true);
    const unsubscribe = this.bridge.onEvenHubEvent((event) => {
      const pcm = event.audioEvent?.audioPcm;
      if (pcm) {
        onPcm(pcm);
      }
    });

    return () => {
      unsubscribe();
      void this.bridge?.audioControl(false);
    };
  }

  async shutdown(): Promise<void> {
    if (!this.available || !this.bridge) {
      this.noOp("shutdown");
      return;
    }

    await this.bridge.shutDownPageContainer(0);
  }

  private noOp(method: string, ...args: unknown[]): void {
    console.debug("[glasses no-op]", method, ...args);
  }
}
