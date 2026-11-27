const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const lib = new Function("require", "module", readFileSync(join(__dirname, "../main.js"), "utf8") +
  "\nreturn { HistoryModal, digest, publicationTarget, DEFAULT_SETTINGS, loadConnections, changeConnection, connectionContext, assertConnection, setupTemplate, parseSetupTemplate, checkConnectionScopes, verifySetup, ConfluenceFolderSync, ConfluenceCloud, Publisher, validatedConfig, publicationReview, publishSelection, preparedNotes }; ")(
  () => ({ Plugin: class {}, Modal: class {}, Notice: class {}, PluginSettingTab: class {} }), { exports: {} });
const { fixtureConfig, selectionFixture, fixtureFolder } = require("./fixtures.cjs");

function fixture() {
  let disk;
  let saveHook;
  const counters = { saves: 0, timers: 0, cleared: 0 };
  const stored = { settings: { ...fixtureConfig, allowPublish: true, autoCheck: true, autoPublish: true, language: "ko", autoMinutes: 15, mermaidMode: "image" } };
  const plugin = { data: { ...lib.loadConnections(stored), profiles: { preserved: { pages: { "file:Docs/One.md": { id: "201" } } } }, history: [{ id: "old" }], backups: [{ id: "backup" }] },
    app: { vault: new Proxy({}, { get: () => { throw new Error("Connection management must not access vault files"); } }),
      secretStorage: { getSecret: () => { throw new Error("Connection management must not read credentials"); } } },
    connectionEpoch: 1, saving: Promise.resolve(), applyRenames: async () => {},
    automatic: { configure: () => counters.timers++, clearTimers: () => counters.cleared++ },
    t: value => value, saveData: async snapshot => { counters.saves++; if (saveHook) await saveHook(snapshot); disk = structuredClone(snapshot); },
  };
  plugin.persist = () => lib.ConfluenceFolderSync.prototype.persist.call(plugin);
  plugin.exclusive = task => lib.ConfluenceFolderSync.prototype.exclusive.call(plugin, task);
  plugin.configure = (...args) => lib.ConfluenceFolderSync.prototype.configure.call(plugin, ...args);
  const change = action => lib.changeConnection(plugin, action, lib.connectionContext(plugin));
  return { plugin, counters, change, disk: () => disk, hook: fn => { saveHook = fn; } };
}

test("legacy settings become a named connection without mutating the original document or mapping data", () => {
  const stored = { settings: { ...fixtureConfig, allowPublish: true, autoPublish: true }, profiles: { secretMapping: { id: "201" } } };
  const before = JSON.stringify(stored);
  const state = lib.loadConnections(stored);
  assert.equal(JSON.stringify(stored), before);
  assert.equal(state.activeConnectionId, "default");
  assert.equal(state.settings.secretId, "fixture");
  assert.equal(state.settings.connectionMode, "publisher");
  assert.equal(state.connections.default.settings.allowPublish, true);
});

test("fresh installations start in read-only mode", () => {
  const state = lib.loadConnections({});
  assert.equal(state.settings.connectionMode, "read-only");
  assert.equal(state.connections.default.settings.allowPublish, false);
});

test("new connections are separate, read-only and unconfigured while legacy links and credentials survive", async () => {
  const f = fixture();
  const preserved = JSON.stringify([f.plugin.data.profiles, f.plugin.data.history, f.plugin.data.backups]);
  const id = await f.change({ kind: "create", name: "Second" });
  assert.equal(f.plugin.data.activeConnectionId, id);
  assert.equal(f.plugin.data.settings.connectionMode, "read-only");
  for (const key of ["folderUrl", "email", "secretId"]) assert.equal(f.plugin.data.settings[key], "");
  for (const key of ["allowPublish", "autoPublish", "autoCheck"]) assert.equal(f.plugin.data.settings[key], false);
  assert.equal(f.plugin.data.connections.default.settings.secretId, "fixture");
  assert.equal(f.plugin.data.connections.default.settings.autoPublish, false);
  assert.equal(f.plugin.data.settings.language, "ko");
  assert.equal(JSON.stringify([f.plugin.data.profiles, f.plugin.data.history, f.plugin.data.backups]), preserved);
  assert.equal(f.counters.saves, 1);
});

