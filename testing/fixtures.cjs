const assert = require("node:assert/strict");

function fixtureFolder(source, files) {
  const root = { path: source, children: [] };
  const folders = new Map([[source, root]]);
  for (const file of files.filter(item => item.path.startsWith(source + "/"))) {
    const parts = file.path.slice(source.length + 1).split("/");
    let parent = root;
    for (const name of parts.slice(0, -1)) {
      const path = parent.path + "/" + name;
      if (!folders.has(path)) {
        const folder = { path, children: [] };
        folders.set(path, folder);
        parent.children.push(folder);
      }
      parent = folders.get(path);
    }
    parent.children.push(file);
  }
  return root;
}

const fixtureConfig = {
  folderUrl: "https://example.atlassian.net/wiki/spaces/DOC/folder/100/Test", source: "Docs",
  inbox: "Incoming", email: "test@example.com", secretId: "fixture",
};

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

function selectionFixture(lib) {
  const config = lib.validatedConfig({ ...fixtureConfig, allowPublish: true });
  const remote = memoryCloud(config);
  const profile = { folders: {}, pages: {}, imports: {} };
  const files = ["Docs/One.md", "Docs/Two.md", "Docs/Nested/Three.md"].map(path =>
    ({ path, basename: path.split("/").at(-1).slice(0, -3), extension: "md" }));
  const bodies = new Map(files.map(file => [file.path, "# " + file.basename]));
  const app = { workspace: { getLeavesOfType: () => [] }, vault: { getFolderByPath: source => fixtureFolder(source, files),
    getFileByPath: path => files.find(file => file.path === path), read: async file => bodies.get(file.path) },
    metadataCache: { getFirstLinkpathDest: target => files.find(file => file.basename === target) } };
  const review = async () => lib.publicationReview(app, remote, profile,
    await lib.preparedNotes(app, config), await remote.catalog());
  const publish = async (plan, paths) => lib.publishSelection(app, remote, profile, async () => {}, plan, paths);
  return { config, remote, profile, files, bodies, app, review, publish };
}

module.exports = { fixtureFolder, fixtureConfig, memoryCloud, selectionFixture };
