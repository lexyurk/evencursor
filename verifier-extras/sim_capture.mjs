import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ART = process.env.ART || "/opt/cursor/artifacts";
fs.mkdirSync(ART, { recursive: true });

const FAKE_AGENTS = {
  items: [
    {
      id: "agent_alpha",
      name: "Refactor billing module",
      status: "RUNNING",
      repositoryUrl: "https://github.com/example/billing",
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
    }
  ],
  nextCursor: null
};

const STREAM_BODY = `event: status
data: {"status":"RUNNING"}

event: assistant
data: {"delta":"Looking at the billing module."}

`;

function sse(...events) {
  return (
    events
      .map((e) => {
        const lines = [`event: ${e.event}`];
        const data =
          typeof e.data === "string" ? e.data : JSON.stringify(e.data);
        for (const line of data.split("\n")) {
          lines.push(`data: ${line}`);
        }
        return lines.join("\n");
      })
      .join("\n\n") + "\n\n"
  );
}

async function startDevServer() {
  const child = spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: { ...process.env, FORCE_COLOR: "0" }
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("dev server timeout")), 30_000);
    child.stdout?.on("data", (chunk) => {
      if (String(chunk).includes("localhost:5173")) {
        clearTimeout(timeout);
        resolve(undefined);
      }
    });
    child.stderr?.on("data", (chunk) => {
      if (String(chunk).includes("localhost:5173")) {
        clearTimeout(timeout);
        resolve(undefined);
      }
    });
    child.on("error", reject);
  });

  return child;
}

async function main() {
  const dev = await startDevServer();
  const browser = await chromium.launch({ headless: true });

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1400, height: 900 }
    });
    const page = await ctx.newPage();

    await page.route("**/api.cursor.com/**", async (route) => {
      const url = route.request().url();
      if (/\/v1\/agents(\?|$)/.test(url)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(FAKE_AGENTS)
        });
        return;
      }
      if (/\/v1\/agents\/[^/]+\/runs(\?|$)/.test(url)) {
        const items = FAKE_AGENTS.items[0]?.latestRun
          ? [FAKE_AGENTS.items[0].latestRun]
          : [];
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
      if (url.endsWith("/v1/models")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                id: "composer-2.5",
                displayName: "Composer 2.5",
                variants: [
                  {
                    params: [{ id: "fast", value: "true" }],
                    displayName: "Composer 2.5 (fast)",
                    isDefault: true
                  }
                ]
              }
            ]
          })
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("http://localhost:5173/#/simulator", {
      waitUntil: "networkidle"
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

    await page.waitForTimeout(800);
    await page.locator(".sim-g2-canvas").screenshot({
      path: path.join(ART, "sim_agents_list.png")
    });

    await page.locator(".sim-phone-app .agent-row").first().click();
    await page.waitForSelector(".sim-phone-app .agent-detail", { timeout: 10_000 });

    await page
      .waitForFunction(
        () => {
          const log = document.querySelector(".sim-phone-app .assistant-log");
          return log && (log.textContent || "").length > 0;
        },
        null,
        { timeout: 10_000 }
      )
      .catch(() => {});

    await page.waitForTimeout(500);
    await page.locator(".sim-g2-canvas").screenshot({
      path: path.join(ART, "sim_agent_detail.png")
    });

    console.log("Captured simulator screenshots in", ART);
  } finally {
    await browser.close();
    dev.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