test("A to B to A restores each account and source, disables automation and invalidates original proofs", async () => {
  const f = fixture();
  const original = lib.connectionContext(f.plugin);
  await f.change({ kind: "create", name: "Second" });
  await f.plugin.configure("email", "second@example.com");
  await f.plugin.configure("secretId", "second-secret");
  await f.plugin.configure("source", "Second docs");
  const secondId = f.plugin.data.activeConnectionId;
  await f.change({ kind: "switch", id: "default" });
  assert.equal(f.plugin.data.settings.email, fixtureConfig.email);
  assert.equal(f.plugin.data.settings.source, "Docs");
  assert.equal(f.plugin.data.settings.secretId, "fixture");
  assert.equal(f.plugin.data.settings.autoPublish, false);
  assert.equal(f.plugin.data.settings.autoCheck, false);
  assert.throws(() => lib.assertConnection(f.plugin, original), /active connection changed/);
  await f.change({ kind: "switch", id: secondId });
  assert.equal(f.plugin.data.settings.email, "second@example.com");
  assert.equal(f.plugin.data.settings.secretId, "second-secret");
  assert.equal(f.plugin.data.settings.source, "Second docs");
  assert.equal(f.plugin.data.settings.language, "ko");
});

test("rename and inactive removal preserve page links, histories, backups and secrets", async () => {
  const f = fixture();
  await f.change({ kind: "create", name: "Second" });
  const second = f.plugin.data.activeConnectionId;
  await f.change({ kind: "rename", id: second, name: "Renamed" });
  assert.equal(f.plugin.data.connections[second].name, "Renamed");
  const before = JSON.stringify([f.plugin.data.profiles, f.plugin.data.history, f.plugin.data.backups]);
  await f.change({ kind: "remove", id: "default" });
  assert.equal(JSON.stringify([f.plugin.data.profiles, f.plugin.data.history, f.plugin.data.backups]), before);
  assert.equal(f.plugin.data.connections.default, undefined);
});

test("active removal, duplicate normalized names and a 33rd connection are rejected without saving", async () => {
  const f = fixture();
  await assert.rejects(f.change({ kind: "remove", id: "default" }), /Switch to another/);
  await assert.rejects(f.change({ kind: "create", name: "DEFAULT CONNECTION" }), /already exists/);
  for (let n = 1; n < 32; n++) f.plugin.data.connections[crypto.randomUUID()] = { name: "Connection " + n, settings: { ...f.plugin.data.connections.default.settings } };
  await assert.rejects(f.change({ kind: "create", name: "33rd" }), /32 connections/);
  assert.equal(f.counters.saves, 0);
});

test("configuration cannot switch or change account while an operation is running", async () => {
  const f = fixture();
  f.plugin.running = true;
  const before = JSON.stringify(f.plugin.data);
  await assert.rejects(f.change({ kind: "create", name: "Second" }), /already running/);
  assert.equal(await f.plugin.configure("email", "changed@example.com"), false);
  assert.equal(JSON.stringify(f.plugin.data), before);
  assert.equal(f.counters.saves, 0);
});

test("configuration cannot switch while setup settings are saving", async () => {
  const f = fixture();
  f.plugin.setupSaving = true;
  await assert.rejects(f.change({ kind: "create", name: "Second" }), /finish saving/);
  assert.equal(f.counters.saves, 0);
});

test("stale settings callbacks cannot alter B or A after A to B to A", async () => {
  const f = fixture();
  const context = lib.connectionContext(f.plugin);
  await f.change({ kind: "create", name: "Second" });
  assert.equal(await f.plugin.configure("email", "wrong@example.com", context), false);
  assert.equal(f.plugin.data.settings.email, "");
  await f.change({ kind: "switch", id: "default" });
  assert.equal(await f.plugin.configure("autoPublish", true, context), false);
  assert.equal(f.plugin.data.settings.autoPublish, false);
});

