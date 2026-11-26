const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function simulate(owned) {
  let closed = false;
  let disconnected = false;
  let enabled = false;
  let scenarioRan = false;
  const temp = path.resolve("synthetic-native-runner");
  const expectedVault = path.join(temp, "vault");
  const child = {
    exitCode: null, pid: 12345,
    stderr: { on: (_event, callback) => callback(Buffer.from("DevTools listening on ws://127.0.0.1:9999/devtools/browser/synthetic\n")) },
    on() {}, kill() { this.exitCode = 0; },
  };
  const app = {
    vault: { adapter: { getBasePath: () => owned ? expectedVault : path.resolve("unrelated-vault") } },
    workspace: { onLayoutReady: callback => callback() },
    plugins: { loadManifests: async () => { enabled = true; }, plugins: { "cfs-native-probe": {}, "confluence-folder-sync": {} } },
  };
  const page = { evaluate: async (fn, ...args) => fn(...args), waitForFunction: async (fn, _options, ...args) => assert.ok(fn(...args)) };
  const fakeFs = {
    mkdtempSync: () => temp, mkdirSync() {}, writeFileSync() {}, copyFileSync() {}, rmSync() {},
    readFileSync: () => "", existsSync: filename => filename === "synthetic-executable",
  };
  const process = { env: { OBSIDIAN_EXECUTABLE: "synthetic-executable" }, platform: "darwin", exitCode: 0 };
  const dependencies = {
    "node:fs": fakeFs, "node:path": path, "node:os": { tmpdir: () => temp },
    "node:child_process": { spawn: () => child, execFileSync() {} },
    "node:timers/promises": { setTimeout: async () => {} },
    "puppeteer-core": { connect: async () => ({ pages: async () => [page], close: async () => { closed = true; }, disconnect: () => { disconnected = true; }, version: async () => "Synthetic host" }) },
    "./native-scenario.cjs": async () => { scenarioRan = true; return { passed: true }; },
  };
  await vm.runInNewContext(readFileSync(path.join(__dirname, "native.cjs"), "utf8"), {
    require: name => { assert.ok(name in dependencies, "Unexpected runner dependency"); return dependencies[name]; },
    __dirname, process, app, window: { app, __cfsTestApi: {} }, document: { querySelectorAll: () => [] },
    console: { log() {}, error() {} }, Buffer, setTimeout: callback => callback(),
  });
  return { closed, disconnected, enabled, scenarioRan, exitCode: process.exitCode };
}

test("native runner rejects another vault without enabling plugins, running scenarios or closing that app", async () => {
  assert.deepEqual(await simulate(false), { closed: false, disconnected: true, enabled: false, scenarioRan: false, exitCode: 1 });
});

test("native runner closes its verified synthetic app after a successful scenario", async () => {
  assert.deepEqual(await simulate(true), { closed: true, disconnected: false, enabled: true, scenarioRan: true, exitCode: 0 });
});
