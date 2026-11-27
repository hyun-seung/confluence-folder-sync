const { Plugin, PluginSettingTab, Setting, SecretComponent, Notice, Modal, requestUrl, getLanguage, apiVersion } = require("obsidian");

const DESCENDANTS_DEPTH = 10;
const API = "/wiki/api/v2";
const REST = "/wiki/rest/api";
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

class ApiError extends Error {
  constructor(method, status) {
    super(`Confluence ${method} returned HTTP ${status}.`);
    this.status = status;
    this.method = method;
  }
}

function numericId(value) {
  const id = String(value);
  if (!/^[0-9]+$/.test(id)) throw new Error("Confluence returned an invalid content ID.");
  return id;
}

function normalized(value) {
  return value.normalize("NFC");
}

function pathIn(path, folder) {
  return path === folder || path.startsWith(folder + "/");
}

function vaultPath(input) {
  const parts = normalized(input.trim()).split("/");
  if (parts.some(part => !part || part.startsWith(".") || /[\\:\x00-\x1f]/.test(part))) {
    throw new Error("Use a visible, relative vault folder path.");
  }
  return parts.join("/");
}

function confluenceTarget(folderUrl) {
  let url;
  try {
    url = new URL(folderUrl.trim());
  } catch {
    throw new Error("Enter a Confluence Cloud folder URL.");
  }
  const match = url.pathname.match(/^\/wiki\/spaces\/[~a-zA-Z0-9_-]+\/folder\/([0-9]+)(?:\/[^/]*)?\/?$/);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.atlassian\.net$/.test(url.host)
      || url.username || url.password || !match) {
    throw new Error("Enter the HTTPS URL of a Confluence Cloud folder.");
  }

  return { origin: url.origin, folderId: match[1] };
}

function configuredFolders(sourceInput, inboxInput) {
  const source = vaultPath(sourceInput);
  const inbox = vaultPath(inboxInput);
  if (pathIn(source.toLowerCase(), inbox.toLowerCase()) || pathIn(inbox.toLowerCase(), source.toLowerCase())) {
    throw new Error("Choose separate source and import folders that do not overlap.");
  }
  return { source, inbox };
}

function atlassianAccount(emailInput, secretId) {
  const email = emailInput.trim();
  if (!/^[^\s:@]+@[^\s:@]+$/.test(email) || typeof secretId !== "string" || !secretId.trim()) {
    throw new Error("Set an Atlassian email and select a token in the plugin settings.");
  }
  return { email, secretId };
}

function validatedConfig(settings) {
  if (settings.connectionMode !== undefined && !["publisher", "read-only"].includes(settings.connectionMode)) {
    throw new SyncError("Choose a valid Confluence access mode.");
  }
  return { ...settings, ...confluenceTarget(settings.folderUrl), ...configuredFolders(settings.source, settings.inbox),
    ...atlassianAccount(settings.email, settings.secretId), allowPublish: settings.connectionMode !== "read-only" && settings.allowPublish === true };
}

async function digest(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function attachmentEntry(file) {
  const id = String(file.id).replace(/^att/, "");
  const size = file.fileSize;
  const version = file.version?.number;
  if (!/^[0-9]+$/.test(id) || !Number.isSafeInteger(size) || size < 0 ||
      !Number.isInteger(version) || version < 1 || typeof file.title !== "string") {
    throw new Error("Confluence returned invalid attachment metadata.");
  }
  return { id, title: file.title, version, size };
}

function attachmentInventory(files) {
  const entries = files.map(attachmentEntry).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
    throw new Error("Confluence returned duplicate attachment IDs.");
  }
  return entries;
}

function attachmentDiff(before, after) {
  const prior = new Map(before.map(entry => [entry.id, entry]));
  const changes = [];
  for (const entry of after) {
    const old = prior.get(entry.id);
    if (!old) changes.push({ kind: "Added", title: entry.title, version: entry.version });
    else if (entry.version !== old.version || entry.title !== old.title || entry.size !== old.size) {
      changes.push({ kind: "Changed", title: entry.title, version: entry.version, before: old.version });
    }
    prior.delete(entry.id);
  }
  for (const entry of prior.values()) changes.push({ kind: "Removed", title: entry.title, version: entry.version });
  return changes;
}

