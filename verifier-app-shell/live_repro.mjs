// Verifier harness for app-shell live UI verification.
//
// Goals:
//  1. Sign-In screen renders.
//  2. The Cursor API key is validated via the REAL `/v1/me` endpoint
//     (using the CURSOR_API_KEY env var when present).
//  3. AgentsList renders after sign-in — for repeatable evidence we
//     intercept `/v1/agents` so the (empty) real account doesn't blank
//     the page; the call IS still made against `api.cursor.com` via fetch.
//  4. Clicking an agent mounts AgentDetail and opens a
//     `text/event-stream` fetch on
//     `/v1/agents/<id>/runs/<id>/stream` — captured from the Network log.
//
// We capture screenshots + a JSON summary into /opt/cursor/artifacts.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ART = process.env.ART || "/opt/cursor/artifacts";
fs.mkdirSync(ART, { recursive: true });

const CURSOR_API_KEY = process.env.CURSOR_API_KEY || "";
const DEEPGRAM_API_KEY =
  process.env.DEEPGRAM_API_KEY || "fake-deepgram-key-for-ui-verify";
const REAL_ME_CHECK = CURSOR_API_KEY.length > 0;

const FAKE_AGENTS = {
  items: [
    {
      id: "agent_alpha",
      name: "Refactor billing module",
      status: "RUNNING",
      repositoryUrl: "https://github.com/example/billing",
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 1000).toISOString(),
      latestRun: {
        id: "run_alpha_1",
        agentId: "agent_alpha",
        status: "RUNNING",
        prompt: "Move Stripe code behind a port.",
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 30 * 1000).toISOString(),
      },
    },
    {
      id: "agent_bravo",
      name: "Fix flaky retry test",
      status: "FINISHED",
      repositoryUrl: "https://github.com/example/core",
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      latestRun: {
        id: "run_bravo_1",
        agentId: "agent_bravo",
        status: "FINISHED",
        prompt: "Address retry flake in CI.",
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
    },
  ],
  nextCursor: null,
};

