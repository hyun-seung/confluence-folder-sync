const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const fromBundle = new Function("require", "module",
  readFileSync("main.js", "utf8") + "\nreturn { validatedConfig, vaultPath, markdownLines, toStorage, " +
  "ConfluenceCloud, Publisher, preparedNotes, pageTrails, digest, lineChange, fromStorage, " +
  "attachmentInventory, attachmentDiff, reviewHunks, matchHunk, mergeSelected, applyLocalReview, " +
  "KOREAN, syncLanguage, translate, localizedError, SyncError, ApiError, publicationReview, publishSelection, " +
  "resolveConflict, publicationTarget, rekeySource, saveNoteBackup, restoreNoteBackup, automaticCandidates, AutomaticSync, mappingInventory, prepareMappingChange, applyMappingChange, sourceMarkdownFiles };");
const fakeModule = { exports: {} };
const lib = fromBundle(() => ({ Plugin: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {} }), fakeModule);
const fixtures = require("./testing/fixtures.cjs");
const { fixtureFolder, fixtureConfig, memoryCloud } = fixtures;

test("language follows Obsidian with explicit overrides and preserves interpolated user text", () => {
  assert.equal(lib.syncLanguage("auto", "ko"), "ko");
  assert.equal(lib.syncLanguage(undefined, "ko-KR"), "ko");
  assert.equal(lib.syncLanguage("auto", "de"), "en");
  assert.equal(lib.syncLanguage("en", "ko"), "en");
  assert.equal(lib.syncLanguage("ko", "en"), "ko");
  assert.equal(lib.translate("ko", "Download snapshot"), "전체 사본 내려받기");
  assert.equal(lib.translate("en", "Download snapshot"), "Download snapshot");
  const path = "Docs/{count}/<Example>.md";
  assert.equal(lib.translate("ko", "Apply selected changes to {path}", { path }), path + "에 선택한 변경 반영");
  assert.equal(lib.translate("ko", "Untranslated diagnostic"), "Untranslated diagnostic");
  assert.equal(lib.localizedError(new Error("Choose two different versions."), "ko"), "서로 다른 버전 두 개를 선택하세요.");
  const error = new lib.SyncError("Duplicate page title in the source folder: {title}", { title: "Test" });
  assert.match(error.message, /Duplicate page title/);
  assert.match(lib.localizedError(error, "ko"), /중복된 페이지 제목.*Test/);
  assert.match(lib.localizedError(new lib.ApiError("GET", 403), "ko"), /GET.*403/);
  for (const [key, value] of Object.entries(lib.KOREAN)) {
    assert.deepEqual((key.match(/\{[a-z]+\}/gi) ?? []).sort(), (value.match(/\{[a-z]+\}/gi) ?? []).sort(), key);
  }
});

test("config accepts a Confluence Cloud folder and rejects external hosts and overlapping paths", () => {
  assert.equal(lib.validatedConfig(fixtureConfig).folderId, "100");
  for (const folderUrl of [
    "http://example.atlassian.net/wiki/spaces/DOC/folder/100/Test",
    "https://example.atlassian.net.fake/wiki/spaces/DOC/folder/100/Test",
    "https://example.atlassian.net/wiki/spaces/DOC/pages/100/Test",
  ]) assert.throws(() => lib.validatedConfig({ ...fixtureConfig, folderUrl }));
  for (const inbox of ["Docs", "docs/copy", "../else", ".obsidian", "Docs\\copy"]) {
    assert.throws(() => lib.validatedConfig({ ...fixtureConfig, inbox }));
  }
});

test("storage conversion preserves tables, captured links and fenced code and escapes raw HTML", () => {
  const markup = [
    "# Example", "", "| A | B |", "| --- | --- |", "| 1 | [[Second|The next note]] |", "",
    "- One", "  - Subitem", "", "![alt](asset.png)", "", "<script>stop</script>", "",
    "~~~mermaid", "flowchart LR", " A --> B [[ignored]]", "~~~",
  ].join("\n");
  const references = [];
  const units = lib.markdownLines(markup, item => references.push(item.target));
  assert.deepEqual(references, ["Second", "asset.png"]);
  const result = lib.toStorage(units, item => "<a>" + item.label + "</a>");
  assert.match(result, /<th>A<\/th>\s*<th>B<\/th>/);
  assert.match(result, /<ul>\s*<li>One\s*<ul>\s*<li>Subitem/);
  assert.match(result, /<a>The next note<\/a>/);
  assert.match(result, /&lt;script&gt;/);
  assert.match(result, /ac:name="language">mermaid/);
  assert.match(result, /flowchart LR\n A --> B \[\[ignored\]\]/);
});

test("a remote URL and a raw HTML image never trigger attachment reads", async () => {
  const document = { path: "Docs/Note.md", basename: "Note", extension: "md" };
  const denied = { path: "Other/Logo.png", name: "Logo.png", extension: "png", stat: { size: 10 } };
  const app = {
    vault: {
      getFolderByPath: source => fixtureFolder(source, [document]),
      read: async () => "![[Logo.png]]\n![](https://example.test/asset)\n<img src=\"https://example.test/asset\">",
      readBinary: async () => { throw new Error("Unexpected file read"); },
    },
    metadataCache: { getFirstLinkpathDest: () => denied },
  };
  const tree = await lib.preparedNotes(app, lib.validatedConfig(fixtureConfig));
  assert.equal(tree.notes[0].assets.size, 0);
});

test("authentication goes to the tenant-derived Atlassian gateway and pagination stays scoped", async () => {
  const config = lib.validatedConfig(fixtureConfig);
  const requests = [];
  const client = new lib.ConfluenceCloud(config, "dummy-token", async request => {
    requests.push(request);
    if (request.url.endsWith("/_edge/tenant_info")) return { status: 200, json: { cloudId: "12345678-1234-1234-1234-123456789012" } };
    if (request.url.endsWith("/folders/100")) return { status: 200, json: { id: "100", status: "current", spaceId: "300" } };
    return { status: 200, json: { results: [], _links: { next: "https://example.test/wiki/api/v2/pages?cursor=abc" } } };
  });
  await client.connect();
  await assert.rejects(client.list("/wiki/api/v2/pages", {}), /unexpected pagination host/);
  assert.equal(requests[0].headers, undefined);
  assert.ok(requests.slice(1).every(req => new URL(req.url).host === "api.atlassian.com" && req.headers.Authorization));
});

test("publication creates hierarchy, uploads once, keeps page IDs on updates and rejects independent edits", async () => {
  const config = lib.validatedConfig(fixtureConfig);
  const remote = memoryCloud(config);
  const state = { folders: {}, pages: {} };
  const asset = { path: "Docs/example.png", name: "example.png", extension: "png", stat: { size: 2 } };
  const files = [
    { path: "Docs/Nested/First.md", basename: "First", extension: "md" },
    { path: "Docs/Second.md", basename: "Second", extension: "md" },
  ];
  const bodies = { First: "# First\n[[Second]]\n![[example.png]]", Second: "# Second" };
  const app = {
    vault: {
      getFolderByPath: source => fixtureFolder(source, files),
      read: async file => bodies[file.basename], readBinary: async () => new Uint8Array([0, 1]).buffer,
    },
    metadataCache: { getFirstLinkpathDest: target => target === "Second" ? files[1] : asset },
  };
  const publisher = new lib.Publisher(remote, app, state, async () => {});
  let catalog = new Map();
  let tree = await lib.preparedNotes(app, config);
  await publisher.plan(tree, catalog);
  assert.equal(await publisher.publish(tree, catalog), 2);
  assert.deepEqual(remote.stats, { creates: 3, updates: 2, uploads: 1 });
  const first = state.pages["file:Docs/Nested/First.md"].id;
  assert.match(remote.records.get(first).body.storage.value, /viewpage\.action\?pageId=\d+/);
  assert.match(remote.records.get(first).body.storage.value, /<ac:image/);
  catalog = new Map(remote.records);
  assert.equal(await publisher.publish(tree, catalog), 0);
  bodies.First += "\n\nNew local content.";
  tree = await lib.preparedNotes(app, config);
  assert.equal(await publisher.publish(tree, catalog), 1);
  assert.equal(state.pages["file:Docs/Nested/First.md"].id, first);
  remote.records.get(first).version.number++;
  await assert.rejects(publisher.plan(tree, catalog), /independent edit/);
  assert.deepEqual(remote.stats, { creates: 3, updates: 3, uploads: 1 });
});