test("account, path and role changes invalidate views even when changed back to the same value", async () => {
  const f = fixture();
  for (const [key, value] of [["email", "other@example.com"], ["source", "Other"], ["inbox", "Other inbox"], ["secretId", "other-secret"], ["connectionMode", "read-only"]]) {
    const context = lib.connectionContext(f.plugin);
    const before = f.plugin.data.settings[key];
    await f.plugin.configure(key, value);
    await f.plugin.configure(key, before);
    assert.throws(() => lib.assertConnection(f.plugin, context), /active connection changed/);
  }
});

for (const afterWrite of [false, true]) test("failed connection persistence rolls back both settings representations (write occurred: " + afterWrite + ")", async () => {
  const f = fixture();
  let first = true;
  let uncertainDisk;
  f.hook(async snapshot => {
    if (first) {
      first = false;
      if (afterWrite) uncertainDisk = structuredClone(snapshot);
      throw new Error("Synthetic save failure");
    }
  });
  const context = lib.connectionContext(f.plugin);
  await assert.rejects(f.change({ kind: "create", name: "Second" }), /save failure/);
  assert.equal(f.plugin.data.activeConnectionId, "default");
  assert.equal(Object.keys(f.plugin.data.connections).length, 1);
  assert.equal(f.plugin.data.settings.autoPublish, false);
  assert.equal(f.plugin.data.connections.default.settings.autoPublish, false);
  assert.equal(f.plugin.data.settings.email, fixtureConfig.email);
  assert.throws(() => lib.assertConnection(f.plugin, context));
  const restarted = lib.loadConnections(f.disk());
  assert.equal(restarted.activeConnectionId, "default");
  assert.equal(restarted.settings.secretId, "fixture");
  assert.equal(restarted.settings.autoCheck, false);
  if (afterWrite) assert.notEqual(uncertainDisk.activeConnectionId, "default");
});

test("an unprovable rollback reports uncertainty and leaves in-memory automation off", async () => {
  const f = fixture();
  f.hook(async () => { throw new Error("Synthetic unavailable disk"); });
  await assert.rejects(f.change({ kind: "create", name: "Second" }), /outcome is uncertain/);
  assert.equal(f.plugin.data.settings.autoPublish, false);
  assert.equal(f.plugin.data.settings.autoCheck, false);
  assert.equal(f.plugin.connectionSaving, false);
});

test("closing the modal during persistence rolls the new connection back", async () => {
  const f = fixture();
  let open = true;
  f.hook(async () => { open = false; });
  await assert.rejects(lib.changeConnection(f.plugin, { kind: "create", name: "Second" }, lib.connectionContext(f.plugin), () => {
    if (!open) { const error = new Error(); error.name = "AbortError"; throw error; }
  }), { name: "AbortError" });
  assert.equal(f.plugin.data.activeConnectionId, "default");
  assert.equal(Object.keys(f.disk().connections).length, 1);
});

test("restarting selects the saved active record instead of mixing credentials from a stale compatibility view", async () => {
  const f = fixture();
  await f.change({ kind: "create", name: "Second" });
  await f.plugin.configure("email", "second@example.com");
  await f.plugin.configure("secretId", "second-secret");
  const disk = f.disk();
  disk.settings.email = "stale@example.com";
  disk.settings.secretId = "stale-secret";
  const restarted = lib.loadConnections(disk);
  assert.equal(restarted.settings.email, "second@example.com");
  assert.equal(restarted.settings.secretId, "second-secret");
});

test("broken named state and unknown roles fail closed rather than choosing another target", () => {
  const f = fixture();
  for (const mutate of [data => { data.activeConnectionId = "missing"; }, data => { data.connectionSchema = 99; },
    data => { data.connections.default.settings.connectionMode = "owner"; }, data => { delete data.connections.default.settings.connectionMode; },
    data => { data.connections = null; }]) {
    const data = structuredClone(f.plugin.data); mutate(data);
    assert.throws(() => lib.loadConnections(data), /Saved connections are invalid/);
  }
});

