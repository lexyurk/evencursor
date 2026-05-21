import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  TextContainerProperty
} from "@evenrealities/even_hub_sdk";

export type AgentDetailPageArgs = {
  title: string;
  statusLine: string;
  lastDelta: string;
  footer: string;
};

export const LIST_CONTAINER_ID = 1;
export const LIST_CONTAINER_NAME = "agent-list";
export const LIST_FOOTER_CONTAINER_ID = 2;
export const LIST_FOOTER_CONTAINER_NAME = "list-footer";

export const DETAIL_TITLE_CONTAINER_ID = 1;
export const DETAIL_TITLE_CONTAINER_NAME = "detail-title";
export const DETAIL_STATUS_CONTAINER_ID = 2;
export const DETAIL_STATUS_CONTAINER_NAME = "detail-status";
export const DETAIL_FOOTER_CONTAINER_ID = 3;
export const DETAIL_FOOTER_CONTAINER_NAME = "detail-footer";

export const CANVAS_WIDTH = 576;
export const CANVAS_HEIGHT = 288;
const MAX_ROW_CHARS = 64;
const MAX_TEXT_CONTENT = 1000;
const MAX_CONTAINER_NAME = 16;
const MAX_LIST_ROWS = 8;

function clampContainerName(name: string): string {
  return name.slice(0, MAX_CONTAINER_NAME);
}

function clampTextContent(content: string): string {
  return content.slice(0, MAX_TEXT_CONTENT);
}

function clampRow(row: string): string {
  return row.slice(0, MAX_ROW_CHARS);
}

function buildListContainer(rows: string[]): ListContainerProperty {
  const itemName = rows.slice(0, MAX_LIST_ROWS).map(clampRow);
  return new ListContainerProperty({
    containerID: LIST_CONTAINER_ID,
    containerName: clampContainerName(LIST_CONTAINER_NAME),
    xPosition: 8,
    yPosition: 8,
    width: CANVAS_WIDTH - 16,
    height: 228,
    borderWidth: 0,
    borderRadius: 0,
    paddingLength: 4,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: Math.max(itemName.length, 1),
      itemWidth: 0,
      isItemSelectBorderEn: 1,
      itemName
    })
  });
}

function buildFooterTextContainer(
  containerID: number,
  containerName: string,
  content: string,
  yPosition: number,
  height: number
): TextContainerProperty {
  return new TextContainerProperty({
    containerID,
    containerName: clampContainerName(containerName),
    xPosition: 8,
    yPosition,
    width: CANVAS_WIDTH - 16,
    height,
    borderWidth: 0,
    borderRadius: 0,
    paddingLength: 2,
    isEventCapture: 0,
    content: clampTextContent(content)
  });
}

export function buildDetailStatusContent(
  statusLine: string,
  lastDelta: string
): string {
  const delta = lastDelta.trim();
  if (delta.length === 0) {
    return clampTextContent(statusLine);
  }
  return clampTextContent(`${statusLine}\n${delta}`);
}

export function buildAgentListPage(
  rows: string[],
  footer: string
): CreateStartUpPageContainer {
  return new CreateStartUpPageContainer({
    containerTotalNum: 2,
    listObject: [buildListContainer(rows)],
    textObject: [
      buildFooterTextContainer(
        LIST_FOOTER_CONTAINER_ID,
        LIST_FOOTER_CONTAINER_NAME,
        footer,
        244,
        CANVAS_HEIGHT - 244
      )
    ]
  });
}

export function buildAgentDetailPage(
  args: AgentDetailPageArgs
): RebuildPageContainer {
  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [
      buildFooterTextContainer(
        DETAIL_TITLE_CONTAINER_ID,
        DETAIL_TITLE_CONTAINER_NAME,
        args.title,
        8,
        40
      ),
      buildFooterTextContainer(
        DETAIL_STATUS_CONTAINER_ID,
        DETAIL_STATUS_CONTAINER_NAME,
        buildDetailStatusContent(args.statusLine, args.lastDelta),
        56,
        176
      ),
      buildFooterTextContainer(
        DETAIL_FOOTER_CONTAINER_ID,
        DETAIL_FOOTER_CONTAINER_NAME,
        args.footer,
        240,
        CANVAS_HEIGHT - 240
      )
    ]
  });
}