function binaryGet(url, headers, expectedBytes) {
  // Node's desktop HTTPS client never follows redirects automatically.
  const { get } = require("node:https");
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error("Could not read the Confluence attachment over HTTPS."));
    const request = get(url, { headers, timeout: 30_000 }, response => {
      const status = response.statusCode;
      if (status !== 200 || expectedBytes === undefined) {
        response.destroy();
        resolve({ status, location: response.headers.location });
        return;
      }
      const bytes = new Uint8Array(expectedBytes);
      let read = 0;
      response.on("data", chunk => {
        if (read + chunk.length > bytes.length) {
          reject(new Error("Attachment exceeded the size reported by Confluence."));
          response.destroy();
          return;
        }
        bytes.set(chunk, read);
        read += chunk.length;
      });
      response.on("end", () => read === bytes.length ? resolve({ status, data: bytes.buffer }) :
        reject(new Error("Attachment size did not match the Confluence metadata.")));
      response.on("error", fail);
      response.on("aborted", fail);
    });
    request.on("error", fail);
    request.on("timeout", () => {
      reject(new Error("Confluence attachment download timed out."));
      request.destroy();
    });
  });
}

class ConfluenceCloud {
  constructor(config, token, request = requestUrl, timing = {}) {
    this.config = config;
    this.request = request;
    this.requests = new RequestQueue(timing);
    this.random = timing.random ?? Math.random;
    this.check = timing.check;
    this.onWait = timing.onWait;
    this.auth = "Basic " + btoa(String.fromCharCode(...new TextEncoder().encode(config.email + ":" + token)));
  }

  async connect() {
    const response = await this.requests.run(() => this.request({
      url: this.config.origin + "/_edge/tenant_info", method: "GET", throw: false,
    }), () => this.check?.(), this.requests.now() + RETRY_WAIT_BUDGET);
    if (response.status !== 200) throw new ApiError("tenant lookup", response.status);
    const id = response.json.cloudId;
    if (typeof id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("The Confluence site did not return a Cloud ID.");
    }
    this.gateway = `https://api.atlassian.com/ex/confluence/${id}`;
    this.folder = await this.get(API + "/folders/" + this.config.folderId);
    if (numericId(this.folder.id) !== this.config.folderId || this.folder.status !== "current") {
      throw new Error("The configured Confluence folder is unavailable.");
    }
    this.spaceId = numericId(this.folder.spaceId);
    return this.folder;
  }