test("default templates contain no account, paths, connection names, mapping, token or private URL metadata", () => {
  const settings = { ...lib.DEFAULT_SETTINGS, email: "private@example.com", secretId: "private-secret-name", token: "private-token-value",
    folderUrl: "https://fixture.atlassian.net/wiki/spaces/DOC/folder/100/PrivateTitle?token=private-query#private-fragment",
    source: "Private source", inbox: "Private inbox", name: "Private name", nested: { body: "Private content" } };
  const text = lib.setupTemplate(settings);
  for (const value of ["private", "fixture.atlassian.net", "folderUrl", "secretId", "source", "inbox", "name", "token"]) assert.equal(text.toLowerCase().includes(value.toLowerCase()), false, value);
  assert.deepEqual(Object.keys(JSON.parse(text)), ["schema", "version", "role", "preferences"]);
});

test("opt-in template targets retain only the canonical site, space and folder IDs", () => {
  const text = lib.setupTemplate({ ...lib.DEFAULT_SETTINGS,
    folderUrl: "https://fixture.atlassian.net/wiki/spaces/~space/folder/100/PrivateTitle?token=private-query#private-fragment" }, true);
  assert.equal(JSON.parse(text).target.folderUrl, "https://fixture.atlassian.net/wiki/spaces/~space/folder/100");
  for (const value of ["PrivateTitle", "private-query", "private-fragment", "?"]) assert.equal(text.includes(value), false);
});

test("template import creates a new offline connection with no inherited account or source path", async () => {
  const f = fixture();
  const text = lib.setupTemplate({ ...lib.DEFAULT_SETTINGS, connectionMode: "publisher", mermaidMode: "image", autoMinutes: 60,
    folderUrl: fixtureConfig.folderUrl }, true);
  await f.change({ kind: "import", name: "Team", text });
  assert.equal(f.plugin.data.settings.connectionMode, "publisher");
  assert.equal(f.plugin.data.settings.mermaidMode, "image");
  assert.equal(f.plugin.data.settings.autoMinutes, 60);
  assert.equal(f.plugin.data.settings.folderUrl, "https://example.atlassian.net/wiki/spaces/DOC/folder/100");
  assert.equal(f.plugin.data.settings.source, lib.DEFAULT_SETTINGS.source);
  assert.equal(f.plugin.data.settings.inbox, lib.DEFAULT_SETTINGS.inbox);
  assert.equal(f.plugin.data.settings.email, "");
  assert.equal(f.plugin.data.settings.secretId, "");
  assert.equal(f.plugin.data.settings.allowPublish, false);
  assert.equal(f.plugin.data.settings.autoCheck, false);
  assert.equal(f.plugin.data.settings.autoPublish, false);
});

const valid = JSON.parse(lib.setupTemplate(lib.DEFAULT_SETTINGS));
for (const [label, value] of Object.entries({ array: [], null: null, unknown: { ...valid, email: "private@example.com" },
  token: { ...valid, token: "secret" }, source: { ...valid, source: "Private docs" }, version: { ...valid, version: 2 },
  role: { ...valid, role: "administrator" }, preferences: { ...valid, preferences: { ...valid.preferences, autoPublish: true } },
  interval: { ...valid, preferences: { ...valid.preferences, autoMinutes: 1 } },
  target: { ...valid, target: { folderUrl: "https://evil.example/wiki/spaces/DOC/folder/100" } },
  query: { ...valid, target: { folderUrl: fixtureConfig.folderUrl + "?token=secret" } },
  prototype: JSON.parse(JSON.stringify(valid).replace('"version":1', '"version":1,"__proto__":{"polluted":true}')) })) {
  test("rejecting " + label + " template leaves all state unchanged and performs no save", async () => {
    const f = fixture();
    const before = JSON.stringify(f.plugin.data);
    await assert.rejects(f.change({ kind: "import", name: "Team", text: JSON.stringify(value) }), /invalid or unsupported/);
    assert.equal(JSON.stringify(f.plugin.data), before);
    assert.equal(f.counters.saves, 0);
    assert.equal({}.polluted, undefined);
  });
}

