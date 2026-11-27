const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setImmediate: nextTurn } = require("node:timers/promises");
const { runtime } = require("./runtime.cjs");
const { fixtureConfig, fixtureFolder } = require("./fixtures.cjs");
const lib = runtime();

function setupFixture() {
  let secret = "synthetic-private-token";
  const files = ["Docs/One.md", "Docs/Two.md", "Docs/Nested/Three.md", "Docs/.hidden/Excluded.md"].map(path =>
    ({ path, basename: path.split("/").at(-1).slice(0, -3), extension: "md" }));
  const folders = new Map([["Docs", fixtureFolder("Docs", files)]]);
  const occupied = new Set();
  const app = { vault: {
    getFolderByPath: path => folders.get(path),
    getAbstractFileByPath: path => folders.get(path) ?? (occupied.has(path) ? { path, extension: "txt" } : null),
    read: () => { throw new Error("Setup must never read document contents"); },
    create: () => { throw new Error("Setup must never create documents"); },
  }, secretStorage: { getSecret: id => id === "fixture" ? secret : null } };
  const settings = { ...fixtureConfig, allowPublish: true, autoCheck: true, autoPublish: true, language: "en", autoMinutes: 15 };
  const counters = { connects: 0, descendants: 0, saves: 0, timerConfigurations: 0 };
  const plugin = { app, manifest: { version: "0.8.0" }, data: { settings, profiles: { preserved: { pages: { "file:Docs/One.md": { id: "201" } } } } },
    t: (message, values) => lib.translate("en", message, values),
    saving: Promise.resolve(), applyRenames: async () => {},
    persist: async () => { counters.saves++; }, automatic: { configure: () => counters.timerConfigurations++ } };
  plugin.exclusive = task => lib.ConfluenceFolderSync.prototype.exclusive.call(plugin, task);
  plugin.saveSetup = (...args) => lib.ConfluenceFolderSync.prototype.saveSetup.call(plugin, ...args);
  const createClient = config => {
    assert.equal(config.allowPublish, false);
    assert.equal(config.autoCheck, false);
    return { connect: async () => { counters.connects++; }, get: async (path, params) => {
      assert.equal(path, "/wiki/api/v2/folders/100/descendants");
      assert.deepEqual(params, { limit: 1, depth: 1 });
      counters.descendants++;
      return { results: [{ id: "201", title: "Private remote title excluded from report" }] };
    } };
  };
  const verify = draft => lib.verifySetup(app, draft ?? plugin.data.settings, createClient);
  return { app, plugin, folders, occupied, counters, createClient, verify, rotateSecret: value => { secret = value; } };
}

test("setup inspects only the visible source branch without reading notes or creating an inbox", () => {
  const fixture = setupFixture();
  const result = lib.inspectSetup(fixture.app, fixture.plugin.data.settings);
  assert.equal(result.ok, true);
  assert.equal(result.values.noteCount, 3);
  assert.equal(result.values.inboxMissing, true);
  assert.equal(fixture.folders.has("Incoming"), false);
  assert.equal(fixture.counters.saves, 0);
});

test("setup diagnoses invalid targets, account/secret, overlapping paths, missing source and occupied inbox", () => {
  const fixture = setupFixture();
  const settings = fixture.plugin.data.settings;
  for (const [change, code] of [
    [{ folderUrl: "https://example.atlassian.net/wiki/spaces/DOC/pages/100" }, "TARGET"],
    [{ folderUrl: "https://evil.example/wiki/spaces/DOC/folder/100" }, "TARGET"],
    [{ email: "invalid" }, "ACCOUNT"], [{ secretId: "missing" }, "SECRET"],
    [{ inbox: "Docs/Incoming" }, "FOLDERS"], [{ source: "Missing" }, "SOURCE"],
  ]) {
    const result = lib.inspectSetup(fixture.app, { ...settings, ...change });
    assert.equal(result.ok, false);
    assert.ok(result.checks.some(item => item.code === code), code);
  }
  fixture.occupied.add("Incoming");
  assert.ok(lib.inspectSetup(fixture.app, settings).checks.some(item => item.code === "INBOX"));
  fixture.occupied.clear(); fixture.occupied.add("Parent");
  assert.ok(lib.inspectSetup(fixture.app, { ...settings, inbox: "Parent/Incoming" }).checks.some(item => item.code === "INBOX"));
});

