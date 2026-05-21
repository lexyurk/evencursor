import {
  CreateStartUpPageContainer,
  OsEventTypeList,
  RebuildPageContainer,
  TextContainerUpgrade,
  type EvenAppBridge,
  type EvenHubEvent
} from "@evenrealities/even_hub_sdk";
import { getBridgeIfAvailable } from "../storage/bridge-probe.js";
import {
  buildAgentDetailPage,
  buildAgentListPage,
  buildDetailStatusContent,
  buildVoicePage,
  buildVoiceTranscriptContent,
  DETAIL_STATUS_CONTAINER_ID,
  DETAIL_STATUS_CONTAINER_NAME,
  VOICE_TRANSCRIPT_CONTAINER_ID,
  VOICE_TRANSCRIPT_CONTAINER_NAME
} from "./pages.js";

export type AgentDetailHudArgs = {
  title: string;
  statusLine: string;
  lastDelta: string;
  footer: string;
};

export type VoiceHudArgs = {
  title: string;
  transcript: string;
  footer: string;
};

export type GlassesGesture =
  | { type: "click"; index: number; name: string }
  | { type: "double-click"; index: number; name: string }
  | { type: "scroll-up"; index: number; name: string }
  | { type: "scroll-down"; index: number; name: string }
  | { type: "back" };

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

  async showVoicePage(args: VoiceHudArgs): Promise<void> {
    if (!this.available || !this.bridge) {
      this.noOp("showVoicePage", args);
      return;
    }

    await this.bridge.rebuildPageContainer(
      new RebuildPageContainer(buildVoicePage(args))
    );
  }

  async updateVoiceTranscript(transcript: string): Promise<void> {
    if (!this.available || !this.bridge) {
      this.noOp("updateVoiceTranscript", transcript);
      return;
    }

    const content = buildVoiceTranscriptContent(transcript);
    await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: VOICE_TRANSCRIPT_CONTAINER_ID,
        containerName: VOICE_TRANSCRIPT_CONTAINER_NAME,
        contentOffset: 0,
        contentLength: content.length,
        content
      })
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
    return this.onGesture((gesture) => {
      if (gesture.type === "click") {
        cb(gesture.index, gesture.name);
      }
    });
  }

  onGesture(cb: (gesture: GlassesGesture) => void): () => void {
    if (!this.available || !this.bridge) {
      this.noOp("onGesture");
      return () => {};
    }

    return this.bridge.onEvenHubEvent((event) => {
      const gesture = parseGesture(event);
      if (gesture) {
        cb(gesture);
      }
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

function parseGesture(event: EvenHubEvent): GlassesGesture | null {
  const sys = event.sysEvent;
  if (sys && sys.eventType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
    return { type: "back" };
  }

  const list = event.listEvent;
  if (!list) {
    return null;
  }

  const index = list.currentSelectItemIndex ?? -1;
  const name = list.currentSelectItemName ?? "";

  switch (list.eventType) {
    case OsEventTypeList.CLICK_EVENT:
      if (index < 0) return null;
      return { type: "click", index, name };
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      return { type: "double-click", index, name };
    case OsEventTypeList.SCROLL_TOP_EVENT:
      return { type: "scroll-up", index, name };
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      return { type: "scroll-down", index, name };
    default:
      if (list.eventType === undefined && index >= 0) {
        return { type: "click", index, name };
      }
      return null;
  }
}
