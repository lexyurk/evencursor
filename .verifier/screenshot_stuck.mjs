import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222" });
const page = (await browser.pages())[0] ?? (await browser.newPage());
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("form.sign-in-form");
await page.screenshot({ path: "/opt/cursor/artifacts/signin_screen.png", fullPage: true });

await page.type('input[name="cursorKey"]', process.env.CURSOR_API_KEY ?? "");
await page.type('input[name="deepgramKey"]', "fake-deepgram-key");
await page.click(".btn-primary");
await page.waitForSelector(".app-shell", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: "/opt/cursor/artifacts/app_shell_stuck_after_signin.png", fullPage: true });
console.log("Saved screenshots");
await browser.disconnect();