test("read-only verification makes a bounded descendants probe and preserves all saved state", async () => {
  const fixture = setupFixture();
  const before = JSON.stringify(fixture.plugin.data);
  const result = await fixture.verify();
  assert.equal(result.ok, true);
  assert.equal(result.noteCount, 3);
  assert.equal(fixture.counters.connects, 1);
  assert.equal(fixture.counters.descendants, 1);
  assert.equal(fixture.counters.saves, 0);
  assert.equal(JSON.stringify(fixture.plugin.data), before);
  assert.equal(JSON.stringify(result).includes("synthetic-private-token"), false);
});

test("invalid local inputs never construct an authenticated client", async () => {
  const fixture = setupFixture();
  const result = await fixture.verify({ ...fixture.plugin.data.settings, secretId: "missing" });
  assert.equal(result.ok, false);
  assert.equal(fixture.counters.connects, 0);
});

test("the production Confluence transport performs only tenant, folder and one read-scope GET during setup", async () => {
  const fixture = setupFixture();
  const requests = [];
  const result = await lib.verifySetup(fixture.app, fixture.plugin.data.settings, (config, token, check) =>
    new lib.ConfluenceCloud(config, token, async request => {
      requests.push({ method: request.method, path: new URL(request.url).pathname });
      assert.equal(request.method, "GET");
      if (request.url.endsWith("/_edge/tenant_info")) return { status: 200, json: { cloudId: "12345678-1234-1234-1234-123456789012" } };
      if (request.url.endsWith("/folders/100")) return { status: 200, json: { id: "100", status: "current", spaceId: "300" } };
      assert.ok(request.url.includes("/folders/100/descendants?"));
      assert.equal(new URL(request.url).searchParams.get("limit"), "1");
      return { status: 200, json: { results: [] } };
    }, { check }));
  assert.equal(result.ok, true);
  assert.equal(requests.length, 3);
});

test("HTTP and unknown errors produce useful fixed codes without raw response diagnostics", async () => {
  const fixture = setupFixture();
  for (const [status, code] of [[401, "AUTH"], [403, "FORBIDDEN"], [404, "NOT_FOUND"], [429, "LIMITED"], [503, "SERVICE"], [500, "REQUEST"]]) {
    const result = await lib.verifySetup(fixture.app, fixture.plugin.data.settings, () => ({
      connect: async () => { throw new lib.ApiError("GET", status); },
    }));
    assert.equal(result.checks.at(-1).code, code);
    assert.equal(result.checks.at(-1).httpStatus, status);
  }
  const result = await lib.verifySetup(fixture.app, fixture.plugin.data.settings, () => ({
    connect: async () => { throw new Error("private-token name@example.com /private/path document body"); },
  }));
  assert.equal(result.checks.at(-1).code, "REQUEST");
  const report = JSON.stringify(lib.setupDiagnostics(fixture.plugin, result));
  for (const value of ["private-token", "name@example.com", "/private/path", "document body"]) assert.equal(report.includes(value), false);
});

test("diagnostic export uses a strict allowlist and excludes all draft, credentials and content fields", async () => {
  const fixture = setupFixture();
  const verified = await fixture.verify();
  Object.assign(verified, { email: "private@example.com", token: "raw-private-token", source: "Private/Docs", folderId: "123456789", body: "Private body" });
  verified.checks.push({ id: "unknown-private-field", status: "fail", code: "body-private" });
  verified.checks[0].secretId = "private-secret-id";
  verified.checks[0].code = "__proto__";
  const report = lib.setupDiagnostics(fixture.plugin, verified);
  assert.deepEqual(Object.keys(report), ["schema", "plugin", "pluginVersion", "obsidianVersion", "outcome", "checks"]);
  assert.equal(report.checks.length, 4);
  const text = JSON.stringify(report);
  for (const value of ["private@example.com", "raw-private-token", "Private/Docs", "123456789", "Private body", "private-secret-id", "__proto__", "example.atlassian.net", "tokenHash"]) assert.equal(text.includes(value), false, value);
});

