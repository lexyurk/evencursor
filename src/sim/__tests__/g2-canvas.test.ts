import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildAgentListPage } from "../../glasses/pages.js";
import { renderG2Canvas } from "../g2-canvas.js";

function mockCanvas2d(): CanvasRenderingContext2D {
  const imageData = {
    data: new Uint8ClampedArray([0, 0, 0, 0, 10, 20, 30, 255])
  };
  return {
    fillStyle: "",
    fillRect: vi.fn(),
    strokeStyle: "",
    lineWidth: 1,
    strokeRect: vi.fn(),
    font: "",
    textBaseline: "top" as CanvasTextBaseline,
    fillText: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    drawImage: vi.fn(),
    getImageData: vi.fn(() => imageData)
  } as unknown as CanvasRenderingContext2D;
}

describe("renderG2Canvas", () => {
  beforeAll(() => {
    const ctx = mockCanvas2d();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ctx
    );
  });

  it("renders non-empty pixel data for an agent list page", () => {
    const page = buildAgentListPage(
      ["RUNNING  Billing refactor", "FINISHED  Retry flake fix"],
      "2 agents · tap to select"
    );
    const canvas = document.createElement("canvas");
    renderG2Canvas(canvas, page, { selectedIndex: 0 });

    expect(canvas.width).toBe(1152);
    expect(canvas.height).toBe(576);
    const displayCtx = canvas.getContext("2d");
    const sample = displayCtx!.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasNonZero = sample.some((value) => value > 0);
    expect(hasNonZero).toBe(true);
  });
});
