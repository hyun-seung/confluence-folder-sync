const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");

function findBrowser() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) throw new Error("CHROME_PATH does not point to a browser executable.");
    return process.env.CHROME_PATH;
  }
  const candidates = process.platform === "darwin" ? [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ] : process.platform === "win32" ? [
    join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
  ] : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  for (const command of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
    try {
      const result = execFileSync(process.platform === "win32" ? "where.exe" : "which", [command], { encoding: "utf8" });
      const path = result.trim().split(/\r?\n/)[0];
      if (existsSync(path)) return path;
    } catch { /* Try the next installed browser. */ }
  }
  throw new Error("Install Chrome/Chromium or set CHROME_PATH. This test does not download a browser.");
}

module.exports = { findBrowser };
