const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const fromBundle = new Function("require", "module",
  readFileSync("main.js", "utf8") + "\nreturn { validatedConfig, vaultPath, markdownLines, toStorage, " +
  "ConfluenceCloud, Publisher, preparedNotes, pageTrails, digest, lineChange, fromStorage, " +
  "attachmentInventory, attachmentDiff, reviewHunks, matchHunk, mergeSelected, applyLocalReview, " +
  "KOREAN, syncLanguage, translate, localizedError, SyncError, ApiError, publicationReview, publishSelection, " +
  "resolveConflict, publicationTarget, rekeySource };");
const fakeModule = { exports: {} };
const lib = fromBundle(() => ({ Plugin: class {}, PluginSettingTab: class {}, Modal: class {} }), fakeModule);
const fixtureConfig = {
  folderUrl: "https://example.atlassian.net/wiki/spaces/DOC/folder/100/Test", source: "Docs",
  inbox: "Incoming", email: "test@example.com", secretId: "fixture",
};

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
  assert.match(result, /<th>A<\/th><th>B<\/th>/);
  assert.match(result, /<ul><li>One<ul><li>Subitem/);
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
      getFolderByPath: () => ({}), getMarkdownFiles: () => [document],
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

function memoryCloud(config) {
  let nextId = 401;
  const stats = { creates: 0, updates: 0, uploads: 0 };
  const records = new Map();
  const files = new Map();
  const remote = {
    config, spaceId: "300", records, stats,
    catalog: async () => new Map(records),
    pageUrl: id => config.origin + "/wiki/pages/viewpage.action?pageId=" + id,
    page: async id => structuredClone(records.get(id)),
    pageTitles: async title => Array.from(records.values()).filter(item => item.type === "page" && item.title === title),
    get: async route => structuredClone(records.get(route.split("/").at(-1))),
    create: async (type, title, parentId, value) => {
      const id = String(nextId++);
      const item = { id, type, title, parentId, status: "current", spaceId: "300",
        version: { number: 1 }, body: { storage: { value } } };
      records.set(id, item);
      stats.creates++;
      return structuredClone(item);
    },
    update: async (page, value, message, destination) => {
      const item = records.get(page.id);
      assert.equal(page.version.number, item.version.number);
      item.version = { number: page.version.number + 1, message };
      item.body.storage.value = value;
      if (destination) { item.title = destination.title; item.parentId = destination.parent; }
      stats.updates++;
      return structuredClone(item);
    },
    attachments: async id => files.get(id) ?? [],
    upload: async (id, asset) => {
      const items = files.get(id) ?? [];
      assert.ok(!items.some(item => item.title === asset.name));
      items.push({ id: "att" + String(900 + stats.uploads), title: asset.name, comment: asset.hash,
        fileSize: asset.data.byteLength, version: { number: 1 } });
      files.set(id, items);
      stats.uploads++;
    },
  };
  return remote;
}

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
      getFolderByPath: () => ({}), getMarkdownFiles: () => files,
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
    vault: { getFolderByPath: () => ({}), getMarkdownFiles: () => [file], read: async () => text },
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


function selectionFixture() {
  const config = lib.validatedConfig({ ...fixtureConfig, allowPublish: true });
  const remote = memoryCloud(config);
  const profile = { folders: {}, pages: {}, imports: {} };
  const files = ["Docs/One.md", "Docs/Two.md", "Docs/Nested/Three.md"].map(path =>
    ({ path, basename: path.split("/").at(-1).slice(0, -3), extension: "md" }));
  const bodies = new Map(files.map(file => [file.path, "# " + file.basename]));
  const app = { vault: { getFolderByPath: () => ({}), getMarkdownFiles: () => files,
    getFileByPath: path => files.find(file => file.path === path), read: async file => bodies.get(file.path) },
    metadataCache: { getFirstLinkpathDest: target => files.find(file => file.basename === target) } };
  const review = async () => lib.publicationReview(app, remote, profile,
    await lib.preparedNotes(app, config), await remote.catalog());
  const publish = async (plan, paths) => lib.publishSelection(app, remote, profile, async () => {}, plan, paths);
  return { config, remote, profile, files, bodies, app, review, publish };
}

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
