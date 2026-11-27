// Runs only an explicitly selected executable with a newly created profile and synthetic vault.
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { spawn, execFileSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const puppeteer = require("puppeteer-core");
const scenario = require("./native-scenario.cjs");
const root = resolve(__dirname, "..");

(async () => {
  const executable = process.env.OBSIDIAN_EXECUTABLE;
  if (!executable || !existsSync(executable)) throw new Error("Set OBSIDIAN_EXECUTABLE to a desktop executable.");
  const temp = mkdtempSync(join(tmpdir(), "cfs-native-"));
  const vault = join(temp, "vault");
  const profile = join(temp, "profile");
  const config = join(vault, ".obsidian");
  mkdirSync(config, { recursive: true });
  mkdirSync(profile);
  mkdirSync(join(vault, "Docs"));
  writeFileSync(join(vault, "Docs", "One.md"), "Intro\nold A\nTail\n");
  writeFileSync(join(config, "app.json"), JSON.stringify({ safeMode: false }));
  writeFileSync(join(config, "community-plugins.json"), JSON.stringify(["cfs-native-probe", "confluence-folder-sync"]));
  const plugin = join(config, "plugins", "confluence-folder-sync");
  mkdirSync(plugin, { recursive: true });
  for (const file of ["main.js", "manifest.json", "styles.css"]) copyFileSync(join(root, file), join(plugin, file));
  const probe = join(config, "plugins", "cfs-native-probe");
  mkdirSync(probe);
  writeFileSync(join(probe, "manifest.json"), JSON.stringify({ id: "cfs-native-probe", name: "Synthetic test probe", version: "1.0.0", minAppVersion: "1.11.4", author: "Test", isDesktopOnly: true }));
  writeFileSync(join(probe, "main.js"), 'const api = require("obsidian"); module.exports = class extends api.Plugin { onload() { window.__cfsTestApi = api; } onunload() { delete window.__cfsTestApi; } };');
  writeFileSync(join(profile, "obsidian.json"), JSON.stringify({ vaults: { cfsfixture: { path: vault, ts: Date.now(), open: true } }, updateDisabled: true }));
  const args = [`--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
    "--disable-gpu", "--disable-background-networking", "--disable-quic", "--disable-sync", "--no-first-run",
    "--proxy-server=127.0.0.1:1", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost"];
  // The sandbox exception is limited to an unprivileged disposable Linux CI runner without real data.
  if (process.platform === "linux" && process.env.CI === "true") args.push("--no-sandbox");
  const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: false });
  let logs = "";
  child.stderr.on("data", data => { logs = (logs + data).slice(-16000); });
  child.on("error", error => { logs += String(error); });
  let browser;
  let ownedInstance = false;
  try {
    const deadline = Date.now() + 90000;
    let endpoint;
    while (Date.now() < deadline) {
      endpoint = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/.exec(logs)?.[1];
      if (endpoint) break;
      const active = join(profile, "DevToolsActivePort");
      if (existsSync(active)) {
        const [port, path] = readFileSync(active, "utf8").trim().split(/\r?\n/);
        endpoint = `ws://127.0.0.1:${port}${path}`;
        break;
      }
      if (child.exitCode !== null) throw new Error("Desktop exited before CDP connection.\n" + logs);
      await delay(250);
    }
    if (!endpoint) throw new Error("Desktop CDP startup timed out.\n" + logs);
    browser = await puppeteer.connect({ browserWSEndpoint: endpoint, defaultViewport: null });
    let page;
    while (Date.now() < deadline) {
      for (const candidate of await browser.pages()) {
        if (await candidate.evaluate(() => Boolean(window.app?.vault?.adapter && window.app?.workspace?.onLayoutReady && window.app?.plugins)).catch(() => false)) { page = candidate; break; }
      }
      if (page) break;
      await delay(250);
    }
    if (!page) throw new Error("Synthetic vault did not open.\n" + logs);
    await page.evaluate(async expected => {
      const actual = app.vault.adapter.getBasePath();
      if (actual.replace(/\\/g, "/") !== expected.replace(/\\/g, "/")) throw new Error("Refusing a non-fixture vault.");
      await Promise.race([
        new Promise(resolve => app.workspace.onLayoutReady(resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Fixture layout readiness timed out")), 30000)),
      ]);
    }, vault);
    ownedInstance = true;
    const trustLabels = ["Trust author and enable plugins", "작성자를 신뢰하고 플러그인 사용하기"];
    await page.waitForFunction(labels => Boolean(window.__cfsTestApi) ||
      [...document.querySelectorAll("button")].some(button => labels.includes(button.textContent)), { timeout: 30000 }, trustLabels);
    await page.evaluate(async labels => {
      const trust = [...document.querySelectorAll("button")].find(button => labels.includes(button.textContent));
      if (trust) trust.click();
      await new Promise(resolve => setTimeout(resolve, 250));
      await app.plugins.loadManifests();
      for (const id of ["cfs-native-probe", "confluence-folder-sync"]) {
        if (!app.plugins.plugins[id]) await app.plugins.enablePluginAndSave(id);
      }
    }, trustLabels);
    try {
      await page.waitForFunction(() => Boolean(window.__cfsTestApi && app.plugins.plugins["confluence-folder-sync"]), { timeout: 10000 });
    } catch (error) {
      console.error(await page.evaluate(() => ({ loaded: Object.keys(app.plugins.plugins), manifests: Object.keys(app.plugins.manifests),
        enabled: [...app.plugins.enabledPlugins], text: document.body.innerText.slice(0, 2500) })));
      throw error;
    }
    console.log("Native host: " + process.platform + ", " + await browser.version());
    const result = await page.evaluate(scenario, { expectedVault: vault, source: readFileSync(join(root, "main.js"), "utf8"),
      markdownScenario: readFileSync(join(__dirname, "markdown-scenario.cjs"), "utf8") });
    console.log(JSON.stringify(result));
    if (!result.passed) throw new Error("Native scenario did not pass.");
  } finally {
    if (browser) {
      if (ownedInstance) await browser.close().catch(() => {});
      else browser.disconnect();
    }
    if (process.platform === "win32" && child.exitCode === null) {
      try { execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
    } else if (child.exitCode === null) child.kill("SIGTERM");
    for (let attempt = 0; attempt < 20 && child.exitCode === null; attempt++) await delay(100);
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(temp, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
