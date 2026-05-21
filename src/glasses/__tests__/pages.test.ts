import { describe, expect, it } from "vitest";
import {
  buildAgentDetailPage,
  buildAgentListPage,
  buildDetailStatusContent,
  DETAIL_FOOTER_CONTAINER_ID,
  DETAIL_STATUS_CONTAINER_ID,
  DETAIL_TITLE_CONTAINER_ID,
  LIST_CONTAINER_ID,
  LIST_FOOTER_CONTAINER_ID
} from "../pages.js";

const CANVAS_WIDTH = 576;
const CANVAS_HEIGHT = 288;

function fitsCanvas(
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  return (
    x >= 0 &&
    y >= 0 &&
    width >= 0 &&
    height >= 0 &&
    x + width <= CANVAS_WIDTH &&
    y + height <= CANVAS_HEIGHT
  );
}

describe("buildAgentListPage", () => {
  it("builds a list page within canvas limits", () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      `RUNNING  agent-${index}`.padEnd(70, "x")
    );
    const page = buildAgentListPage(rows, "8 agents · tap to select");

    expect(page.containerTotalNum).toBeLessThanOrEqual(12);
    expect(page.listObject).toHaveLength(1);
    expect(page.textObject?.length ?? 0).toBeLessThanOrEqual(8);

    const list = page.listObject?.[0];
    expect(list?.containerID).toBe(LIST_CONTAINER_ID);
    expect(list?.isEventCapture).toBe(1);
    expect(list?.containerName?.length ?? 0).toBeLessThanOrEqual(16);
    expect(
      fitsCanvas(
        list?.xPosition ?? 0,
        list?.yPosition ?? 0,
        list?.width ?? 0,
        list?.height ?? 0
      )
    ).toBe(true);

    const items = list?.itemContainer?.itemName ?? [];
    expect(items).toHaveLength(8);
    for (const item of items) {
      expect(item.length).toBeLessThanOrEqual(64);
    }

    const footer = page.textObject?.[0];
    expect(footer?.containerID).toBe(LIST_FOOTER_CONTAINER_ID);
    expect(footer?.containerName?.length ?? 0).toBeLessThanOrEqual(16);
    expect((footer?.content ?? "").length).toBeLessThanOrEqual(1000);
    expect(
      fitsCanvas(
        footer?.xPosition ?? 0,
        footer?.yPosition ?? 0,
        footer?.width ?? 0,
        footer?.height ?? 0
      )
    ).toBe(true);
  });
});

describe("buildAgentDetailPage", () => {
  it("builds a detail page within canvas limits", () => {
    const page = buildAgentDetailPage({
      title: "evencursor-rework",
      statusLine: "RUNNING · run abc123",
      lastDelta: "Updating adapter tests",
      footer: "Swipe up: back · Press: follow up"
    });

    expect(page.containerTotalNum).toBeLessThanOrEqual(12);
    expect(page.textObject?.length ?? 0).toBeLessThanOrEqual(8);

    const [title, status, footer] = page.textObject ?? [];
    expect(title?.containerID).toBe(DETAIL_TITLE_CONTAINER_ID);
    expect(status?.containerID).toBe(DETAIL_STATUS_CONTAINER_ID);
    expect(footer?.containerID).toBe(DETAIL_FOOTER_CONTAINER_ID);

    for (const container of page.textObject ?? []) {
      expect(container.containerName?.length ?? 0).toBeLessThanOrEqual(16);
      expect((container.content ?? "").length).toBeLessThanOrEqual(1000);
      expect(
        fitsCanvas(
          container.xPosition ?? 0,
          container.yPosition ?? 0,
          container.width ?? 0,
          container.height ?? 0
        )
      ).toBe(true);
    }

    expect(status?.content).toContain("RUNNING · run abc123");
    expect(status?.content).toContain("Updating adapter tests");
  });
});

describe("buildDetailStatusContent", () => {
  it("truncates combined status and delta to 1000 chars", () => {
    const content = buildDetailStatusContent("STATUS", "x".repeat(2000));
    expect(content.length).toBeLessThanOrEqual(1000);
  });
});