test("publication refuses unrelated same-title pages and preserves unresolved creates", async () => {
  const config = lib.validatedConfig(fixtureConfig);
  const remote = memoryCloud(config);
  const state = { folders: {}, pages: {} };
  const publisher = new lib.Publisher(remote, {}, state, async () => {});
  const same = await remote.create("page", "Existing", "100", "<p>unrelated</p>");
  const catalog = new Map([[same.id, same]]);
  await assert.rejects(publisher.inspect("page", state.pages, "file:Docs/Existing.md", "Existing", "100", catalog),
    /not linked/);
  state.pages["file:Docs/Missing.md"] = { creating: true, ticket: "test" };
  await assert.rejects(publisher.inspect("page", state.pages, "file:Docs/Missing.md", "Missing", "100", catalog),
    /result is unknown/);
  assert.equal(remote.stats.updates, 0);
});

test("reverse discovery only includes current pages beneath the selected root", () => {
  const catalog = new Map([
    ["200", { id: "200", parentId: "100", type: "folder", status: "current" }],
    ["201", { id: "201", parentId: "200", type: "page", status: "current" }],
    ["202", { id: "202", parentId: "999", type: "page", status: "current" }],
    ["203", { id: "203", parentId: "100", type: "page", status: "archived" }],
  ]);
  const trails = lib.pageTrails(catalog, "100");
  assert.deepEqual(Array.from(trails.keys()), ["201"]);
  assert.deepEqual(trails.get("201").map(item => item.id), ["200", "201"]);
  assert.match(lib.lineChange("same\nold\nend", "same\nnew\nend"), /\n-old\n\+new\n/);
});

test("version differences keep unchanged middle lines when there are separate edits", () => {
  const before = "begin\nold first\nunchanged between\nold second\nend";
  const after = "begin\nnew first\nunchanged between\nnew second\nend";
  assert.match(lib.lineChange(before, after), /-old first\n\+new first\n unchanged between\n-old second\n\+new second/);
  assert.match(lib.lineChange(before, before), /No converted Markdown body difference/);
});


test("pinned attachment download carries credentials only to the Atlassian API", async () => {
  const config = lib.validatedConfig(fixtureConfig);
  const client = new lib.ConfluenceCloud(config, "dummy-token");
  client.gateway = "https://api.atlassian.com/ex/confluence/fixture";
  const attachment = { id: "att122", title: "fixture.txt", fileSize: 3, version: { number: 2 } };
  const calls = [];
  const data = await client.downloadAttachment("400", attachment, async (url, headers, bytes) => {
    calls.push({ url, headers, bytes });
    if (calls.length === 1) return { status: 302, location: "https://api.media.atlassian.com/file/token" };
    return { status: 200, data: new Uint8Array([1, 2, 3]).buffer };
  });
  assert.deepEqual(Array.from(new Uint8Array(data)), [1, 2, 3]);
  assert.match(calls[0].url, /\/content\/400\/child\/attachment\/att122\/download\?version=2$/);
  assert.match(calls[0].headers.Authorization, /^Basic /);
  assert.deepEqual(calls[1].headers, {});
  assert.equal(calls[1].bytes, 3);

  let unsafeCalls = 0;
  await assert.rejects(client.downloadAttachment("400", attachment, async () => {
    unsafeCalls++;
    return { status: 302, location: "https://api.media.atlassian.com.example.test/file" };
  }), /unexpected attachment download host/);
  assert.equal(unsafeCalls, 1);
});

test("attachment inventory detects add, edit, rename and removal independent of page versions", () => {
  const asset = (id, title, number) => ({ id: "att" + id, title, version: { number }, fileSize: 3 });
  const before = lib.attachmentInventory([asset("1", "a.txt", 1), asset("2", "b.txt", 1), asset("3", "c.txt", 1)]);
  const after = lib.attachmentInventory([asset("1", "a.txt", 2), asset("2", "renamed.txt", 1), asset("4", "d.txt", 1)]);
  assert.deepEqual(lib.attachmentDiff(before, after).map(change => [change.kind, change.title]), [
    ["Changed", "a.txt"], ["Changed", "renamed.txt"], ["Added", "d.txt"], ["Removed", "c.txt"],
  ]);
  assert.deepEqual(lib.attachmentDiff(after, after), []);
});

test("review applies only matching selected hunks and rejects ambiguous and stale locations", () => {
  const old = "Intro\nold A\nMiddle\nunchanged\nold B\nTail";
  const current = "Intro\nnew A\nMiddle\nunchanged\nnew B\nTail";
  const material = "Intro\r\nold A\r\nMiddle\r\nunchanged\r\nold B\r\nTail\r\nMy edit\r\n";
  const hunks = lib.reviewHunks(old, current);
  const local = material.split("\r\n");
  assert.equal(hunks.length, 2);
  const selected = { ...hunks[0], at: lib.matchHunk(local, hunks[0]) };
  assert.equal(selected.at, 1);
  assert.equal(lib.mergeSelected(material, [selected]), material.replace("old A", "new A"));
  assert.equal(lib.matchHunk(["Intro", "old A", "Middle", "Intro", "old A", "Middle"], hunks[0]), null);
  assert.throws(() => lib.mergeSelected("Intro\nnewer local line\nMiddle", [selected]), /no longer match/);
  assert.throws(() => lib.mergeSelected("Intro\r\nold A\nMiddle", [selected]), /mixed line endings/);
  const add = lib.reviewHunks("Intro\n\nTail", "Intro\n\naddition\n\nTail")[0];
  assert.equal(lib.matchHunk(["Intro", "", "Tail"], add), 1);
});

test("confirmed local review backs up the original and rechecks remote and local revisions", async () => {
  const original = "Intro\nold A\nTail\n";
  const source = "Docs/Test.md";
  const file = { path: source, extension: "md" };
  const storage = new Map([[source, original]]);
  const folders = new Set(["Docs"]);
  const app = {
    vault: {
      getFolderByPath: path => folders.has(path),
      getAbstractFileByPath: path => storage.has(path),
      getFileByPath: path => storage.has(path) ? file : null,
      createFolder: async path => folders.add(path),
      create: async (path, data) => storage.set(path, data),
      read: async handle => storage.get(handle.path),
      process: async (handle, change) => storage.set(handle.path, change(storage.get(handle.path))),
    },
    workspace: { getLeavesOfType: () => [] },
  };
  const page = { id: "400", spaceId: "80", parentId: "100", status: "current", version: { number: 4 } };
  const storageBody = "<p>fixture</p>";
  let recheck = 4;
  const client = {
    config: { origin: "https://example.atlassian.net", folderId: "100", source: "Docs", inbox: "Incoming" },
    spaceId: "80",
    page: async (_id, _version, body) => body
      ? { ...page, body: { storage: { value: storageBody } } }
      : { ...page, version: { number: recheck } },
  };
  const profile = { pages: { "file:Docs/Test.md": { id: "400", version: 3, bodyHash: "base" } } };
  const review = {
    id: "400", path: source, original, baseVersion: 3, version: 4, bodyHash: await lib.digest(storageBody),
    origin: client.config.origin, folderId: "100", hunks: [{ at: 1, remove: ["old A"], insert: ["new A"] }],
  };
  recheck = 5;
  await assert.rejects(lib.applyLocalReview(app, client, profile, page, review, [0]), /changed while preparing/);
  assert.equal(storage.get(source), original);
  recheck = 4;
  const result = await lib.applyLocalReview(app, client, profile, page, review, [0]);
  assert.equal(result.count, 1);
  assert.ok(result.backup.startsWith("Incoming/Backups/"));
  assert.equal(storage.get(result.backup), original);
  assert.equal(storage.get(source), original.replace("old A", "new A"));
  assert.equal(profile.pages["file:Docs/Test.md"].version, 3);
  await assert.rejects(lib.applyLocalReview(app, client, profile, page, review, [0]), /local note changed after review/);
});


