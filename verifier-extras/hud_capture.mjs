// Visual capture of every HUD page through the simulator.
// Run: node verifier-extras/hud_capture.mjs
// Output: verifier-extras/hud_*.png

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ART = path.resolve(__dirname);

async function startDevServer() {
  const child = spawn("npm", ["run", "dev"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
    env: { ...process.env, FORCE_COLOR: "0" }
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("dev server timeout")), 30_000);
    const onChunk = (chunk) => {
      const s = String(chunk);
      if (s.includes("5173")) {
        clearTimeout(timeout);
        resolve(undefined);
      }
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    child.on("error", reject);
  });

  return child;
}

async function main() {
  const dev = await startDevServer();
  const launchOpts = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  } else if (fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")) {
    launchOpts.executablePath = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  }
  const browser = await chromium.launch(launchOpts);

  try {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    await page.goto("http://127.0.0.1:5173/#/simulator", {
      waitUntil: "domcontentloaded"
    });
    await page.waitForSelector(".sim-g2-canvas", { timeout: 15_000 });

    // Wait for the simulator bridge global to be installed
    await page.waitForFunction(() => Boolean(window.__EVENCURSOR_SIM_BRIDGE__), {
      timeout: 10_000
    });

    // Render an agent list page directly through the bridge
    await page.evaluate(async () => {
      const sdk = await import("/node_modules/@evenrealities/even_hub_sdk/dist/index.js");
      const pages = await import("/src/glasses/pages.ts");
      const bridge = window.__EVENCURSOR_SIM_BRIDGE__;

      const rows = [
        "+ New agent · dictate a prompt",
        "RUNNING  Refactor billing module",
        "FINISHED Add OAuth login",
        "RUNNING  Migrate to Postgres 16",
        "ERRORED  Fix flaky tests",
        "FINISHED Polish settings page"
      ];

      const listPage = pages.buildAgentListPage(rows, "5 agents · click row · back to exit");
      await bridge.createStartUpPageContainer(new sdk.CreateStartUpPageContainer(listPage));
    });
    await page.waitForTimeout(200);
    await page.locator(".sim-g2-canvas").screenshot({
      path: path.join(ART, "hud_list.png")
    });

    // Render the voice page (new HUD page in this commit)
    await page.evaluate(async () => {
      const sdk = await import("/node_modules/@evenrealities/even_hub_sdk/dist/index.js");
      const pages = await import("/src/glasses/pages.ts");
      const bridge = window.__EVENCURSOR_SIM_BRIDGE__;

      const voicePage = pages.buildVoicePage({
        title: "New agent",
        transcript: "fix the auth regression on the dashboard page",
        footer: "Speak · back to cancel"
      });
      await bridge.rebuildPageContainer(new sdk.RebuildPageContainer(voicePage));
    });
    await page.waitForTimeout(200);
    await page.locator(".sim-g2-canvas").screenshot({
      path: path.join(ART, "hud_voice.png")
    });

    // Render the detail page
    await page.evaluate(async () => {
      const sdk = await import("/node_modules/@evenrealities/even_hub_sdk/dist/index.js");
      const pages = await import("/src/glasses/pages.ts");
      const bridge = window.__EVENCURSOR_SIM_BRIDGE__;

      const detailPage = pages.buildAgentDetailPage({
        title: "Refactor billing module",
        statusLine: "RUNNING · run 9f3a1c…",
        lastDelta: "",
        footer: "Click: follow-up · Back: list",
        repoLabel: "lexyurk/billing",
        activity: [
          "[tool] ReadFile src/billing/stripe.ts",
          "Inspecting StripeAdapter for hidden coupling.",
          "[tool] Grep StripeClient src/",
          "Refactoring webhook signature verification.",
          "Running pytest on billing/test_webhooks.py."
        ]
      });
      await bridge.rebuildPageContainer(new sdk.RebuildPageContainer(detailPage));
    });
    await page.waitForTimeout(200);
    await page.locator(".sim-g2-canvas").screenshot({
      path: path.join(ART, "hud_detail.png")
    });

    // Action menu (a list page with predefined items)
    await page.evaluate(async () => {
      const sdk = await import("/node_modules/@evenrealities/even_hub_sdk/dist/index.js");
      const pages = await import("/src/glasses/pages.ts");
      const bridge = window.__EVENCURSOR_SIM_BRIDGE__;

      const menuPage = pages.buildAgentListPage(
        ["Cancel run", "Archive", "Delete agent", "Back"],
        "Refactor billing module · click action · back cancels"
      );
      await bridge.rebuildPageContainer(new sdk.RebuildPageContainer(menuPage));
    });
    await page.waitForTimeout(200);
    await page.locator(".sim-g2-canvas").screenshot({
      path: path.join(ART, "hud_actions.png")
    });

    // Whole-simulator capture (canvas + touchpad + status panel)
    await page.locator(".simulator-main").screenshot({
      path: path.join(ART, "hud_simulator_overview.png")
    });

    console.log("captured:", fs.readdirSync(ART).filter((f) => f.startsWith("hud_")).join(", "));
  } finally {
    await browser.close();
    dev.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
