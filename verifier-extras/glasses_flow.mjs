// End-to-end glasses gesture flow against the simulator + mocked Cursor API.
// Verifies: boot -> list HUD -> click first agent -> detail HUD ->
//           double-click -> action menu -> back -> detail -> back -> list.
// Output: verifier-extras/flow_*.png + flow_summary.json

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ART = path.resolve(__dirname);

const FAKE_AGENTS = {
  items: [
    {
      id: "agent_alpha",
      name: "Refactor billing module",
      status: "RUNNING",
      repositoryUrl: "https://github.com/lexyurk/billing",
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 1000).toISOString(),
      archived: false,
      latestRun: {
        id: "run_alpha_1",
        agentId: "agent_alpha",
        status: "RUNNING",
        prompt: "Move Stripe code behind a port.",
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 30 * 1000).toISOString()
      }
    },
    {
      id: "agent_beta",
      name: "Add OAuth login",
      status: "FINISHED",
      repositoryUrl: "https://github.com/lexyurk/auth",
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      archived: false,
      latestRun: {
        id: "run_beta_1",
        agentId: "agent_beta",
        status: "FINISHED",
        prompt: "Wire up Google login.",
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
      }
    }
  ],
  nextCursor: null
};

const STREAM_BODY =
  `event: status\ndata: {"status":"RUNNING"}\n\n` +
  `event: tool_call\ndata: {"name":"ReadFile src/billing/stripe.ts"}\n\n` +
  `event: assistant\ndata: {"delta":"Inspecting StripeAdapter for hidden coupling."}\n\n` +
  `event: tool_call\ndata: {"name":"Grep StripeClient src/"}\n\n` +
  `event: assistant\ndata: {"delta":"Refactoring webhook signature verification."}\n\n`;

async function startDevServer() {
  const child = spawn("npm", ["run", "dev", "--", "--port", "5188"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
    env: { ...process.env, FORCE_COLOR: "0" }
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("dev server timeout")),
      30_000
    );
    const onChunk = (chunk) => {
      const s = String(chunk);
      if (s.includes("5188")) {
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

function describeHud(canvas, page) {
  return page.evaluate(async () => {
    const sdk = await import("/node_modules/@evenrealities/even_hub_sdk/dist/index.js");
    const g = await import("/src/sim/g2-canvas.ts");
    const bridge = window.__EVENCURSOR_SIM_BRIDGE__;
    const current = bridge.getCurrentPage();
    if (!current) return { kind: "idle", rows: [], footer: "" };
    return g.describeG2Page(current);
  });
}

async function main() {
  const summary = { steps: [] };

  const dev = await startDevServer();
  const launchOpts = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  } else if (
    fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
  ) {
    launchOpts.executablePath =
      "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  }
  const browser = await chromium.launch(launchOpts);

  try {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        summary.steps.push({ step: "console-error", text: msg.text() });
      }
    });

    await page.route("**/api.cursor.com/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/v1/me")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            apiKeyName: "sim",
            userEmail: "sim@example.com",
            createdAt: new Date().toISOString()
          })
        });
        return;
      }
      if (/\/v1\/agents(\?|$)/.test(url)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(FAKE_AGENTS)
        });
        return;
      }
      if (/\/v1\/agents\/[^/]+\/runs(\?|$)/.test(url)) {
        const items = [FAKE_AGENTS.items[0].latestRun];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items, nextCursor: null })
        });
        return;
      }
      if (/\/v1\/agents\/[^/]+\/runs\/[^/]+\/stream/.test(url)) {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "text/event-stream" },
          body: STREAM_BODY
        });
        return;
      }
      if (/\/v1\/agents\/[^/]+$/.test(url)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(FAKE_AGENTS.items[0])
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("http://127.0.0.1:5188/#/simulator", {
      waitUntil: "domcontentloaded"
    });
    await page.waitForSelector(".sim-g2-canvas", { timeout: 15_000 });
    await page.evaluate(() => {
      window.localStorage.setItem("cursor.apiKey", "ck_sim");
      window.localStorage.setItem("deepgram.apiKey", "dg_sim");
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".sim-phone-app .agents-list .agent-row", {
      timeout: 15_000
    });
    await page.waitForTimeout(600);

    // List HUD should now show "+ New agent" + 2 agents
    let info = await describeHud(".sim-g2-canvas", page);
    summary.steps.push({ step: "boot-list", kind: info.kind, rows: info.rows });
    await page.locator(".sim-g2-canvas").screenshot({
      path: path.join(ART, "flow_01_list.png")
    });

    // Scroll-down twice to focus the first real agent (index 1), then click
    await page.locator('button[data-action="down"]').click();
    await page.waitForTimeout(80);
    await page.locator('button[data-action="press"]').click();
    await page.waitForTimeout(800);

    info = await describeHud(".sim-g2-canvas", page);
    summary.steps.push({ step: "after-click-agent", kind: info.kind, rows: info.rows });
    await page.locator(".sim-g2-canvas").screenshot({
      path: path.join(ART, "flow_02_detail.png")
    });

    // Double-click → action menu
    await page.locator('button[data-action="double"]').click();
    await page.waitForTimeout(300);
    info = await describeHud(".sim-g2-canvas", page);
    summary.steps.push({ step: "after-double-click", kind: info.kind, rows: info.rows });
    await page.locator(".sim-g2-canvas").screenshot({
      path: path.join(ART, "flow_03_actions.png")
    });

    // Back → detail
    await page.locator('button[data-action="back"]').click();
    await page.waitForTimeout(300);
    info = await describeHud(".sim-g2-canvas", page);
    summary.steps.push({ step: "after-back-from-actions", kind: info.kind, rows: info.rows });
    await page.locator(".sim-g2-canvas").screenshot({
      path: path.join(ART, "flow_04_detail_again.png")
    });

    // Back → list
    await page.locator('button[data-action="back"]').click();
    await page.waitForTimeout(400);
    info = await describeHud(".sim-g2-canvas", page);
    summary.steps.push({ step: "after-back-to-list", kind: info.kind, rows: info.rows });
    await page.locator(".sim-g2-canvas").screenshot({
      path: path.join(ART, "flow_05_list_again.png")
    });

    fs.writeFileSync(
      path.join(ART, "flow_summary.json"),
      JSON.stringify(summary, null, 2)
    );

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
    dev.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