test("a migrated baseline preserves unchanged formatter output but publishes later source edits", async () => {
  const config = lib.validatedConfig(fixtureConfig);
  const remote = memoryCloud(config);
  const file = { path: "Docs/Legacy.md", basename: "Legacy", extension: "md" };
  let text = "# Legacy\n\nOriginal";
  const app = {
    vault: { getFolderByPath: source => fixtureFolder(source, [file]), read: async () => text },
    metadataCache: { getFirstLinkpathDest: () => null },
  };
  const page = await remote.create("page", "Legacy", "100", "<p>Earlier formatter with diagram</p>");
  const tree = await lib.preparedNotes(app, config);
  const entry = { id: page.id, ticket: "migration", version: 1, bodyHash: "different format",
    sourceHash: tree.notes[0].sourceHash, migratedInputHash: tree.notes[0].inputHash, remoteAttachments: [] };
  const state = { folders: {}, pages: { "file:Docs/Legacy.md": entry } };
  const publisher = new lib.Publisher(remote, app, state, async () => {});
  const catalog = new Map(remote.records);
  await publisher.plan(tree, catalog);
  assert.equal(await publisher.publish(tree, catalog), 0);
  assert.equal(remote.stats.updates, 0);
  text += "\n\nChanged source";
  assert.equal(await publisher.publish(await lib.preparedNotes(app, config), catalog), 1);
  assert.equal(entry.migratedInputHash, undefined);
});


function selectionFixture() { return fixtures.selectionFixture(lib); }

test("selective publication writes only selected notes and ancestors and keeps existing unselected links", async () => {
  const fixture = selectionFixture();
  const { remote, profile, bodies, review, publish } = fixture;
  let plan = await review();
  assert.deepEqual(plan.rows.map(row => row.status), ["New", "New", "New"]);
  assert.equal(remote.stats.creates, 0);
  assert.equal(await publish(plan, ["Docs/Two.md"]), 1);
  assert.equal(Object.keys(profile.pages).length, 1);
  assert.equal(Object.keys(profile.folders).length, 0);
  const two = profile.pages["file:Docs/Two.md"].id;
  bodies.set("Docs/One.md", "# One\n[[Two]]");
  plan = await review();
  assert.equal(plan.rows.find(row => row.path === "Docs/Two.md").status, "Unchanged");
  assert.equal(await publish(plan, ["Docs/One.md"]), 1);
  assert.match(remote.records.get(profile.pages["file:Docs/One.md"].id).body.storage.value, new RegExp("pageId=" + two));
  assert.equal(remote.records.get(two).version.number, 2);
  assert.equal(Object.keys(profile.folders).length, 0);
  assert.ok(!profile.pages["file:Docs/Nested/Three.md"]);
});

test("selective publication blocks stale input, unselected new link dependencies and destination changes before writes", async () => {
  const { app, config, remote, profile, bodies, review, publish } = selectionFixture();
  bodies.set("Docs/One.md", "[[Two]]");
  const plan = await review();
  await assert.rejects(publish(plan, ["Docs/One.md"]), /unpublished/);
  assert.equal(remote.stats.creates, 0);
  bodies.set("Docs/One.md", "changed after review");
  await assert.rejects(publish(plan, ["Docs/One.md", "Docs/Two.md"]), /changed/);
  assert.equal(remote.stats.creates, 0);
  config.folderId = "200";
  await assert.rejects(lib.publishSelection(app, remote, profile, async () => {}, plan, ["Docs/Two.md"]), /destination/);
  assert.equal(remote.stats.creates, 0);
});

test("one conflicting page cannot block an unrelated selected change and remote edits after review stop selected publication", async () => {
  const { remote, profile, bodies, review, publish } = selectionFixture();
  await publish(await review(), ["Docs/One.md", "Docs/Two.md"]);
  const one = profile.pages["file:Docs/One.md"].id;
  const two = profile.pages["file:Docs/Two.md"].id;
  remote.records.get(one).version.number++;
  bodies.set("Docs/Two.md", "updated Two");
  const plan = await review();
  assert.equal(plan.rows.find(row => row.id === one).status, "Conflict");
  assert.equal(await publish(plan, ["Docs/Two.md"]), 1);
  bodies.set("Docs/Two.md", "another update");
  const stale = await review();
  const updates = remote.stats.updates;
  remote.records.get(two).version.number++;
  await assert.rejects(publish(stale, ["Docs/Two.md"]), /changed/);
  assert.equal(remote.stats.updates, updates);
});

async function conflictFixture() {
  const fixture = selectionFixture();
  const { app, remote, profile, bodies, review, publish, config } = fixture;
  app.workspace = { getLeavesOfType: () => [] };
  app.vault.create = async (path, text) => { assert.ok(!bodies.has(path)); bodies.set(path, text); return { path }; };
  app.vault.process = async (file, change) => bodies.set(file.path, change(bodies.get(file.path)));
  await publish(await review(), ["Docs/One.md"]);
  const entry = profile.pages["file:Docs/One.md"];
  const page = remote.records.get(entry.id);
  const baseVersion = entry.version;
  page.version.number++;
  page.body.storage.value = "<p>Confluence editor change</p>";
  const conflict = { id: entry.id, path: "Docs/One.md", original: bodies.get("Docs/One.md"),
    remote: "Confluence editor change\n", version: page.version.number, baseVersion, title: page.title,
    parent: "100", bodyHash: await lib.digest(page.body.storage.value), inventory: [], target: lib.publicationTarget(config) };
  return { ...fixture, conflict, entry, page };
}

test("conflict resolution backs up the local note, advances only the accepted baseline and needs separate publication", async () => {
  const { app, remote, profile, bodies, conflict, entry, page, review, publish } = await conflictFixture();
  const updates = remote.stats.updates;
  const result = await lib.resolveConflict(app, remote, profile, async () => {}, conflict, "Merged local and remote\n");
  assert.equal(bodies.get(result.backup), conflict.original);
  assert.equal(bodies.get(conflict.path), "Merged local and remote\n");
  assert.equal(entry.version, page.version.number);
  assert.equal(remote.stats.updates, updates);
  const plan = await review();
  assert.equal(plan.rows.find(row => row.id === entry.id).status, "Changed");
  assert.equal(await publish(plan, [conflict.path]), 1);
});

test("conflict resolution rejects remote races and preserves a blocking baseline when saving metadata fails", async () => {
  const fixture = await conflictFixture();
  const { app, remote, profile, bodies, conflict, entry, page } = fixture;
  const originalCreate = app.vault.create;
  app.vault.create = async (...args) => { const result = await originalCreate(...args); page.version.number++; return result; };
  await assert.rejects(lib.resolveConflict(app, remote, profile, async () => {}, conflict, "resolution"), /changed/);
  assert.equal(bodies.get(conflict.path), conflict.original);
  page.version.number--;
  app.vault.create = originalCreate;
  const prior = structuredClone(entry);
  await assert.rejects(lib.resolveConflict(app, remote, profile, async () => { throw new Error("disk unavailable"); }, conflict, "resolution"), /disk unavailable/);
  assert.deepEqual(entry, prior);
  assert.equal(bodies.get(conflict.path), "resolution");
  assert.ok(Array.from(bodies).some(([path, text]) => path.includes("/Backups/") && text === conflict.original));
});

