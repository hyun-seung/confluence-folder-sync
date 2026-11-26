const { fixtureFolder, fixtureConfig } = require("./fixtures.cjs");
const { setTimeout: delay } = require("node:timers/promises");

async function largeFixture(lib, count = 1000, latency = 0) {
  const config = lib.validatedConfig({ ...fixtureConfig, allowPublish: true, autoCheck: true, autoPublish: false, language: "en" });
  const records = new Map();
  const profile = { folders: {}, pages: {}, imports: {} };
  const files = [];
  const bodies = new Map();
  let folderId = 10000;
  function folder(path) {
    if (path === "Docs") return "100";
    const key = "dir:" + path;
    if (!profile.folders[key]) {
      const parent = path.slice(0, path.lastIndexOf("/"));
      const parentId = folder(parent);
      const id = String(folderId++);
      const title = path.split("/").at(-1);
      profile.folders[key] = { id, title, parent: parentId };
      records.set(id, { id, title, parentId, type: "folder", status: "current", spaceId: "300" });
    }
    return profile.folders[key].id;
  }
  for (let index = 0; index < count; index++) {
    const title = "Note" + String(index).padStart(5, "0");
    const directory = `Docs/Section${index % 10}/Part${Math.floor(index / 10) % 10}`;
    const parentId = folder(directory);
    const path = directory + "/" + title + ".md";
    const file = { path, basename: title, extension: "md" };
    files.push(file);
    bodies.set(path, "# " + title);
    const id = String(20000 + index);
    records.set(id, { id, title, parentId, type: "page", status: "current", spaceId: "300", version: { number: 1 } });
    profile.pages["file:" + path] = { id, title, parent: parentId, version: 1, remoteAttachments: [] };
  }
  const counters = { requests: 0, individualPages: 0, bulkPages: 0, attachments: 0, folders: 0, descendants: 0, writes: 0, active: 0, peak: 0 };
  const request = async options => {
    counters.requests++;
    counters.active++;
    counters.peak = Math.max(counters.peak, counters.active);
    try {
      if (latency) await delay(latency);
      else await new Promise(resolve => setImmediate(resolve));
      const url = new URL(options.url);
      const route = url.pathname.replace(/^\/ex\/confluence\/[a-f0-9-]+/i, "");
      if (options.method !== "GET") { counters.writes++; throw new Error("Read-only benchmark attempted a write"); }
      if (route === "/wiki/api/v2/pages") {
        counters.bulkPages++;
        const results = url.searchParams.getAll("id").map(id => records.get(id)).filter(Boolean);
        return { status: 200, json: { results: structuredClone(results) } };
      }
      if (route.endsWith("/descendants")) {
        counters.descendants++;
        const start = Number(url.searchParams.get("cursor") ?? 0);
        const all = [...records.values()];
        return { status: 200, json: { results: structuredClone(all.slice(start, start + 100)), _links:
          start + 100 < all.length ? { next: route + "?cursor=" + (start + 100) } : {} } };
      }
      if (/\/pages\/\d+\/attachments$/.test(route)) {
        counters.attachments++;
        return { status: 200, json: { results: [] } };
      }
      if (/\/pages\/\d+$/.test(route)) counters.individualPages++;
      else if (/\/folders\/\d+$/.test(route)) counters.folders++;
      else throw new Error("Unexpected synthetic endpoint: " + route);
      const record = records.get(route.split("/").at(-1));
      return record ? { status: 200, json: structuredClone(record) } : { status: 404, headers: {} };
    } finally { counters.active--; }
  };
  const client = new lib.ConfluenceCloud(config, "synthetic-not-a-credential", request);
  client.gateway = "https://api.atlassian.com/ex/confluence/12345678-1234-1234-1234-123456789012";
  client.spaceId = "300";
  const app = { vault: { getFolderByPath: source => fixtureFolder(source, files), read: async file => bodies.get(file.path) },
    metadataCache: { getFirstLinkpathDest: () => null }, workspace: { getLeavesOfType: () => [] } };
  const tree = await lib.preparedNotes(app, config);
  for (const note of tree.notes) {
    const entry = profile.pages["file:" + note.path];
    Object.assign(entry, { sourceHash: note.sourceHash, inputHash: note.inputHash,
      bodyHash: await lib.digest(lib.resolvedStorage(note, app, client, new Map())) });
  }
  const plugin = { app, language: "en", data: { settings: config, history: [], profiles: {} },
    t: (message, values) => lib.translate("en", message, values),
    operation: async (_label, task) => task({ client, profile, save: async () => {} }) };
  return { client, config, app, profile, tree, plugin, counters, records, files, bodies };
}

module.exports = { largeFixture };