test("a verified connection saves explicitly with automation off while retaining all page mappings", async () => {
  const fixture = setupFixture();
  const baseline = JSON.stringify(fixture.plugin.data.settings);
  const profiles = JSON.stringify(fixture.plugin.data.profiles);
  const verified = await fixture.verify();
  await fixture.plugin.saveSetup(fixture.plugin.data.settings, verified, baseline);
  assert.equal(fixture.counters.saves, 1);
  assert.equal(fixture.counters.timerConfigurations, 1);
  for (const key of ["allowPublish", "autoCheck", "autoPublish"]) assert.equal(fixture.plugin.data.settings[key], false);
  assert.equal(JSON.stringify(fixture.plugin.data.profiles), profiles);
  assert.equal(fixture.plugin.setupSaving, false);
  assert.equal(JSON.stringify(fixture.plugin.data).includes("tokenHash"), false);
});

test("changed fields, expired verification and rotated secrets require a new check before save", async () => {
  for (const change of ["fields", "expiry", "secret"]) {
    const fixture = setupFixture();
    const baseline = JSON.stringify(fixture.plugin.data.settings);
    const verified = await fixture.verify();
    const draft = { ...fixture.plugin.data.settings };
    if (change === "fields") draft.inbox = "Other inbox";
    else if (change === "expiry") verified.checkedAt = Date.now() - 301000;
    else fixture.rotateSecret("rotated-synthetic-secret");
    await assert.rejects(fixture.plugin.saveSetup(draft, verified, baseline), error => error.code === "STALE");
    assert.equal(fixture.counters.saves, 0);
    assert.equal(JSON.stringify(fixture.plugin.data.settings), baseline);
  }
});

test("another settings edit before or during save preparation is preserved and never overwritten", async () => {
  for (const during of [false, true]) {
    const fixture = setupFixture();
    const baseline = JSON.stringify(fixture.plugin.data.settings);
    const draft = { ...fixture.plugin.data.settings };
    const verified = await fixture.verify();
    if (!during) fixture.plugin.data.settings.email = "edited@example.com";
    let calls = 0;
    await assert.rejects(fixture.plugin.saveSetup(draft, verified, baseline, () => {
      if (during && ++calls === 2) fixture.plugin.data.settings.email = "edited@example.com";
    }), error => error.code === "SETTINGS_CHANGED");
    assert.equal(fixture.plugin.data.settings.email, "edited@example.com");
    assert.equal(fixture.counters.saves, 0);
  }
});

test("a failed or uncertain save restores previous settings in memory and reports only a fixed issue", async () => {
  for (const failures of [1, 2]) {
    const fixture = setupFixture();
    const baseline = JSON.stringify(fixture.plugin.data.settings);
    const verified = await fixture.verify();
    let attempts = 0;
    fixture.plugin.persist = async () => { if (++attempts <= failures) throw new Error("private file path"); };
    await assert.rejects(fixture.plugin.saveSetup(fixture.plugin.data.settings, verified, baseline), error =>
      error.code === (failures === 1 ? "SAVE" : "SAVE_UNCERTAIN"));
    assert.equal(attempts, 2);
    assert.equal(JSON.stringify(fixture.plugin.data.settings), baseline);
    assert.equal(fixture.plugin.setupSaving, false);
    assert.equal(fixture.counters.timerConfigurations, 0);
  }
});

test("a settings control cannot mutate the connection while the setup save is in progress", async () => {
  const fixture = setupFixture();
  const baseline = JSON.stringify(fixture.plugin.data.settings);
  const verified = await fixture.verify();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let saving = false;
  fixture.plugin.persist = async () => { saving = true; await held; };
  const task = fixture.plugin.saveSetup(fixture.plugin.data.settings, verified, baseline);
  const deadline = Date.now() + 2000;
  while (!saving && Date.now() < deadline) await nextTurn();
  assert.equal(saving, true);
  await lib.ConfluenceFolderSync.prototype.configure.call(fixture.plugin, "email", "blocked@example.com");
  assert.notEqual(fixture.plugin.data.settings.email, "blocked@example.com");
  release(); await task;
  assert.equal(fixture.plugin.setupSaving, false);
});