test("local file and folder moves preserve page IDs and publish only the selected destination branch", async () => {
  const { files, bodies, profile, remote, review, publish } = selectionFixture();
  await publish(await review(), ["Docs/One.md", "Docs/Two.md"]);
  const id = profile.pages["file:Docs/One.md"].id;
  const file = files.find(item => item.basename === "One");
  const old = file.path;
  file.path = "Docs/Renamed/First.md"; file.basename = "First";
  bodies.set(file.path, bodies.get(old)); bodies.delete(old);
  assert.equal(lib.rekeySource(profile, old, file.path), 1);
  const plan = await review();
  assert.equal(plan.rows.find(row => row.path === file.path).status, "Changed");
  await publish(plan, [file.path]);
  assert.equal(profile.pages["file:" + file.path].id, id);
  assert.equal(remote.records.get(id).title, "First");
  assert.equal(remote.records.get(id).parentId, profile.folders["dir:Docs/Renamed"].id);
  assert.equal(remote.records.size, 3);
  assert.equal((await review()).rows.find(row => row.id === id).status, "Unchanged");
  const previousFolder = profile.folders["dir:Docs/Renamed"].id;
  const next = "Docs/Other/First.md";
  bodies.set(next, bodies.get(file.path)); bodies.delete(file.path); file.path = next;
  lib.rekeySource(profile, "Docs/Renamed", "Docs/Other");
  await publish(await review(), [next]);
  assert.equal(profile.pages["file:" + next].id, id);
  assert.ok(remote.records.has(previousFolder));
});

test("rename mapping collisions are atomic and moves outside the source cannot publish their files", async () => {
  const profile = { pages: { "file:Docs/One.md": { id: "1" }, "file:Docs/Two.md": { id: "2" } }, folders: {} };
  const before = structuredClone(profile);
  assert.throws(() => lib.rekeySource(profile, "Docs/One.md", "Docs/Two.md"), /another page mapping/);
  assert.deepEqual(profile, before);
  lib.rekeySource(profile, "Docs/One.md", "Other/One.md");
  assert.equal(profile.pages["file:Other/One.md"].id, "1");
  assert.ok(!profile.pages["file:Docs/One.md"]);
});

test("backup restoration preserves the current revision and refuses modified notes and altered backups", async () => {
  const { app, config, bodies } = selectionFixture();
  const path = "Docs/One.md";
  app.workspace = { getLeavesOfType: () => [] };
  app.vault.create = async (path, text) => { assert.ok(!bodies.has(path)); bodies.set(path, text); return { path }; };
  app.vault.process = async (file, fn) => bodies.set(file.path, fn(bodies.get(file.path)));
  app.vault.getFileByPath = path => bodies.has(path) ? { path, extension: "md" } : null;
  const receipts = [];
  const receipt = await lib.saveNoteBackup(app, config, path, "before", "after", async item => receipts.push(item));
  bodies.set(path, "newer user edit");
  await assert.rejects(lib.restoreNoteBackup(app, config, receipt, async item => receipts.push(item)), /note changed/);
  assert.equal(bodies.get(path), "newer user edit");
  bodies.set(path, "after"); bodies.set(receipt.backup, "altered backup");
  await assert.rejects(lib.restoreNoteBackup(app, config, receipt), /backup contents changed/);
  bodies.set(receipt.backup, "before");
  const recovery = await lib.restoreNoteBackup(app, config, receipt, async item => receipts.push(item));
  assert.equal(bodies.get(path), "before");
  assert.equal(bodies.get(recovery.backup), "after");
  assert.equal(receipts.length, 2);
});

test("operation history records success, failure and cancellation and stays bounded", async () => {
  const plugin = Object.create(fakeModule.exports.prototype);
  plugin.data = { settings: { language: "en" }, history: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) };
  plugin.persist = async () => {};
  assert.equal(await plugin.recordOperation("Publish selected", async () => 3), 3);
  assert.equal(plugin.data.history.length, 100);
  assert.equal(plugin.data.history.at(-1).status, "Succeeded");
  assert.equal(plugin.data.history.at(-1).count, 3);
  await assert.rejects(plugin.recordOperation("Publish selected", async () => { throw new Error("fixture failure"); }), /fixture failure/);
  assert.equal(plugin.data.history.at(-1).status, "Failed");
  const cancellation = new Error("cancelled"); cancellation.name = "AbortError";
  await assert.rejects(plugin.recordOperation("Publish selected", async () => { throw cancellation; }), /cancelled/);
  assert.equal(plugin.data.history.at(-1).status, "Cancelled");
});

test("automatic publication only accepts locally changed linked pages and leaves new, moved and conflicted notes for review", async () => {
  const fixture = selectionFixture();
  const { profile, bodies, review, publish, app, config } = fixture;
  await publish(await review(), ["Docs/One.md", "Docs/Two.md"]);
  bodies.set("Docs/One.md", "locally changed");
  bodies.set("Docs/Two.md", "also changed");
  profile.pages["file:Docs/Two.md"].renamedFrom = "Docs/Old.md";
  const plan = await review();
  const tree = await lib.preparedNotes(app, config);
  assert.deepEqual(lib.automaticCandidates(plan, profile, tree), ["Docs/One.md"]);
  profile.pages["file:Docs/One.md"].pending = { message: "incomplete" };
  assert.deepEqual(lib.automaticCandidates(plan, profile, tree), []);
});

test("automatic checks debounce source events, ignore excluded paths and dispose every timer", () => {
  let nextId = 1;
  const timeouts = new Map(); const intervals = new Map();
  const timers = {
    setTimeout: (fn, ms) => { const id = nextId++; timeouts.set(id, { fn, ms }); return id; },
    clearTimeout: id => timeouts.delete(id),
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms }); return id; },
    clearInterval: id => intervals.delete(id),
  };
  const plugin = { data: { settings: { source: "Docs", autoCheck: false, autoMinutes: 5 } } };
  const scheduler = new lib.AutomaticSync(plugin, timers);
  scheduler.configure(); assert.equal(timeouts.size + intervals.size, 0);
  plugin.data.settings.autoCheck = true;
  scheduler.configure(); assert.equal(timeouts.size, 1); assert.equal(intervals.size, 1);
  scheduler.clearTimers();
  scheduler.changed({ path: "Other/Note.md" }); assert.equal(timeouts.size, 0);
  scheduler.changed({ path: "Docs/Note.md" }); scheduler.changed({ path: "Docs/Another.md" });
  assert.equal(timeouts.size, 1);
  scheduler.configure(); assert.equal(timeouts.size, 1); assert.equal(intervals.size, 1);
  scheduler.dispose(); assert.equal(timeouts.size + intervals.size, 0);
  scheduler.configure(); assert.equal(timeouts.size + intervals.size, 0);
});

test("changing an account, scope or publish permission disables unattended uploads", async () => {
  const plugin = Object.create(fakeModule.exports.prototype);
  plugin.persist = async () => {};
  for (const [key, value] of [["source", "Other"], ["folderUrl", fixtureConfig.folderUrl], ["secretId", "new"],
    ["email", "new@example.com"], ["allowPublish", false], ["autoCheck", false]]) {
    plugin.data = { settings: { autoPublish: true } };
    await plugin.configure(key, value);
    assert.equal(plugin.data.settings.autoPublish, false, key);
  }
});

test("duplicate local titles are listed as conflicts without blocking an unrelated selected note", async () => {
  const { files, bodies, review, publish } = selectionFixture();
  files.push({ path: "Docs/Other/One.md", basename: "One", extension: "md" });
  bodies.set("Docs/Other/One.md", "duplicate title");
  const plan = await review();
  assert.equal(plan.rows.filter(row => row.status === "Conflict").length, 2);
  assert.equal(await publish(plan, ["Docs/Two.md"]), 1);
});

