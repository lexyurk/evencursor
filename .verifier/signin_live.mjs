// Verifier script: exercises SignIn screen with a real Cursor API key
// (or the fake passed via env) and confirms the user is shifted to App.

import puppeteer from "puppeteer-core";

const URL = "http://localhost:5173/";
const CURSOR_API_KEY = process.env.CURSOR_API_KEY ?? "";
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? "test-deepgram-key";

if (!CURSOR_API_KEY) {
  console.error("CURSOR_API_KEY env var not set; aborting verification");
  process.exit(2);
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: { width: 1280, height: 900 }
});

const pages = await browser.pages();
const page = pages[0] ?? (await browser.newPage());

const consoleLines = [];
page.on("console", (msg) => {
  consoleLines.push(`[console.${msg.type()}] ${msg.text()}`);
});
page.on("pageerror", (err) => {
  consoleLines.push(`[pageerror] ${err.message}`);
});

const apiCalls = [];
page.on("request", (req) => {
  const u = req.url();
  if (u.includes("api.cursor.com")) {
    apiCalls.push(`${req.method()} ${u}`);
  }
});

// Wipe localStorage to ensure SignIn appears
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2", timeout: 15000 });

await page.waitForSelector("form.sign-in-form", { timeout: 10000 });
console.log("OK: SignIn form rendered");

const hrefs = await page.$$eval(".field-link", (els) => els.map((e) => e.getAttribute("href")));
console.log("Sign-In links:", JSON.stringify(hrefs));

await page.type('input[name="cursorKey"]', CURSOR_API_KEY);
await page.type('input[name="deepgramKey"]', DEEPGRAM_API_KEY);

const submit = await page.$(".btn-primary");
if (!submit) throw new Error("submit button missing");
await submit.click();

// Wait either for status text or for app shell to appear
const result = await page.waitForFunction(
  () => {
    const s = document.querySelector(".status");
    if (s && s.classList.contains("status-success")) {
      return { type: "success", text: s.textContent };
    }
    if (s && s.classList.contains("status-error")) {
      return { type: "error", text: s.textContent };
    }
    if (document.querySelector(".app-shell")) return { type: "appShell" };
    return null;
  },
  { timeout: 30000 }
);
console.log("Sign-in result:", JSON.stringify(await result.jsonValue()));

// Now wait for the inner app to fully boot. App.ts boot is async — mountVoiceBar
// may take up to ~1 s while glasses.init's 500 ms timeout fires.
await page.waitForFunction(
  () => Boolean(document.querySelector(".voice-bar") && document.querySelector(".agents-list")),
  { timeout: 20000 }
);
console.log("OK: VoiceBar + AgentsList present");

// Give listAgents time to fire
await new Promise((r) => setTimeout(r, 4000));

const agentsStatus = await page.$eval(".agents-list-status", (el) => el.textContent);
console.log("AgentsList status:", JSON.stringify(agentsStatus));

const agentRowCount = await page.$$eval(".agent-row", (els) => els.length);
console.log("Agent rows rendered:", agentRowCount);

console.log("api.cursor.com calls:");
for (const c of apiCalls) console.log("  ", c);

// Save a screenshot of the App after sign-in
await page.screenshot({ path: "/opt/cursor/artifacts/signin_to_appshell.png", fullPage: true });
console.log("screenshot saved -> /opt/cursor/artifacts/signin_to_appshell.png");

console.log("\n--- console captured ---");
for (const c of consoleLines) console.log(c);

await browser.disconnect();
console.log("DONE");
