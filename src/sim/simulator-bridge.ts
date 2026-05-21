import {
  CreateStartUpPageContainer,
  DeviceInfo,
  DeviceModel,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerUpgrade,
  UserInfo,
  type EvenAppBridge
} from "@evenrealities/even_hub_sdk";
import { Emitter } from "../shared/events.js";
import {
  BRIDGE_PROBE_KEY,
  BRIDGE_PROBE_VALUE,
  SIM_BRIDGE_GLOBAL
} from "../storage/bridge-probe.js";
import { describeG2Page, renderG2Canvas } from "./g2-canvas.js";

export type SimulatorBridgeEvents = {
  pageChanged: {
    page: CreateStartUpPageContainer | RebuildPageContainer;
    selectedIndex: number;
  };
};

export type ListEventPayload = {
  currentSelectItemIndex: number;
  currentSelectItemName: string;
  evenHubEvent?: string;
};

export class SimulatorBridge {
  private readonly events = new Emitter<SimulatorBridgeEvents>();
  private hubListeners: Array<(event: Record<string, unknown>) => void> = [];
  private currentPage: CreateStartUpPageContainer | RebuildPageContainer | null =
    null;
  selectedIndex = 0;
  private storage = new Map<string, string>();
  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  getCurrentPage(): CreateStartUpPageContainer | RebuildPageContainer | null {
    return this.currentPage;
  }

  onPageChanged(
    listener: (payload: SimulatorBridgeEvents["pageChanged"]) => void
  ): () => void {
    return this.events.on("pageChanged", listener);
  }

  async getDeviceInfo(): Promise<DeviceInfo | null> {
    return new DeviceInfo({
      model: DeviceModel.G2,
      sn: "SIM-G2-001"
    });
  }

  async getUserInfo(): Promise<UserInfo> {
    return new UserInfo({
      uid: 1,
      name: "Simulator",
      avatar: "",
      country: "US"
    });
  }

  async setLocalStorage(key: string, value: string): Promise<boolean> {
    this.storage.set(key, value);
    return true;
  }

  async getLocalStorage(key: string): Promise<string> {
    return this.storage.get(key) ?? "";
  }

  async createStartUpPageContainer(
    container: CreateStartUpPageContainer
  ): Promise<StartUpPageCreateResult> {
    this.currentPage = container;
    this.selectedIndex = 0;
    this.paint();
    return StartUpPageCreateResult.success;
  }

  async rebuildPageContainer(container: RebuildPageContainer): Promise<boolean> {
    this.currentPage = container;
    this.paint();
    return true;
  }

  async textContainerUpgrade(upgrade: TextContainerUpgrade): Promise<boolean> {
    if (!this.currentPage) {
      return false;
    }

    const texts = (this.currentPage as { textObject?: Array<{ containerID?: number; content?: string }> })
      .textObject;
    if (!Array.isArray(texts)) {
      return false;
    }

    for (const text of texts) {
      if (text.containerID === upgrade.containerID) {
        text.content = upgrade.content;
      }
    }

    this.paint();
    return true;
  }

  async audioControl(_enabled: boolean): Promise<boolean> {
    return true;
  }

  async shutDownPageContainer(_id: number): Promise<boolean> {
    this.currentPage = null;
    this.paintBlank();
    return true;
  }

  onEvenHubEvent(
    listener: (event: Record<string, unknown>) => void
  ): () => void {
    this.hubListeners.push(listener);
    return () => {
      this.hubListeners = this.hubListeners.filter((item) => item !== listener);
    };
  }

  dispatchListEvent(payload: ListEventPayload): void {
    const event = {
      listEvent: {
        currentSelectItemIndex: payload.currentSelectItemIndex,
        currentSelectItemName: payload.currentSelectItemName,
        evenHubEvent: payload.evenHubEvent ?? "SELECT"
      }
    };

    for (const listener of this.hubListeners) {
      listener(event);
    }
  }

  moveSelection(delta: number): void {
    if (!this.currentPage) {
      return;
    }

    const info = describeG2Page(this.currentPage);
    if (info.kind !== "list" || info.rows.length === 0) {
      return;
    }

    const max = info.rows.length - 1;
    this.selectedIndex = Math.max(0, Math.min(max, this.selectedIndex + delta));
    this.paint();
    this.dispatchListEvent({
      currentSelectItemIndex: this.selectedIndex,
      currentSelectItemName: info.rows[this.selectedIndex] ?? "",
      evenHubEvent: "SCROLL"
    });
  }

  pressSelect(): void {
    if (!this.currentPage) {
      return;
    }
    const info = describeG2Page(this.currentPage);
    if (info.kind !== "list") {
      return;
    }
    this.dispatchListEvent({
      currentSelectItemIndex: this.selectedIndex,
      currentSelectItemName: info.rows[this.selectedIndex] ?? "",
      evenHubEvent: "SELECT"
    });
  }

  async probeStorage(): Promise<boolean> {
    await this.setLocalStorage(BRIDGE_PROBE_KEY, BRIDGE_PROBE_VALUE);
    const readback = await this.getLocalStorage(BRIDGE_PROBE_KEY);
    return readback === BRIDGE_PROBE_VALUE;
  }

  private paint(): void {
    if (!this.currentPage) {
      this.paintBlank();
      return;
    }
    renderG2Canvas(this.canvas, this.currentPage, {
      selectedIndex: this.selectedIndex
    });
    this.events.emit("pageChanged", {
      page: this.currentPage,
      selectedIndex: this.selectedIndex
    });
  }

  private paintBlank(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    this.canvas.width = 576 * 2;
    this.canvas.height = 288 * 2;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#3dff7a";
    ctx.font = "20px monospace";
    ctx.fillText("G2 HUD idle", 24, 48);
  }
}

export function installSimBridgeGlobal(bridge: SimulatorBridge): void {
  (window as unknown as Record<string, unknown>)[SIM_BRIDGE_GLOBAL] =
    bridge as unknown as EvenAppBridge;
}