test("returning a moved folder to its prior path reuses its owned folder and page IDs", async () => {
  const { files, bodies, profile, remote, review, publish } = selectionFixture();
  const file = files.find(item => item.basename === "Three");
  await publish(await review(), [file.path]);
  const first = profile.folders["dir:Docs/Nested"].id;
  const pageId = profile.pages["file:" + file.path].id;
  const move = (oldPath, newPath) => {
    bodies.set(newPath + "/Three.md", bodies.get(file.path)); bodies.delete(file.path);
    file.path = newPath + "/Three.md"; lib.rekeySource(profile, oldPath, newPath);
  };
  move("Docs/Nested", "Docs/Other"); await publish(await review(), [file.path]);
  move("Docs/Other", "Docs/Nested"); await publish(await review(), [file.path]);
  assert.equal(profile.folders["dir:Docs/Nested"].id, first);
  assert.equal(profile.pages["file:" + file.path].id, pageId);
  assert.equal(remote.records.size, 3);
});

test("publication rejects source edits made during the final remote check before issuing PUT", async () => {
  const { app, remote, profile, bodies, review, publish } = selectionFixture();
  await publish(await review(), ["Docs/One.md"]);
  bodies.set("Docs/One.md", "reviewed text");
  const plan = await review();
  const base = remote.page;
  let reads = 0;
  remote.page = async (...args) => {
    const result = await base(...args);
    if (++reads === 4) bodies.set("Docs/One.md", "newer local edit");
    return result;
  };
  const updates = remote.stats.updates;
  await assert.rejects(publish(plan, ["Docs/One.md"]), /changed/);
  assert.equal(remote.stats.updates, updates);
  assert.equal(bodies.get("Docs/One.md"), "newer local edit");
  assert.equal(profile.pages["file:Docs/One.md"].version, 2);
});

test("publication and automatic candidates reject newer unsaved editor text", async () => {
  const { app, files, remote, review, publish } = selectionFixture();
  const plan = await review();
  app.workspace.getLeavesOfType = () => [{ view: { file: files[0], editor: { getValue: () => "unsaved editor revision" } } }];
  const fresh = await review();
  assert.equal(fresh.rows.find(row => row.path === files[0].path).status, "Conflict");
  await assert.rejects(publish(plan, [files[0].path]), /changed/);
  assert.equal(remote.stats.creates, 0);
});

test("undoing a colliding rename clears the conflict without blocking the rename queue", async () => {
  const plugin = Object.create(fakeModule.exports.prototype);
  const profile = { pages: { "file:Docs/One.md": { id: "1" }, "file:Docs/Two.md": { id: "2" } }, folders: {} };
  const before = structuredClone(profile.pages);
  plugin.data = { settings: { language: "en" }, profiles: { fixture: profile } };
  plugin.persist = async () => {};
  plugin.renameEvents = [{ oldPath: "Docs/One.md", newPath: "Docs/Two.md" }, { oldPath: "Docs/Two.md", newPath: "Docs/One.md" }];
  await plugin.applyRenames();
  assert.equal(plugin.renameEvents.length, 0);
  assert.deepEqual(profile.pages, before);
  assert.equal(profile.renameConflicts.length, 0);
});

test("cancellation after attachment lookup prevents later upload and page update requests", async () => {
  const { app, config, remote, profile, bodies, review, publish } = selectionFixture();
  await publish(await review(), ["Docs/One.md"]);
  const asset = { path: "Docs/picture.png", name: "picture.png", extension: "png", stat: { size: 2 } };
  app.metadataCache.getFirstLinkpathDest = () => asset;
  app.vault.readBinary = async () => new Uint8Array([1, 2]).buffer;
  bodies.set("Docs/One.md", "![[picture.png]]");
  const plan = await review();
  let cancelled = false;
  const attachments = remote.attachments;
  remote.attachments = async (...args) => { const result = await attachments(...args); cancelled = true; return result; };
  const updates = remote.stats.updates;
  await assert.rejects(lib.publishSelection(app, remote, profile, async () => {}, plan, ["Docs/One.md"], {
    check: () => { if (cancelled) { const error = new Error("cancelled"); error.name = "AbortError"; throw error; } },
  }), /cancelled/);
  assert.equal(remote.stats.uploads, 0);
  assert.equal(remote.stats.updates, updates);
});

test("rename collisions remain blocked when a containing folder moves", async () => {
  const fixture = selectionFixture();
  const { app, files, bodies, profile, remote, review, publish } = fixture;
  files.splice(0, files.length,
    { path: "Docs/Sub/One.md", basename: "One", extension: "md" },
    { path: "Docs/Sub/Two.md", basename: "Two", extension: "md" });
  bodies.clear(); bodies.set(files[0].path, "page One"); bodies.set(files[1].path, "page Two");
  await publish(await review(), files.map(file => file.path));
  const deletedId = profile.pages["file:Docs/Sub/Two.md"].id;
  const deletedBody = remote.records.get(deletedId).body.storage.value;
  bodies.delete(files[1].path); files.pop();
  bodies.set("Docs/Sub/Two.md", bodies.get(files[0].path)); bodies.delete(files[0].path);
  files[0].path = "Docs/Sub/Two.md"; files[0].basename = "Two";
  const plugin = Object.create(fakeModule.exports.prototype);
  plugin.data = { settings: { language: "en" }, profiles: { fixture: profile } };
  plugin.persist = async () => {}; plugin.renameEvents = [{ oldPath: "Docs/Sub/One.md", newPath: files[0].path }];
  await plugin.applyRenames();
  bodies.set("Docs/Moved/Two.md", bodies.get(files[0].path)); bodies.delete(files[0].path);
  files[0].path = "Docs/Moved/Two.md";
  lib.rekeySource(profile, "Docs/Sub", "Docs/Moved");
  const plan = await review();
  assert.equal(plan.rows[0].status, "Conflict");
  await assert.rejects(publish(plan, [files[0].path]), /changed/);
  assert.equal(remote.records.get(deletedId).body.storage.value, deletedBody);
});

async function imagePublicationFixture() {
  const fixture = selectionFixture();
  const asset = { path: "Docs/picture.png", name: "picture.png", extension: "png", stat: { size: 2 } };
  fixture.app.metadataCache.getFirstLinkpathDest = () => asset;
  fixture.app.vault.readBinary = async () => new Uint8Array([1, 2]).buffer;
  await fixture.publish(await fixture.review(), ["Docs/One.md"]);
  fixture.bodies.set("Docs/One.md", "![[picture.png]]");
  return fixture;
}

test("remote attachment deletion blocks publication without recreating the deleted file", async () => {
  const { bodies, profile, remote, review, publish } = await imagePublicationFixture();
  await publish(await review(), ["Docs/One.md"]);
  const id = profile.pages["file:Docs/One.md"].id;
  bodies.set("Docs/One.md", "![[picture.png]]\nlocal edit");
  const plan = await review();
  const attachments = await remote.attachments(id);
  assert.equal(attachments.length, 1); attachments.length = 0;
  const current = await review();
  assert.equal(current.rows.find(row => row.id === id).status, "Conflict");
  await assert.rejects(publish(plan, ["Docs/One.md"]), /changed/);
  assert.equal(remote.stats.uploads, 1);
});

test("a known immutable attachment upload resumes after interrupted publication without duplicate upload", async () => {
  const { profile, remote, review, publish } = await imagePublicationFixture();
  const update = remote.update;
  remote.update = async () => { throw new Error("interrupted before page update"); };
  await assert.rejects(publish(await review(), ["Docs/One.md"]), /interrupted/);
  assert.equal(remote.stats.uploads, 1);
  remote.update = update;
  const plan = await review();
  assert.equal(plan.rows.find(row => row.path === "Docs/One.md").status, "Changed");
  await publish(plan, ["Docs/One.md"]);
  assert.equal(remote.stats.uploads, 1);
  assert.equal(profile.pages["file:Docs/One.md"].remoteAttachments.length, 1);
});

