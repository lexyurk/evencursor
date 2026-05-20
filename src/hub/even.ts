import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  waitForEvenAppBridge,
  type EvenAppBridge
} from "@evenrealities/even_hub_sdk";

let bridge: EvenAppBridge | undefined;
let initialized = false;

export async function renderEvenHud(lines: string[]): Promise<void> {
  const activeBridge = await getBridgeWithTimeout();
  if (!activeBridge) {
    return;
  }

  const textObject = makeTextObjects(lines);

  try {
    if (!initialized) {
      await activeBridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({
          containerTotalNum: textObject.length,
          textObject
        })
      );
      initialized = true;
      return;
    }

    await activeBridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: textObject.length,
        textObject
      })
    );
  } catch (error) {
    console.warn("Even HUD render failed", error);
  }
}

async function getBridgeWithTimeout(): Promise<EvenAppBridge | undefined> {
  if (bridge) {
    return bridge;
  }

  const timeout = new Promise<undefined>((resolve) => {
    window.setTimeout(() => resolve(undefined), 600);
  });

  bridge = await Promise.race([waitForEvenAppBridge(), timeout]);
  return bridge;
}

function makeTextObjects(lines: string[]): TextContainerProperty[] {
  const normalized = lines.slice(0, 3).map((line) => line.slice(0, 72));
  return normalized.map(
    (content, index) =>
      new TextContainerProperty({
        containerID: index + 1,
        containerName: "line-" + (index + 1),
        xPosition: 24,
        yPosition: 18 + index * 54,
        width: 592,
        height: 42,
        paddingLength: 0,
        borderWidth: 0,
        borderRadius: 0,
        isEventCapture: 0,
        content
      })
  );
}
