// Confirms exactly why the App.boot returns early after sign-in by
// instrumenting the running page's KeyStore + GlassesAdapter behaviour.

import puppeteer from "puppeteer-core";

const URL = "http://localhost:5173/";
const CURSOR_API_KEY = process.env.CURSOR_API_KEY ?? "";

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: { width: 1280, height: 900 }
});
const page = (await browser.pages())[0] ?? (await browser.newPage());

const lines = [];
page.on("console", (m) => lines.push(`[console.${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => lines.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("form.sign-in-form");
await page.type('input[name="cursorKey"]', CURSOR_API_KEY);
await page.type('input[name="deepgramKey"]', "fake-deepgram-key");
await page.click(".btn-primary");
await page.waitForSelector(".app-shell", { timeout: 30000 });

// Once App is mounted, probe whether the key roundtrips via the SDK bridge
const probe = await page.evaluate(async () => {
  const sdk = await import("/node_modules/.vite/deps/@evenrealities_even_hub_sdk.js?v=anything").catch(
    () => null
  );
  // Use top-level import path through Vite's module graph instead
  const realSdk = await import("/@id/@evenrealities/even_hub_sdk").catch((e) => ({ error: String(e) }));
  if (realSdk && "error" in realSdk) {
    return { sdkImportFailed: realSdk.error, localStorage: { ...localStorage } };
  }
  // The SDK auto-initialises the bridge; try to use it.
  let bridge;
  try {
    bridge = await Promise.race([
      realSdk.waitForEvenAppBridge(),
      new Promise((res) => setTimeout(() => res(null), 1500)),
    ]);
  } catch (e) {
    return { error: String(e), localStorage: { ...localStorage } };
  }
  if (!bridge) {
    return { bridgeResolved: false, localStorage: { ...localStorage } };
  }
  // Try to set + get
  let setResult, getResult, setError, getError;
  try {
    setResult = await Promise.race([
      bridge.setLocalStorage("verifier_probe", "hello"),
      new Promise((res) => setTimeout(() => res("__timeout__"), 2000)),
    ]);
  } catch (e) { setError = String(e); }
  try {
    getResult = await Promise.race([
      bridge.getLocalStorage("verifier_probe"),
      new Promise((res) => setTimeout(() => res("__timeout__"), 2000)),
    ]);
  } catch (e) { getError = String(e); }
  let getCursor;
  try {
    getCursor = await Promise.race([
      bridge.getLocalStorage("cursor.apiKey"),
      new Promise((res) => setTimeout(() => res("__timeout__"), 2000)),
    ]);
  } catch (e) { getCursor = `error: ${String(e)}`; }
  return {
    bridgeResolved: true,
    bridgeKind: typeof bridge,
    setResult,
    getResult,
    setError,
    getError,
    getCursor,
    localStorageKeys: Object.keys(localStorage),
    localStorageCursor: localStorage.getItem("cursor.apiKey"),
    localStorageDeepgram: localStorage.getItem("deepgram.apiKey"),
  };
});
console.log("Probe:", JSON.stringify(probe, null, 2));

// And inspect whether VoiceBar/AgentsList ever mount after another 5s
await new Promise((r) => setTimeout(r, 5000));
const ui = await page.evaluate(() => ({
  hasVoice: Boolean(document.querySelector(".voice-bar")),
  hasList: Boolean(document.querySelector(".agents-list")),
  bodySnippet: document.body.innerText.slice(0, 500),
}));
console.log("UI after 5s:", JSON.stringify(ui, null, 2));

console.log("\n--- console captured ---");
for (const c of lines) console.log(c);

await browser.disconnect();