test("changing an attachment reference after interrupted upload can resume using durable upload intent", async () => {
  const { bodies, profile, remote, review, publish } = await imagePublicationFixture();
  const update = remote.update;
  remote.update = async () => { throw new Error("interrupted"); };
  await assert.rejects(publish(await review(), ["Docs/One.md"]), /interrupted/);
  assert.equal(Object.keys(profile.pages["file:Docs/One.md"].uploadIntents).length, 1);
  bodies.set("Docs/One.md", "The image was intentionally removed locally.");
  remote.update = update;
  const plan = await review();
  assert.equal(plan.rows.find(row => row.path === "Docs/One.md").status, "Changed");
  await publish(plan, ["Docs/One.md"]);
  const entry = profile.pages["file:Docs/One.md"];
  assert.equal(remote.stats.uploads, 1);
  assert.equal(entry.remoteAttachments.length, 1);
  assert.equal(entry.uploadIntents, undefined);
  assert.match(remote.records.get(entry.id).body.storage.value, /intentionally removed/);
});

test("reverting local text to its published baseline clears an interrupted update without a remote write", async () => {
  const { bodies, profile, remote, review, publish } = await imagePublicationFixture();
  const update = remote.update;
  remote.update = async () => { throw new Error("interrupted"); };
  await assert.rejects(publish(await review(), ["Docs/One.md"]), /interrupted/);
  bodies.set("Docs/One.md", "# One");
  remote.update = update;
  const updates = remote.stats.updates;
  assert.equal(await publish(await review(), ["Docs/One.md"]), 0);
  const entry = profile.pages["file:Docs/One.md"];
  assert.equal(entry.pending, undefined);
  assert.equal(entry.uploadIntents, undefined);
  assert.equal(entry.remoteAttachments.length, 1);
  assert.equal(remote.stats.updates, updates);
  assert.equal((await review()).rows.find(row => row.path === "Docs/One.md").status, "Unchanged");
});

function managementFixture() {
  const fixture = selectionFixture();
  const target = lib.publicationTarget(fixture.config);
  const data = { settings: { ...fixture.config, autoPublish: true }, profiles: { [target]: fixture.profile } };
  const prepare = request => lib.prepareMappingChange(fixture.app, fixture.remote, data, request);
  const apply = (plan, save = async () => {}) => lib.applyMappingChange(fixture.app, fixture.remote, data, save, plan);
  return { ...fixture, data, target, prepare, apply };
}

test("management lists scope states without changing documents or mapping metadata", async () => {
  const f = managementFixture();
  await f.publish(await f.review(), ["Docs/One.md"]);
  f.profile.pages["file:Docs/Gone.md"] = { id: "999" };
  f.profile.pages["file:Elsewhere/Secret.md"] = { id: "999" };
  const before = JSON.stringify(f.data);
  const inventory = await lib.mappingInventory(f.app, f.remote, f.profile);
  assert.equal(inventory.rows.length, 4);
  assert.equal(inventory.rows.find(row => row.path === "Docs/One.md").status, "Linked");
  assert.equal(inventory.rows.find(row => row.path === "Docs/Two.md").status, "Unlinked");
  assert.ok(!inventory.rows.some(row => row.path.startsWith("Elsewhere")));
  assert.equal(JSON.stringify(f.data), before);
});

test("explicit reconnection verifies exact body and hierarchy, backs up metadata and makes no remote writes", async () => {
  const f = managementFixture();
  const page = await f.remote.create("page", "One", "100", '<h1><ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">one</ac:parameter></ac:structured-macro>One</h1>');
  const request = { action: "reconnect", path: "Docs/One.md", id: page.id };
  const stats = { ...f.remote.stats };
  const bodies = [...f.bodies];
  const plan = await f.prepare(request);
  assert.deepEqual(f.profile.pages, {});
  await f.apply(plan);
  const entry = f.data.profiles[f.target].pages["file:Docs/One.md"];
  assert.equal(entry.id, page.id);
  assert.equal(entry.requiresReview, true);
  assert.equal(f.data.settings.autoPublish, false);
  assert.equal(f.data.mappingBackups.length, 1);
  assert.deepEqual(f.data.mappingBackups[0].profiles[f.target].pages, {});
  assert.deepEqual(f.remote.stats, stats);
  assert.deepEqual([...f.bodies], bodies);
});

test("reconnection refuses unrelated bodies, foreign scope, duplicate ownership and stale remote, disk or editor inputs", async () => {
  const f = managementFixture();
  const page = await f.remote.create("page", "One", "100", "<p>Other author</p>");
  const request = { action: "reconnect", path: "Docs/One.md", id: page.id };
  await assert.rejects(f.prepare(request), /do not match/);
  const actual = f.remote.records.get(page.id);
  actual.body.storage.value = '<h1><ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">one</ac:parameter></ac:structured-macro>One</h1>';
  actual.parentId = "999";
  await assert.rejects(f.prepare(request), /unavailable/);
  actual.parentId = "100";
  const other = JSON.stringify([f.config.origin, f.config.folderId, "Other"]);
  f.data.profiles[other] = { pages: { "file:Other/One.md": { id: page.id } } };
  await assert.rejects(f.prepare(request), /already linked/);
  delete f.data.profiles[other];
  let plan = await f.prepare(request);
  actual.version.number++;
  await assert.rejects(f.apply(plan), /mapping changed/);
  plan = await f.prepare(request);
  f.bodies.set("Docs/One.md", "changed");
  await assert.rejects(f.apply(plan), /do not match/);
  f.bodies.set("Docs/One.md", "# One");
  plan = await f.prepare(request);
  f.app.workspace.getLeavesOfType = () => [{ view: { file: f.files[0], editor: { getValue: () => "unsaved" } } }];
  await assert.rejects(f.apply(plan), /Save a valid note/);
  assert.deepEqual(f.profile.pages, {});
});

test("offline local move reconnects the same ID and preserves the remote baseline for manual relocation", async () => {
  const f = managementFixture();
  await f.publish(await f.review(), ["Docs/One.md"]);
  const entry = structuredClone(f.profile.pages["file:Docs/One.md"]);
  f.files[0].path = "Docs/Renamed.md";
  f.files[0].basename = "Renamed";
  f.bodies.set("Docs/Renamed.md", f.bodies.get("Docs/One.md"));
  f.bodies.delete("Docs/One.md");
  const plan = await f.prepare({ action: "reconnect", path: "Docs/Renamed.md", from: "Docs/One.md", id: entry.id });
  const stats = { ...f.remote.stats };
  await f.apply(plan);
  const current = f.data.profiles[f.target];
  assert.equal(current.pages["file:Docs/One.md"], undefined);
  assert.equal(current.pages["file:Docs/Renamed.md"].id, entry.id);
  assert.equal(current.pages["file:Docs/Renamed.md"].renamedFrom, "Docs/One.md");
  assert.equal(f.remote.records.get(entry.id).title, "One");
  assert.deepEqual(f.remote.stats, stats);
});

test("unknown page creation is recovered only by its exact unique placeholder; absent results keep markers", async () => {
  const f = managementFixture();
  f.profile.pages["file:Docs/One.md"] = { creating: true, ticket: "durable-fixture" };
  const request = { action: "recover", path: "Docs/One.md" };
  await assert.rejects(f.prepare(request), /cannot be proved/);
  assert.equal(f.profile.pages["file:Docs/One.md"].creating, true);
  const page = await f.remote.create("page", "One", "100", "<p>Unrelated</p>");
  await assert.rejects(f.prepare(request), /cannot be proved/);
  f.remote.records.get(page.id).body.storage.value = "<p>Confluence Folder Sync pending durable-fixture</p>";
  const plan = await f.prepare(request);
  const stats = { ...f.remote.stats };
  await f.apply(plan);
  const current = f.data.profiles[f.target].pages["file:Docs/One.md"];
  assert.equal(current.id, page.id);
  assert.equal(current.creating, undefined);
  assert.deepEqual(f.remote.stats, stats);
});