test("the template size limit counts UTF-8 bytes rather than characters", () => {
  const text = JSON.stringify({ ...valid, target: { folderUrl: fixtureConfig.folderUrl + "/" + "가".repeat(2800) } });
  assert.ok(text.length < 8192);
  assert.ok(new TextEncoder().encode(text).length > 8192);
  assert.throws(() => lib.parseSetupTemplate(text), /invalid or unsupported/);
});

test("read-only roles block settings, validated config, direct Publisher and transport writes", async () => {
  const f = fixture();
  await f.plugin.configure("connectionMode", "read-only");
  assert.equal(await f.plugin.configure("allowPublish", true), false);
  assert.equal(await f.plugin.configure("autoPublish", true), false);
  const config = lib.validatedConfig({ ...fixtureConfig, connectionMode: "read-only", allowPublish: true });
  assert.equal(config.allowPublish, false);
  let requests = 0;
  const client = new lib.ConfluenceCloud(config, "synthetic-token", async () => { requests++; });
  for (const method of ["POST", "PUT", "DELETE"]) await assert.rejects(client.call(method, "/wiki/api/v2/pages"), /read-only/);
  const publisher = new lib.Publisher(client, {}, {}, async () => {});
  await assert.rejects(publisher.plan({ notes: [], folders: [] }, new Map()), /read-only/);
  await assert.rejects(publisher.publish({ notes: [], folders: [] }, new Map()), /read-only/);
  assert.equal(requests, 0);
});

test("publication reviews from another connection cannot be reused for an identical target", async () => {
  const f = selectionFixture(lib);
  f.config.connectionContext = "A:1";
  const review = await f.review();
  f.config.connectionContext = "B:2";
  await assert.rejects(f.publish(review, ["Docs/One.md"]), /active connection changed/);
  assert.equal(f.remote.stats.creates, 0);
});

test("an import folder cannot overlap another saved connection's source", () => {
  const f = fixture();
  const id = crypto.randomUUID();
  f.plugin.data.connections[id] = { name: "Other", settings: { ...f.plugin.data.connections.default.settings, source: "Incoming/Nested", inbox: "Other incoming" } };
  assert.throws(() => lib.checkConnectionScopes(f.plugin.data, f.plugin.data.settings), /Import folders/);
  f.plugin.data.connections[id].settings.source = "Other docs";
  assert.doesNotThrow(() => lib.checkConnectionScopes(f.plugin.data, f.plugin.data.settings));
});

for (const fail of [false, true]) test("setup save synchronizes named credentials and rollback on restart (failure: " + fail + ")", async () => {
  const f = fixture();
  const folder = fixtureFolder("Docs", []);
  f.plugin.app.vault = { getFolderByPath: path => path === "Docs" ? folder : null,
    getAbstractFileByPath: path => path === "Docs" ? folder : null };
  f.plugin.app.secretStorage = { getSecret: id => id === "fixture" ? "synthetic-token" : "" };
  const draft = { ...f.plugin.data.settings, email: "new-account@example.com" };
  const baseline = JSON.stringify(f.plugin.data.settings);
  const verified = await lib.verifySetup(f.plugin.app, draft, () => ({ connect: async () => {}, get: async () => ({ results: [] }) }));
  assert.equal(verified.ok, true);
  if (fail) {
    let first = true;
    f.hook(async () => { if (first) { first = false; throw new Error("Synthetic save failure"); } });
    await assert.rejects(lib.ConfluenceFolderSync.prototype.saveSetup.call(f.plugin, draft, verified, baseline));
  } else await lib.ConfluenceFolderSync.prototype.saveSetup.call(f.plugin, draft, verified, baseline);
  const restarted = lib.loadConnections(f.disk());
  assert.equal(restarted.settings.email, fail ? fixtureConfig.email : "new-account@example.com");
  assert.equal(restarted.connections.default.settings.email, restarted.settings.email);
  assert.equal(restarted.settings.autoPublish, false);
  assert.equal(restarted.settings.autoCheck, false);
});