  async call(method, path, options = {}) {
    if (this.config.connectionMode === "read-only" && method !== "GET") throw new SyncError("This connection is read-only in Confluence.");
    if (!path.startsWith(API + "/") && !path.startsWith(REST + "/")) {
      throw new Error("Refusing a request outside the Confluence API.");
    }
    const headers = { Accept: "application/json", Authorization: this.auth, ...options.headers };
    let body = options.body;
    if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.json);
    }
    let response;
    const deadline = this.requests.now() + RETRY_WAIT_BUDGET;
    for (let attempt = 0; attempt < 4; attempt++) {
      let retry = false;
      response = await this.requests.run(async () => {
        const result = await this.request({ url: this.gateway + path, method, headers, body, throw: false });
        const retryAfter = retryAfterMilliseconds(result.headers, this.requests.now());
        if (result.status === 429 || result.status === 503 && retryAfter !== null) {
          const backoff = Math.min(30_000, 1000 * 2 ** attempt);
          const delay = Math.max(backoff, retryAfter ?? 0) + Math.floor(this.random() * backoff * 0.2);
          this.requests.defer(delay);
          retry = method === "GET" && attempt < 3;
          if (retry && this.requests.now() + delay <= deadline &&
              (this.waitNoticeAt === undefined || this.requests.now() - this.waitNoticeAt >= 5000)) {
            this.waitNoticeAt = this.requests.now();
            this.onWait?.(delay);
          }
        }
        return result;
      }, () => this.check?.(), deadline);
      if (!retry) break;
    }
    if (response.status < 200 || response.status >= 300) throw new ApiError(method, response.status);
    return response;
  }

  async get(path, params = {}) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      for (const item of Array.isArray(value) ? value : [value]) qs.append(key, item);
    }
    return (await this.call("GET", path + (qs.size ? "?" + qs : ""))).json;
  }

  async list(path, params) {
    const items = [];
    const visited = new Set();
    let current = await this.get(path, params);
    for (;;) {
      if (!Array.isArray(current.results)) throw new Error("Confluence returned an invalid list.");
      items.push(...current.results);
      if (!current._links?.next) return items;
      const next = new URL(current._links.next, this.gateway);
      if (next.origin !== new URL(this.gateway).origin && next.origin !== this.config.origin) {
        throw new Error("Confluence returned an unexpected pagination host.");
      }
      const endpoint = next.pathname.replace(/^\/ex\/confluence\/[a-f0-9-]+/i, "").replace(/^\/api\/v2\//, "/wiki/api/v2/");
      if (endpoint.replace(/\/$/, "") !== path.replace(/\/$/, "") || visited.has(next.search)) {
        throw new Error("Confluence returned an unexpected pagination cursor.");
      }
      visited.add(next.search);
      current = (await this.call("GET", endpoint + next.search)).json;
    }
  }

  async catalog() {
    const root = this.config.folderId;
    const roots = [{ id: root, kind: "folder" }];
    const queried = new Set();
    const entries = new Map();
    while (roots.length) {
      const { id, kind } = roots.pop();
      if (queried.has(id)) throw new Error("Confluence returned a repeated folder ID.");
      queried.add(id);
      const results = await this.list(API + `/${kind}s/${id}/descendants`, { limit: 100, depth: DESCENDANTS_DEPTH });
      for (const item of results) {
        const childId = numericId(item.id);
        entries.set(childId, item);
        if (item.depth === DESCENDANTS_DEPTH && (item.type === "folder" || item.type === "page")) {
          roots.push({ id: childId, kind: item.type });
        }
      }
    }
    return entries;
  }

  page(id, version, readBody = false) {
    const query = readBody ? { "body-format": "storage" } : {};
    if (version !== undefined) query.version = version;
    return this.get(API + "/pages/" + numericId(id), query);
  }

  pageVersions(id) {
    return this.list(API + "/pages/" + numericId(id) + "/versions", { limit: 50 });
  }

  async currentPages(ids, { allowMissing = false } = {}) {
    const mapped = new Map();
    for (let i = 0; i < ids.length; i += 25) {
      const group = ids.slice(i, i + 25);
      const batch = await this.list(API + "/pages", { id: group, "space-id": this.spaceId, status: "current", limit: 100 });
      for (const page of batch) {
        const id = numericId(page.id);
        if (!group.includes(id) || String(page.spaceId) !== this.spaceId) {
          throw new Error("Confluence returned a page outside the requested scope.");
        }
        mapped.set(id, page);
      }
    }
    if (!allowMissing && mapped.size !== ids.length) throw new Error("A page changed location or became inaccessible. Run the command again.");
    return mapped;
  }

  pageTitles(title) {
    return this.list(API + "/pages", { "space-id": this.spaceId, status: ["current", "archived"], title, limit: 100 });
  }

  async create(kind, title, parent, storage) {
    const json = { title, spaceId: this.spaceId, parentId: numericId(parent) };
    if (kind === "page") {
      json.status = "current";
      json.body = { representation: "storage", value: storage };
    }
    return (await this.call("POST", API + `/${kind}s`, { json })).json;
  }

  async update(page, body, message, destination) {
    const id = numericId(page.id);
    const json = {
      id, title: page.title, status: "current",
      body: { representation: "storage", value: body },
      version: { number: page.version.number + 1, message, minorEdit: true },
    };
    if (destination) {
      json.title = destination.title;
      json.parentId = numericId(destination.parent);
    }
    return (await this.call("PUT", API + "/pages/" + id, { json })).json;
  }

  attachments(id) {
    return this.list(API + `/pages/${numericId(id)}/attachments`, { limit: 100 });
  }

  async downloadAttachment(pageId, file, get = binaryGet) {
    const entry = attachmentEntry(file);
    if (entry.size > MAX_ATTACHMENT_BYTES) throw new SyncError("Attachment exceeds the 25 MiB limit: {title}", { title: entry.title });
    const path = REST + "/content/" + numericId(pageId) + "/child/attachment/" +
      encodeURIComponent(file.id) + "/download?version=" + entry.version;
    const response = await get(this.gateway + path, { Authorization: this.auth });
    if (response.status !== 302 || typeof response.location !== "string") {
      throw new ApiError("attachment lookup", response.status);
    }
    const target = new URL(response.location);
    if (target.origin !== "https://api.media.atlassian.com" || target.username || target.password) {
      throw new Error("Confluence returned an unexpected attachment download host.");
    }
    const media = await get(target.href, {}, entry.size);
    if (media.status !== 200) throw new ApiError("attachment download", media.status);
    if (media.data?.byteLength !== entry.size) throw new Error("Confluence returned a truncated attachment.");
    return media.data;
  }

  async upload(id, asset) {
    const boundary = "confluence-folder-sync-" + crypto.randomUUID();
    const encode = new TextEncoder();
    const segments = [
      encode.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${asset.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      asset.data,
      encode.encode(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="minorEdit"\r\n\r\ntrue\r\n--${boundary}\r\nContent-Disposition: form-data; name="comment"\r\n\r\n${asset.hash}\r\n--${boundary}--\r\n`),
    ];
    const body = await new Blob(segments).arrayBuffer();
    await this.call("POST", REST + `/content/${numericId(id)}/child/attachment`, {
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "X-Atlassian-Token": "nocheck" },
      body,
    });
  }

  pageUrl(id) {
    return `${this.config.origin}/wiki/pages/viewpage.action?pageId=${numericId(id)}`;
  }
}
