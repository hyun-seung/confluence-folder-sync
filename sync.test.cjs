const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const fromBundle = new Function("require", "module",
  readFileSync("main.js", "utf8") + "\nreturn { validatedConfig, vaultPath, markdownLines, toStorage, " +
  "ConfluenceCloud, Publisher, preparedNotes, pageTrails, digest, lineChange, fromStorage, " +
  "attachmentInventory, attachmentDiff, reviewHunks, matchHunk, mergeSelected, applyLocalReview };");
const fakeModule = { exports: {} };
const lib = fromBundle(() => ({ Plugin: class {}, PluginSettingTab: class {}, Modal: class {} }), fakeModule);
const fixtureConfig = {
  folderUrl: "https://example.atlassian.net/wiki/spaces/DOC/folder/100/Test", source: "Docs",
  inbox: "Incoming", email: "test@example.com", secretId: "fixture",
};

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
    update: async (page, value, message) => {
      const item = records.get(page.id);
      assert.equal(page.version.number, item.version.number);
      item.version = { number: page.version.number + 1, message };
      item.body.storage.value = value;
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