test("completed lost-response updates reconcile only own version, body and verified attachment inventory", async () => {
  const f = managementFixture();
  await f.publish(await f.review(), ["Docs/One.md"]);
  const entry = f.profile.pages["file:Docs/One.md"];
  const page = f.remote.records.get(entry.id);
  const body = "<h1>One</h1><p>new</p>";
  entry.pending = { bodyHash: await lib.digest(body), sourceHash: "prior-input", inputHash: "prior-input-hash",
    message: "own-request", title: "One", parent: "100" };
  const request = { action: "recover", path: "Docs/One.md" };
  await assert.rejects(f.prepare(request), /not confirmed/);
  page.version = { number: entry.version + 1, message: "Other author" };
  page.body.storage.value = body;
  await assert.rejects(f.prepare(request), /independently/);
  page.version.message = "own-request";
  const plan = await f.prepare(request);
  const stats = { ...f.remote.stats };
  await f.apply(plan);
  const recovered = f.data.profiles[f.target].pages["file:Docs/One.md"];
  assert.equal(recovered.pending, undefined);
  assert.equal(recovered.version, page.version.number);
  assert.equal(recovered.sourceHash, "prior-input");
  assert.equal(recovered.requiresReview, true);
  assert.deepEqual(f.remote.stats, stats);
});