function sse(...events) {
  return (
    events
      .map((e) => {
        const lines = [];
        if (e.id) lines.push(`id: ${e.id}`);
        lines.push(`event: ${e.event}`);
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

const STREAM_BODY = sse(
  { event: "status", data: { status: "RUNNING" } },
  { event: "assistant", data: { delta: "Looking at the billing module." } },
  { event: "thinking", data: { delta: "Considering options" } },
  { event: "tool_call", data: { name: "read_file" } }
);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 420, height: 800 },
    permissions: [],
    serviceWorkers: "block",
  });
  const page = await ctx.newPage();

  const consoleLog = [];
  page.on("console", (msg) => consoleLog.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => consoleLog.push(`[pageerror] ${err.message}`));

  const network = [];
  page.on("request", (req) => {
    network.push({
      url: req.url(),
      resourceType: req.resourceType(),
      method: req.method(),
    });
  });
  page.on("response", async (resp) => {
    const entry = network.find(
      (n) => n.url === resp.url() && n.status === undefined
    );
    if (entry) {
      entry.status = resp.status();
      entry.contentType = resp.headers()["content-type"];
    }
  });

  await ctx.route("**/api.cursor.com/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/v1/me") && REAL_ME_CHECK) {
      await route.continue();
      return;
    }
    if (url.endsWith("/v1/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          apiKeyName: "synthetic",
          userEmail: "synthetic@example.com",
          createdAt: new Date().toISOString(),
        }),
      });
      return;
    }
    if (/\/v1\/agents(\?|$)/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FAKE_AGENTS),
      });
      return;
    }
    if (
      /\/v1\/agents\/[^/]+\/runs(\?|$)/.test(url) &&
      route.request().method() === "GET"
    ) {
      const agentId = url.match(/agents\/([^/]+)\/runs/)[1];
      const items = FAKE_AGENTS.items.find((a) => a.id === agentId)?.latestRun
        ? [FAKE_AGENTS.items.find((a) => a.id === agentId).latestRun]
        : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items, nextCursor: null }),
      });
      return;
    }
    if (/\/v1\/agents\/[^/]+\/runs\/[^/]+\/stream/.test(url)) {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        },
        body: STREAM_BODY,
      });
      return;
    }
    await route.fallback();
  });

  const stages = [];
  const summary = {
    agentRowCount: 0,
    streamRequest: null,
    streamResponseContentType: null,
    streamResponseStatus: null,
    assistantLogExcerpt: "",
    realMeValidated: REAL_ME_CHECK,
    stages,
  };

  const streamReqPromise = page
    .waitForRequest(
      (req) => /\/v1\/agents\/[^/]+\/runs\/[^/]+\/stream/.test(req.url()),
      { timeout: 15_000 }
    )
    .catch((e) => {
      summary.streamRequest = `(missed: ${e.message})`;
      return null;
    });

  try {
    await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await page.waitForSelector('input[name="cursorKey"]', { timeout: 10_000 });
    await page.screenshot({ path: path.join(ART, "verify_01_signin.png") });
    stages.push({ stage: "signin-shown", ok: true });

    await page.fill(
      'input[name="cursorKey"]',
      CURSOR_API_KEY || "ck_fake_key_for_ui"
    );
    await page.fill('input[name="deepgramKey"]', DEEPGRAM_API_KEY);
    await page.screenshot({
      path: path.join(ART, "verify_02_signin_filled.png"),
    });

    await page.click('button[type="submit"]');
    await page.waitForSelector(".app-shell", { timeout: 15_000 });
    stages.push({ stage: "app-mounted", ok: true });

    await page.waitForSelector(".agents-list .agent-row", { timeout: 10_000 });
    await page.screenshot({
      path: path.join(ART, "verify_03_agents_list.png"),
    });
    summary.agentRowCount = await page.$$eval(
      ".agent-row",
      (els) => els.length
    );
    stages.push({
      stage: "agents-list-rendered",
      ok: summary.agentRowCount > 0,
      message: `${summary.agentRowCount} rows`,
    });

    await page.click(".agent-row");
    await page.waitForSelector(".agent-detail", { timeout: 10_000 });
    stages.push({ stage: "agent-detail-mounted", ok: true });

    const streamReq = await streamReqPromise;
    if (streamReq) {
      summary.streamRequest = streamReq.url();
      stages.push({ stage: "sse-request-issued", ok: true });
      const resp = await streamReq.response().catch(() => null);
      if (resp) {
        summary.streamResponseContentType = resp.headers()["content-type"] ?? null;
        summary.streamResponseStatus = resp.status();
        stages.push({
          stage: "sse-response-received",
          ok: (resp.headers()["content-type"] || "").startsWith(
            "text/event-stream"
          ),
          message: `${resp.status()} ${resp.headers()["content-type"]}`,
        });
      }
    } else {
      stages.push({ stage: "sse-request-issued", ok: false });
    }

    await page
      .waitForFunction(
        () => {
          const log = document.querySelector(".assistant-log");
          return log && (log.textContent || "").length > 0;
        },
        null,
        { timeout: 10_000 }
      )
      .catch(() => {});

    await page.screenshot({
      path: path.join(ART, "verify_04_agent_detail.png"),
    });

    summary.assistantLogExcerpt = await page
      .$eval(".assistant-log", (el) => el.textContent || "")
      .catch(() => "");
    stages.push({
      stage: "assistant-log-streamed",
      ok: summary.assistantLogExcerpt.length > 0,
      message: summary.assistantLogExcerpt.slice(0, 120),
    });
  } catch (err) {
    stages.push({
      stage: "fatal",
      ok: false,
      message: err?.message ?? String(err),
    });
  } finally {
    fs.writeFileSync(
      path.join(ART, "verify_summary.json"),
      JSON.stringify(summary, null, 2)
    );
    const relevant = network.filter((n) => n.url.includes("api.cursor.com"));
    fs.writeFileSync(
      path.join(ART, "verify_network.json"),
      JSON.stringify(relevant, null, 2)
    );
    fs.writeFileSync(
      path.join(ART, "verify_console.log"),
      consoleLog.join("\n")
    );
    await browser.close();
  }

  console.log("SUMMARY", JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(2);
});
