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
  repoLabel?: string;
  activity?: readonly string[];
};

export type VoicePageArgs = {
  title: string;
  transcript: string;
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

export const VOICE_TITLE_CONTAINER_ID = 1;
export const VOICE_TITLE_CONTAINER_NAME = "voice-title";
export const VOICE_TRANSCRIPT_CONTAINER_ID = 2;
export const VOICE_TRANSCRIPT_CONTAINER_NAME = "voice-transcript";
export const VOICE_FOOTER_CONTAINER_ID = 3;
export const VOICE_FOOTER_CONTAINER_NAME = "voice-footer";

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
  height: number,
  options: { isEventCapture?: 0 | 1 } = {}
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
    isEventCapture: options.isEventCapture ?? 0,
    content: clampTextContent(content)
  });
}

export function buildDetailStatusContent(
  statusLine: string,
  lastDelta: string,
  opts: { repoLabel?: string; activity?: readonly string[] } = {}
): string {
  const lines: string[] = [];
  if (opts.repoLabel && opts.repoLabel.trim().length > 0) {
    lines.push(`${statusLine}  ·  ${opts.repoLabel.trim()}`);
  } else {
    lines.push(statusLine);
  }

  const activity = opts.activity ?? [];
  if (activity.length > 0) {
    for (const line of activity) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        lines.push(trimmed);
      }
    }
  } else if (lastDelta.trim().length > 0) {
    lines.push(lastDelta.trim());
  }

  return clampTextContent(lines.join("\n"));
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

export function buildVoiceTranscriptContent(transcript: string): string {
  const trimmed = transcript.trim();
  if (trimmed.length === 0) {
    return clampTextContent("Speak now…");
  }
  return clampTextContent(trimmed);
}

export function buildVoicePage(args: VoicePageArgs): RebuildPageContainer {
  return new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [
      buildFooterTextContainer(
        VOICE_TITLE_CONTAINER_ID,
        VOICE_TITLE_CONTAINER_NAME,
        args.title,
        8,
        40
      ),
      buildFooterTextContainer(
        VOICE_TRANSCRIPT_CONTAINER_ID,
        VOICE_TRANSCRIPT_CONTAINER_NAME,
        buildVoiceTranscriptContent(args.transcript),
        56,
        176
      ),
      buildFooterTextContainer(
        VOICE_FOOTER_CONTAINER_ID,
        VOICE_FOOTER_CONTAINER_NAME,
        args.footer,
        240,
        CANVAS_HEIGHT - 240,
        { isEventCapture: 1 }
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
        buildDetailStatusContent(args.statusLine, args.lastDelta, {
          repoLabel: args.repoLabel,
          activity: args.activity
        }),
        56,
        176
      ),
      buildFooterTextContainer(
        DETAIL_FOOTER_CONTAINER_ID,
        DETAIL_FOOTER_CONTAINER_NAME,
        args.footer,
        240,
        CANVAS_HEIGHT - 240,
        { isEventCapture: 1 }
      )
    ]
  });
}