test("closing during a network check stops subsequent probes and never saves settings", async () => {
  const fixture = setupFixture();
  let cancelled = false;
  const guard = () => { if (cancelled) { const error = new Error(); error.name = "AbortError"; throw error; } };
  await assert.rejects(lib.verifySetup(fixture.app, fixture.plugin.data.settings, () => ({
    connect: async () => { cancelled = true; },
    get: async () => { throw new Error("A second request must not start"); },
  }), guard), { name: "AbortError" });
  assert.equal(fixture.counters.saves, 0);
});

test("a token replaced during the read check cannot become a valid verification", async () => {
  const fixture = setupFixture();
  const result = await lib.verifySetup(fixture.app, fixture.plugin.data.settings, () => ({
    connect: async () => fixture.rotateSecret("rotated"), get: async () => ({ results: [] }),
  }));
  assert.equal(result.ok, false);
  assert.equal(result.checks.at(-1).code, "STALE");
});

test("token rotation at the final guards blocks a write or rolls back an already saved connection", async () => {
  for (const stage of [2, 3]) {
    const fixture = setupFixture();
    const baseline = JSON.stringify(fixture.plugin.data.settings);
    const verified = await fixture.verify();
    let calls = 0;
    await assert.rejects(fixture.plugin.saveSetup(fixture.plugin.data.settings, verified, baseline, () => {
      if (++calls === stage) fixture.rotateSecret("changed-at-save-boundary");
    }), error => error.code === "STALE");
    assert.equal(fixture.counters.saves, stage === 2 ? 0 : 2);
    assert.equal(JSON.stringify(fixture.plugin.data.settings), baseline);
    assert.equal(fixture.counters.timerConfigurations, 0);
  }
});

test("verification expiry during preparation or persisted I/O is rechecked at the commit boundary", async context => {
  const realNow = Date.now();
  let time = realNow;
  context.mock.method(Date, "now", () => time);
  for (const stage of [2, 3]) {
    time = realNow;
    const fixture = setupFixture();
    const baseline = JSON.stringify(fixture.plugin.data.settings);
    const verified = await fixture.verify();
    let calls = 0;
    await assert.rejects(fixture.plugin.saveSetup(fixture.plugin.data.settings, verified, baseline, () => {
      if (++calls === stage) time += 301000;
    }), error => error.code === "STALE");
    assert.equal(fixture.counters.saves, stage === 2 ? 0 : 2);
    assert.equal(JSON.stringify(fixture.plugin.data.settings), baseline);
  }
});

test("closing the wizard while settings persist restores the previous connection on disk and in memory", async () => {
  const fixture = setupFixture();
  const baseline = JSON.stringify(fixture.plugin.data.settings);
  const draft = { ...fixture.plugin.data.settings, inbox: "Different inbox" };
  const verified = await fixture.verify(draft);
  let open = true;
  let started = false;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let saves = 0;
  let disk;
  fixture.plugin.persist = async () => {
    disk = JSON.stringify(fixture.plugin.data.settings);
    if (++saves === 1) { started = true; await held; }
  };
  const task = fixture.plugin.saveSetup(draft, verified, baseline, () => {
    if (!open) { const error = new Error(); error.name = "AbortError"; throw error; }
  });
  const rejected = assert.rejects(task, { name: "AbortError" });
  const deadline = Date.now() + 2000;
  while (!started && Date.now() < deadline) await nextTurn();
  assert.equal(started, true);
  open = false;
  release();
  await rejected;
  assert.equal(saves, 2);
  assert.equal(disk, baseline);
  assert.equal(JSON.stringify(fixture.plugin.data.settings), baseline);
  assert.equal(fixture.plugin.setupSaving, false);
});

test("a source folder removed during preparation prevents saving its obsolete path", async () => {
  const fixture = setupFixture();
  const baseline = JSON.stringify(fixture.plugin.data.settings);
  const verified = await fixture.verify();
  let calls = 0;
  await assert.rejects(fixture.plugin.saveSetup(fixture.plugin.data.settings, verified, baseline, () => {
    if (++calls === 2) fixture.folders.delete("Docs");
  }), error => error.code === "SOURCE");
  assert.equal(fixture.counters.saves, 0);
});
