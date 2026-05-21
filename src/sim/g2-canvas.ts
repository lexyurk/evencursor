import type {
  CreateStartUpPageContainer,
  RebuildPageContainer
} from "@evenrealities/even_hub_sdk";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../glasses/pages.js";

const PALETTE = [
  "#000000",
  "#111111",
  "#222222",
  "#333333",
  "#444444",
  "#555555",
  "#666666",
  "#777777",
  "#888888",
  "#999999",
  "#aaaaaa",
  "#bbbbbb",
  "#cccccc",
  "#dddddd",
  "#eeeeee",
  "#ffffff"
];

const BG = "#050806";
const ROW_BG = "#0a120c";
const ROW_SELECTED_BG = "#14301a";
const TINT = "#3dff7a";
const SELECTION_RING = "#7dffb0";
const TEXT_COLOR = "#d8f5de";

export type G2CanvasRenderOpts = {
  selectedIndex?: number;
};

type ListLike = {
  xPosition?: number;
  yPosition?: number;
  width?: number;
  height?: number;
  itemContainer?: {
    itemName?: string[];
    itemCount?: number;
  };
};

type TextLike = {
  xPosition?: number;
  yPosition?: number;
  width?: number;
  height?: number;
  content?: string;
};

function readListObjects(
  page: CreateStartUpPageContainer | RebuildPageContainer
): ListLike[] {
  const raw = (page as { listObject?: ListLike[] }).listObject;
  return Array.isArray(raw) ? raw : [];
}

function readTextObjects(
  page: CreateStartUpPageContainer | RebuildPageContainer
): TextLike[] {
  const raw = (page as { textObject?: TextLike[] }).textObject;
  return Array.isArray(raw) ? raw : [];
}

function drawList(
  ctx: CanvasRenderingContext2D,
  list: ListLike,
  selectedIndex: number
): void {
  const x = list.xPosition ?? 0;
  const y = list.yPosition ?? 0;
  const width = list.width ?? CANVAS_WIDTH;
  const height = list.height ?? CANVAS_HEIGHT;
  const names = list.itemContainer?.itemName ?? [];
  const count = list.itemContainer?.itemCount ?? names.length;
  const rows = names.slice(0, count);

  ctx.fillStyle = BG;
  ctx.fillRect(x, y, width, height);

  const rowHeight = rows.length > 0 ? Math.floor(height / Math.max(rows.length, 1)) : height;

  rows.forEach((label, index) => {
    const rowY = y + index * rowHeight;
    const selected = index === selectedIndex;
    ctx.fillStyle = selected ? ROW_SELECTED_BG : ROW_BG;
    ctx.fillRect(x + 2, rowY + 1, width - 4, rowHeight - 2);

    if (selected) {
      ctx.strokeStyle = SELECTION_RING;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 3, rowY + 2, width - 6, rowHeight - 4);
    }

    ctx.fillStyle = TINT;
    ctx.font = "14px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "middle";
    const text = label.length > 48 ? `${label.slice(0, 45)}…` : label;
    ctx.fillText(text, x + 10, rowY + rowHeight / 2);
  });
}

function drawText(ctx: CanvasRenderingContext2D, text: TextLike): void {
  const x = text.xPosition ?? 0;
  const y = text.yPosition ?? 0;
  const width = text.width ?? CANVAS_WIDTH;
  const height = text.height ?? 40;
  const content = text.content ?? "";

  ctx.fillStyle = "#0b100d";
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = "13px ui-monospace, Menlo, monospace";
  ctx.textBaseline = "top";

  const lines = content.split("\n");
  let lineY = y + 6;
  for (const line of lines) {
    const clipped =
      line.length > 72 ? `${line.slice(0, 69)}…` : line;
    ctx.fillText(clipped, x + 8, lineY, width - 16);
    lineY += 16;
    if (lineY > y + height - 12) {
      break;
    }
  }
}

export function renderG2Canvas(
  target: HTMLCanvasElement,
  page: CreateStartUpPageContainer | RebuildPageContainer,
  opts?: G2CanvasRenderOpts
): void {
  const selectedIndex = opts?.selectedIndex ?? 0;
  const native = document.createElement("canvas");
  native.width = CANVAS_WIDTH;
  native.height = CANVAS_HEIGHT;
  const ctx = native.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
  gradient.addColorStop(0, PALETTE[2]);
  gradient.addColorStop(1, PALETTE[4]);
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.08;
  ctx.fillRect(0, 0, CANVAS_WIDTH, 8);
  ctx.globalAlpha = 1;

  for (const list of readListObjects(page)) {
    drawList(ctx, list, selectedIndex);
  }
  for (const text of readTextObjects(page)) {
    drawText(ctx, text);
  }

  target.width = CANVAS_WIDTH * 2;
  target.height = CANVAS_HEIGHT * 2;
  const displayCtx = target.getContext("2d");
  if (!displayCtx) {
    return;
  }

  displayCtx.imageSmoothingEnabled = false;
  displayCtx.fillStyle = "#000";
  displayCtx.fillRect(0, 0, target.width, target.height);
  displayCtx.drawImage(native, 0, 0, target.width, target.height);
}

export function describeG2Page(
  page: CreateStartUpPageContainer | RebuildPageContainer
): { kind: "list" | "detail"; rows: string[]; footer: string } {
  const lists = readListObjects(page);
  const texts = readTextObjects(page);

  if (lists.length > 0) {
    const names = lists[0]?.itemContainer?.itemName ?? [];
    const footer = texts[0]?.content ?? "";
    return { kind: "list", rows: names, footer };
  }

  const title = texts[0]?.content ?? "";
  const status = texts[1]?.content ?? "";
  const footer = texts[2]?.content ?? "";
  return {
    kind: "detail",
    rows: [title, status].filter(Boolean),
    footer
  };
}