test("source root migration moves ownership with unchanged IDs and verified content and retains prior metadata", async () => {
  const f = managementFixture();
  await f.publish(await f.review(), f.files.map(file => file.path));
  for (const file of f.files) {
    const prior = file.path;
    file.path = prior.replace(/^Docs\//, "Moved/");
    f.bodies.set(file.path, f.bodies.get(prior));
    f.bodies.delete(prior);
  }
  const oldTarget = f.target;
  f.config.source = "Moved";
  const newTarget = lib.publicationTarget(f.config);
  f.data.settings.source = "Moved";
  f.data.profiles[newTarget] = { pages: {}, folders: {}, imports: {} };
  const plan = await f.prepare({ action: "migrate", fromTarget: oldTarget });
  const stats = { ...f.remote.stats };
  await f.apply(plan);
  assert.equal(f.data.profiles[oldTarget].movedTo, newTarget);
  assert.deepEqual(f.data.profiles[oldTarget].pages, {});
  assert.equal(Object.keys(f.data.profiles[newTarget].pages).length, 3);
  assert.equal(f.data.profiles[newTarget].pages["file:Moved/One.md"].id, f.profile.pages["file:Docs/One.md"].id);
  assert.ok(f.data.profiles[newTarget].folders["dir:Moved/Nested"].id);
  assert.equal(Object.keys(f.data.mappingBackups[0].profiles[oldTarget].pages).length, 3);
  assert.deepEqual(f.remote.stats, stats);
});

test("mapping save failure rolls back metadata while automatic publication remains disabled", async () => {
  const f = managementFixture();
  const page = await f.remote.create("page", "One", "100", '<h1><ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">one</ac:parameter></ac:structured-macro>One</h1>');
  const plan = await f.prepare({ action: "reconnect", path: "Docs/One.md", id: page.id });
  await assert.rejects(f.apply(plan, async () => { throw new Error("disk full"); }), /disk full/);
  assert.deepEqual(f.data.profiles[f.target].pages, {});
  assert.deepEqual(f.data.mappingBackups, []);
  assert.equal(f.data.settings.autoPublish, false);
});

test("management rechecks local files after slow remote reads and rejects changes since the preview", async () => {
  const f = managementFixture();
  const page = await f.remote.create("page", "One", "100", '<h1><ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">one</ac:parameter></ac:structured-macro>One</h1>');
  const request = { action: "reconnect", path: "Docs/One.md", id: page.id };
  const plan = await f.prepare(request);
  const attachments = f.remote.attachments;
  f.remote.attachments = async id => { f.bodies.set("Docs/One.md", "late edit"); return attachments(id); };
  await assert.rejects(f.apply(plan), /local note changed/);
  assert.deepEqual(f.profile.pages, {});
});

test("overlapping Confluence roots cannot acquire duplicate page ownership", async () => {
  const f = managementFixture();
  const page = await f.remote.create("page", "One", "100", '<h1><ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">one</ac:parameter></ac:structured-macro>One</h1>');
  const ancestorTarget = JSON.stringify([f.config.origin, "99", "Another"]);
  f.data.profiles[ancestorTarget] = { pages: { "file:Another/One.md": { id: page.id } } };
  await assert.rejects(f.prepare({ action: "reconnect", path: "Docs/One.md", id: page.id }), /already linked/);
});

test("source migration rejects changed referenced bytes even with unchanged Markdown and a migrated formatter", async () => {
  const f = await imagePublicationFixture();
  await f.publish(await f.review(), ["Docs/One.md"]);
  const oldTarget = lib.publicationTarget(f.config);
  const entry = f.profile.pages["file:Docs/One.md"];
  entry.migratedInputHash = entry.inputHash;
  const nextConfig = { ...f.config, source: "Moved" };
  const newTarget = lib.publicationTarget(nextConfig);
  const oldRead = f.app.vault.read;
  const oldBinary = f.app.vault.readBinary;
  f.app.vault.getFolderByPath = source => fixtureFolder(source, [{ path: "Moved/One.md", extension: "md", basename: "One" }]);
  f.app.vault.read = async file => oldRead({ ...file, path: file.path.replace(/^Moved\//, "Docs/") });
  f.app.vault.readBinary = async () => new Uint8Array([8, 8]).buffer;
  const oldLink = f.app.metadataCache.getFirstLinkpathDest;
  f.app.metadataCache.getFirstLinkpathDest = (...args) => {
    const asset = oldLink(...args);
    return asset ? { ...asset, path: asset.path.replace(/^Docs\//, "Moved/") } : null;
  };
  const data = { settings: nextConfig, profiles: { [oldTarget]: f.profile, [newTarget]: { pages: {}, folders: {}, imports: {} } } };
  f.remote.config = nextConfig;
  await assert.rejects(lib.prepareMappingChange(f.app, f.remote, data, { action: "migrate", fromTarget: oldTarget }), /baseline differs/);
  f.app.vault.readBinary = oldBinary;
});

test("migration can move verified ownership back to a former source profile", async () => {
  const f = managementFixture();
  await f.publish(await f.review(), ["Docs/One.md"]);
  const oldTarget = f.target;
  const one = f.files[0];
  one.path = "Moved/One.md";
  f.bodies.set(one.path, "# One");
  f.config.source = "Moved";
  const newTarget = lib.publicationTarget(f.config);
  f.data.profiles[newTarget] = { pages: {}, folders: {}, imports: {} };
  await f.apply(await f.prepare({ action: "migrate", fromTarget: oldTarget }));
  one.path = "Docs/One.md";
  f.config.source = "Docs";
  await f.apply(await f.prepare({ action: "migrate", fromTarget: newTarget }));
  assert.equal(f.data.profiles[oldTarget].movedTo, undefined);
  assert.ok(f.data.profiles[oldTarget].pages["file:Docs/One.md"].id);
  assert.equal(f.data.profiles[newTarget].movedTo, oldTarget);
});

test("observed source-root rename retains the previous profile baseline for explicit migration", async () => {
  const f = managementFixture();
  await f.publish(await f.review(), ["Docs/One.md"]);
  const original = JSON.stringify(f.profile);
  const plugin = new fakeModule.exports();
  plugin.data = f.data;
  plugin.renameEvents = [{ oldPath: "Docs", newPath: "Moved" }];
  plugin.persist = async () => {};
  await plugin.applyRenames();
  assert.equal(JSON.stringify(f.profile), original);
  assert.equal(plugin.renameEvents.length, 0);
});


test("moving an ancestor of the source root also retains the explicit migration baseline", async () => {
  const plugin = new fakeModule.exports();
  const target = JSON.stringify(["https://example.atlassian.net", "100", "Projects/Docs"]);
  const profile = { pages: { "file:Projects/Docs/One.md": { id: "401", version: 2 } }, folders: {} };
  plugin.data = { profiles: { [target]: profile } };
  plugin.renameEvents = [{ oldPath: "Projects", newPath: "Archive" }];
  plugin.persist = async () => {};
  await plugin.applyRenames();
  assert.ok(profile.pages["file:Projects/Docs/One.md"]);
  assert.equal(profile.pages["file:Archive/Docs/One.md"], undefined);
});

test("unchanged image mappings migrate in both directions with normalized input baselines", async () => {
  const f = await imagePublicationFixture();
  await f.publish(await f.review(), ["Docs/One.md"]);
  const data = { settings: f.config, profiles: { [lib.publicationTarget(f.config)]: f.profile } };
  f.app.metadataCache.getFirstLinkpathDest = () => ({ path: f.config.source + "/picture.png", name: "picture.png",
    extension: "png", stat: { size: 2 } });
  for (const source of ["Moved", "Docs"]) {
    const previous = f.config.source;
    const fromTarget = lib.publicationTarget(f.config);
    for (const file of f.files) {
      const path = file.path;
      file.path = source + path.slice(previous.length);
      f.bodies.set(file.path, f.bodies.get(path));
      f.bodies.delete(path);
    }
    f.config.source = source;
    const target = lib.publicationTarget(f.config);
    data.profiles[target] ??= { pages: {}, folders: {}, imports: {} };
    const plan = await lib.prepareMappingChange(f.app, f.remote, data, { action: "migrate", fromTarget });
    await lib.applyMappingChange(f.app, f.remote, data, async () => {}, plan);
    const entry = data.profiles[target].pages["file:" + source + "/One.md"];
    const tree = await lib.preparedNotes(f.app, f.config);
    assert.equal(entry.inputHash, tree.notes.find(note => note.path === source + "/One.md").inputHash);
    assert.equal(entry.id, f.profile.pages["file:Docs/One.md"].id);
  }
});

test("source traversal visits only visible descendants and never accesses the vault-wide registry", async () => {
  const one = { path: "Docs/첫째.md", basename: "첫째", extension: "md" };
  const two = { path: "Docs/Nested/Second.MD", basename: "Second", extension: "MD" };
  const hidden = { path: "Docs/.private", get children() { throw new Error("Hidden branch enumerated"); } };
  const root = { path: "Docs", children: [one, { path: "Docs/Nested", children: [two] }, hidden,
    { path: "Docs/.private.md", extension: "md" }, { path: "Docs/asset.bin", extension: "bin" }] };
  const reads = [];
  const app = { vault: { getFolderByPath: path => path === "Docs" ? root : null,
    get getMarkdownFiles() { throw new Error("Whole-vault registry accessed"); },
    get getFiles() { throw new Error("Whole-vault registry accessed"); },
    read: async file => { reads.push(file.path); return "# " + file.basename; } },
    metadataCache: { getFirstLinkpathDest: () => null } };
  const tree = await lib.preparedNotes(app, lib.validatedConfig(fixtureConfig));
  assert.deepEqual(tree.notes.map(note => note.path).sort(), [one.path, two.path].sort());
  assert.deepEqual(reads.sort(), [one.path, two.path].sort());
  assert.deepEqual(tree.folders, ["Docs/Nested"]);
});

test("malformed source branches stop before reading notes or inspecting foreign children", async () => {
  let reads = 0;
  const file = { path: "Docs/One.md", basename: "One", extension: "md" };
  const foreign = { path: "Docs-other/Private", get children() { throw new Error("Foreign children accessed"); } };
  const root = { path: "Docs", children: [file, foreign] };
  const app = { vault: { getFolderByPath: () => root, read: async () => { reads++; return "# One"; } } };
  await assert.rejects(lib.preparedNotes(app, lib.validatedConfig(fixtureConfig)), /hierarchy changed/);
  assert.equal(reads, 0);
  root.children = [file, file];
  assert.throws(() => lib.sourceMarkdownFiles(root, "Docs"), /hierarchy changed/);
  root.children = [{ path: "Docs", children: [] }];
  assert.throws(() => lib.sourceMarkdownFiles(root, "Docs"), /hierarchy changed/);
});

test("hidden attachment references are excluded and a note moved during read invalidates the review", async () => {
  const file = { path: "Docs/One.md", basename: "One", extension: "md" };
  const app = { vault: { getFolderByPath: source => fixtureFolder(source, [file]),
    read: async () => "![[secret.png]]", readBinary: async () => { throw new Error("Hidden attachment read"); } },
    metadataCache: { getFirstLinkpathDest: () => ({ path: "Docs/.private/secret.png", extension: "png" }) } };
  const config = lib.validatedConfig(fixtureConfig);
  assert.equal((await lib.preparedNotes(app, config)).notes[0].assets.size, 0);
  app.vault.read = async () => { file.path = "Elsewhere/One.md"; return "Original"; };
  await assert.rejects(lib.preparedNotes(app, config), /hierarchy changed/);
});

test("note and attachment moves during final validation stop before remote writes", async () => {
  const f = selectionFixture();
  await f.publish(await f.review(), ["Docs/One.md"]);
  f.bodies.set("Docs/One.md", "# One\nEdited");
  let plan = await f.review();
  const read = f.app.vault.read;
  const updates = f.remote.stats.updates;
  f.app.vault.read = async file => {
    const text = await read(file);
    if (f.profile.pages["file:Docs/One.md"].pending) file.path = "Outside/One.md";
    return text;
  };
  await assert.rejects(f.publish(plan, ["Docs/One.md"]), /selected note or page changed/);
  assert.equal(f.remote.stats.updates, updates);

  const image = await imagePublicationFixture();
  plan = await image.review();
  const binary = image.app.vault.readBinary;
  const priorUploads = image.remote.stats.uploads;
  image.app.vault.readBinary = async file => {
    const data = await binary(file);
    if (image.profile.pages["file:Docs/One.md"].uploadIntents) file.path = "Outside/picture.png";
    return data;
  };
  await assert.rejects(image.publish(plan, ["Docs/One.md"]), /selected note or page changed/);
  assert.equal(image.remote.stats.uploads, priorUploads);
});

test("prepared notes reject binary moves and actual attachment bytes exceeding stale size metadata", async () => {
  const f = await imagePublicationFixture();
  const binary = f.app.vault.readBinary;
  f.app.vault.readBinary = async file => { const data = await binary(file); file.path = "Outside/picture.png"; return data; };
  await assert.rejects(lib.preparedNotes(f.app, f.config), /hierarchy changed/);
  const g = await imagePublicationFixture();
  g.app.vault.readBinary = async () => new ArrayBuffer(25 * 1024 * 1024 + 1);
  const tree = await lib.preparedNotes(g.app, g.config);
  assert.match(tree.notes.find(note => note.path === "Docs/One.md").problem.message, /25 MiB/);
});

test("a note edited during final attachment validation cannot publish its older reviewed body", async () => {
  const f = await imagePublicationFixture();
  const plan = await f.review();
  const binary = f.app.vault.readBinary;
  const updates = f.remote.stats.updates;
  f.app.vault.readBinary = async file => {
    const data = await binary(file);
    if (f.profile.pages["file:Docs/One.md"].pending) f.bodies.set("Docs/One.md", "Edited during attachment validation");
    return data;
  };
  await assert.rejects(f.publish(plan, ["Docs/One.md"]), /selected note or page changed/);
  assert.equal(f.remote.stats.updates, updates);
});