test("an account change during lock acquisition cannot start the old operation on the new account", async () => {
  const f = fixture();
  let release;
  let started = false;
  const held = new Promise(resolve => { release = resolve; });
  f.plugin.applyRenames = async () => { started = true; await held; };
  let operations = 0;
  const pending = f.plugin.exclusive(async () => { operations++; });
  const rejected = assert.rejects(pending, /active connection changed/);
  assert.equal(started, true);
  await f.plugin.configure("email", "other@example.com");
  release(); await rejected;
  assert.equal(operations, 0);
});

for (const otherSource of [" Incoming ", "INCOMING", "  가져오기  ".normalize("NFD")]) {
  test("cross-profile paths normalize case, whitespace and Unicode: " + JSON.stringify(otherSource), () => {
    const f = fixture();
    const id = crypto.randomUUID();
    f.plugin.data.settings.inbox = otherSource.includes("I") ? "Incoming" : "가져오기";
    f.plugin.data.connections[id] = { name: "Other", settings: { ...lib.DEFAULT_SETTINGS, source: otherSource } };
    assert.throws(() => lib.checkConnectionScopes(f.plugin.data, f.plugin.data.settings), /Import folders/);
  });
}

test("history restoration checks all connection scopes before touching any note or backup", async () => {
  const f = fixture();
  const id = crypto.randomUUID();
  f.plugin.data.connections[id] = { name: "Other", settings: { ...lib.DEFAULT_SETTINGS, source: " Incoming " } };
  f.plugin.confirm = async () => true;
  f.plugin.recordOperation = async (_action, task) => task();
  const expected = lib.connectionContext(f.plugin);
  const panel = { plugin: f.plugin, app: f.plugin.app, t: f.plugin.t, render() {},
    checkConnection: () => lib.assertConnection(f.plugin, expected) };
  await lib.HistoryModal.prototype.restore.call(panel, {});
  assert.match(panel.status, /Import folders/);
});

test("restoring from a nondefault connection records its safety backup under the same connection", async () => {
  const f = fixture();
  const id = await f.change({ kind: "create", name: "Second" });
  for (const key of ["folderUrl", "source", "inbox", "email", "secretId"]) await f.plugin.configure(key, fixtureConfig[key]);
  const files = new Map([["Docs/One.md", "after"], ["Incoming/Backups/original.md", "before"]]);
  const folders = new Set(["Docs", "Incoming", "Incoming/Backups"]);
  f.plugin.app.workspace = { getLeavesOfType: () => [] };
  f.plugin.app.vault = {
    getFileByPath: path => files.has(path) ? { path, extension: "md" } : null,
    getFolderByPath: path => folders.has(path), getAbstractFileByPath: path => files.has(path),
    read: async file => files.get(file.path), createFolder: async path => folders.add(path),
    create: async (path, text) => { assert.equal(files.has(path), false); files.set(path, text); },
    process: async (file, update) => files.set(file.path, update(files.get(file.path))),
  };
  f.plugin.confirm = async () => true;
  f.plugin.recordOperation = async (_action, task) => task();
  f.plugin.recordBackup = async receipt => { f.plugin.data.backups.push(receipt); await f.plugin.persist(); };
  const config = lib.validatedConfig(f.plugin.data.settings);
  const receipt = { path: "Docs/One.md", backup: "Incoming/Backups/original.md", target: lib.publicationTarget(config),
    backupHash: await lib.digest("before"), afterHash: await lib.digest("after"), connectionId: id };
  const expected = lib.connectionContext(f.plugin);
  const panel = { plugin: f.plugin, app: f.plugin.app, t: f.plugin.t, render() {}, checkConnection: () => lib.assertConnection(f.plugin, expected) };
  await lib.HistoryModal.prototype.restore.call(panel, receipt);
  assert.equal(panel.status, "Backup restored locally.");
  assert.equal(files.get("Docs/One.md"), "before");
  assert.equal(f.plugin.data.backups.at(-1).connectionId, id);
});
