"use strict";

const { Plugin, PluginSettingTab, Setting, SecretComponent, Notice, Modal, requestUrl } = require("obsidian");

const DESCENDANTS_DEPTH = 10;
const API = "/wiki/api/v2";
const REST = "/wiki/rest/api";

class ApiError extends Error {
  constructor(method, status) {
    super(`Confluence ${method} returned HTTP ${status}.`);
    this.status = status;
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

function validatedConfig(settings) {
  let url;
  try {
    url = new URL(settings.folderUrl.trim());
  } catch {
    throw new Error("Enter a Confluence Cloud folder URL.");
  }
  const match = url.pathname.match(/^\/wiki\/spaces\/[~a-zA-Z0-9_-]+\/folder\/([0-9]+)(?:\/[^/]*)?\/?$/);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.atlassian\.net$/.test(url.host)
      || url.username || url.password || !match) {
    throw new Error("Enter the HTTPS URL of a Confluence Cloud folder.");
  }

  const source = vaultPath(settings.source);
  const inbox = vaultPath(settings.inbox);
  if (pathIn(source.toLowerCase(), inbox.toLowerCase()) || pathIn(inbox.toLowerCase(), source.toLowerCase())) {
    throw new Error("Choose separate source and import folders that do not overlap.");
  }
  const email = settings.email.trim();
  if (!/^[^\s:@]+@[^\s:@]+$/.test(email) || !settings.secretId) {
    throw new Error("Set an Atlassian email and select a token in the plugin settings.");
  }
  return { ...settings, origin: url.origin, folderId: match[1], source, inbox, email };
}

async function digest(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

class ConfluenceCloud {
  constructor(config, token, request = requestUrl) {
    this.config = config;
    this.request = request;
    this.auth = "Basic " + btoa(String.fromCharCode(...new TextEncoder().encode(config.email + ":" + token)));
  }

  async connect() {
    const response = await this.request({
      url: this.config.origin + "/_edge/tenant_info", method: "GET", throw: false,
    });
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
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await this.request({ url: this.gateway + path, method, headers, body, throw: false });
      if (method !== "GET" || (response.status !== 429 && response.status !== 503) || attempt === 2) break;
      const delay = Number(response.headers?.["retry-after"]) || 2;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.min(10, Math.max(1, delay))));
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

  async currentPages(ids) {
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
    if (mapped.size !== ids.length) throw new Error("A page changed location or became inaccessible. Run the command again.");
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

  async update(page, body, message) {
    const id = numericId(page.id);
    const json = {
      id, title: page.title, status: "current",
      body: { representation: "storage", value: body },
      version: { number: page.version.number + 1, message, minorEdit: true },
    };
    return (await this.call("PUT", API + "/pages/" + id, { json })).json;
  }

  attachments(id) {
    return this.list(API + `/pages/${numericId(id)}/attachments`, { limit: 100 });
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

function xml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}

function webLink(value, origin) {
  try {
    const url = new URL(value, origin);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
  } catch {
    return null;
  }
  return null;
}

function codeFence(text, language = "") {
  const character = String.fromCharCode(96);
  const longest = Math.max(2, ...(text.match(new RegExp(character + "+", "g")) ?? []).map(run => run.length));
  const marker = character.repeat(longest + 1);
  return marker + language + "\n" + text + "\n" + marker;
}

function storageCode(text, language) {
  const safeLanguage = /^[a-z0-9+_-]+$/i.test(language) ? language : "";
  return '<ac:structured-macro ac:name="code">' +
    (safeLanguage ? '<ac:parameter ac:name="language">' + xml(safeLanguage) + '</ac:parameter>' : "") +
    '<ac:plain-text-body><![CDATA[' + text.replace(/\]\]>/g, "]]]]><![CDATA[>") + ']]></ac:plain-text-body>' +
    '</ac:structured-macro>';
}

function tableCells(line) {
  const table = line.trim().replace(/^\||(?<!\\)\|$/g, "");
  const results = [];
  let start = 0;
  for (const token of table.matchAll(/\[\[[^\]\n]+\]\]|\x60+[^\x60]+\x60+|\\\||\|/g)) {
    if (token[0] !== "|") continue;
    results.push(table.slice(start, token.index));
    start = token.index + 1;
  }
  results.push(table.slice(start));
  return results.map(cell => cell.trim().replace(/\\\|/g, "|"));
}

const MARKDOWN_REF = /(!?)\[\[([^\]\n]+)\]\]|(!?)\[([^\]\n]*)\]\(\s*(?:<([^<>\n]+)>|([^\s()]+))(?:\s+"[^"\n]*")?\s*\)/g;
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

function referenceTarget(match) {
  if (match[2] !== undefined) {
    const [target, alias] = match[2].replace(/\\\|/g, "|").split("|", 2);
    return { embed: Boolean(match[1]), target: target.trim(), label: alias || target.trim() };
  }
  return { embed: Boolean(match[3]), target: match[5] ?? match[6], label: match[4] };
}

function textMarkup(value) {
  return xml(value)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
}

function markdownLines(markdown, visitor) {
  const source = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, "");
  const units = [];
  const fencePattern = /^\s{0,3}([~]{3,}|\x60{3,})(.*)$/;
  let fence;
  let code = [];
  for (const line of source.split("\n")) {
    const marker = fencePattern.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.mark[0] && marker[1].length >= fence.mark.length && !marker[2].trim()) {
        units.push({ code: code.join("\n"), language: fence.language });
        code = [];
        fence = null;
      } else {
        code.push(line);
      }
    } else if (marker) {
      fence = { mark: marker[1], language: marker[2].trim().split(/\s+/)[0] };
    } else {
      units.push({ line });
      if (visitor) {
        for (const text of line.split(/(\x60+[^\x60]+\x60+)/g)) {
          if (text.startsWith(String.fromCharCode(96))) continue;
          for (const match of text.matchAll(MARKDOWN_REF)) visitor(referenceTarget(match));
        }
      }
    }
  }
  if (fence) units.push({ code: code.join("\n"), language: fence.language });
  return units;
}

function toStorage(units, linkFor) {
  const inline = (line) => line.split(/(\x60+[^\x60]+\x60+)/g).map((part, index) => {
    if (index % 2) return "<code>" + xml(part.replace(/^\x60+|\x60+$/g, "")) + "</code>";
    let output = "";
    let offset = 0;
    for (const match of part.matchAll(MARKDOWN_REF)) {
      output += textMarkup(part.slice(offset, match.index));
      output += linkFor(referenceTarget(match));
      offset = match.index + match[0].length;
    }
    return output + textMarkup(part.slice(offset));
  }).join("");

  const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/;
  const separator = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
  const heading = /^ {0,3}(#{1,6})\s+(.+)$/;
  const divider = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const isTable = i => units[i]?.line?.includes("|") && separator.test(units[i + 1]?.line ?? "");
  const listType = match => /^[0-9]/.test(match[2]) ? "ol" : "ul";
  const html = [];

  function renderList(index, first) {
    const indent = first[1].length;
    const type = listType(first);
    let output = "<" + type + ">";
    for (; index < units.length;) {
      const item = listItem.exec(units[index].line ?? "");
      if (!item || item[1].length !== indent || listType(item) !== type) break;
      output += "<li>" + inline(item[3]);
      index++;
      const next = listItem.exec(units[index]?.line ?? "");
      if (next && next[1].length > indent && next[1].length - indent <= 8) {
        const nested = renderList(index, next);
        output += nested.html;
        index = nested.index;
      }
      output += "</li>";
    }
    return { html: output + "</" + type + ">", index };
  }

  for (let i = 0; i < units.length;) {
    const { line, code, language } = units[i];
    if (code !== undefined) {
      html.push(storageCode(code, language));
      i++;
    } else if (!line.trim()) {
      i++;
    } else if (isTable(i)) {
      const headers = tableCells(line);
      const row = (cells, tag) => "<tr>" + headers.map((_, index) =>
        "<" + tag + ">" + inline(cells[index] ?? "") + "</" + tag + ">"
      ).join("") + "</tr>";
      let body = "<table><tbody>" + row(headers, "th");
      i += 2;
      while (units[i]?.line?.trim() && units[i].line.includes("|")) body += row(tableCells(units[i++].line), "td");
      html.push(body + "</tbody></table>");
    } else if (heading.test(line)) {
      const [, marks, name] = heading.exec(line);
      const tag = "h" + marks.length;
      const anchor = localSlug(name);
      const macro = anchor ? '<ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">' +
        xml(anchor) + '</ac:parameter></ac:structured-macro>' : "";
      html.push("<" + tag + ">" + macro + inline(name) + "</" + tag + ">");
      i++;
    } else if (divider.test(line)) {
      html.push("<hr />");
      i++;
    } else if (listItem.test(line)) {
      const list = renderList(i, listItem.exec(line));
      html.push(list.html);
      i = list.index;
    } else if (/^\s*>/.test(line)) {
      const quoted = [];
      while (/^\s*>/.test(units[i]?.line ?? "")) quoted.push(inline(units[i++].line.replace(/^\s*>\s?/, "")));
      html.push("<blockquote><p>" + quoted.join("<br />") + "</p></blockquote>");
    } else {
      const parts = [inline(line)];
      i++;
      while (units[i]?.line?.trim() && !heading.test(units[i].line) && !divider.test(units[i].line)
          && !listItem.test(units[i].line) && !/^\s*>/.test(units[i].line) && !isTable(i)) {
        parts.push(inline(units[i++].line));
      }
      html.push("<p>" + parts.join("<br />") + "</p>");
    }
  }
  return html.join("\n") || "<p></p>";
}

function markdownText(text) {
  return String(text).replace(/[<>&]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char])
    .replace(/([\\\x60*\[\]_|])/g, "\\$1");
}

function fromStorage(body, pageUrl, attachments = new Map()) {
  const ac = "http://atlassian.com/content";
  const ri = "http://atlassian.com/resource/identifier";
  const entities = { nbsp: "&#160;", ndash: "&#8211;", mdash: "&#8212;", hellip: "&#8230;" };
  const storage = body.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g).map((part, index) =>
    index % 2 ? part : part.replace(/&([a-z]+);/gi, (match, name) =>
      ["amp", "lt", "gt", "quot", "apos"].includes(name) ? match : entities[name] ?? "&amp;" + name + ";")
  ).join("");
  const parsed = new DOMParser().parseFromString(
    '<body xmlns:ac="' + ac + '" xmlns:ri="' + ri + '">' + storage + "</body>", "application/xml"
  );
  if (parsed.getElementsByTagName("parsererror").length) {
    throw new Error("Confluence returned storage markup this version cannot convert.");
  }
  const element = (node, ns, name) =>
    Array.from(node.children).find(child => child.namespaceURI === ns && child.localName === name);
  const contents = node => Array.from(node.childNodes).map(render).join("");
  const block = text => "\n\n" + text.trim() + "\n\n";
  function render(node) {
    if (node.nodeType === 3 || node.nodeType === 4) return markdownText(node.nodeValue);
    if (node.nodeType !== 1) return "";
    const tag = node.localName;
    if (node.namespaceURI === ac && tag === "structured-macro") {
      const name = node.getAttributeNS(ac, "name") || "unknown";
      if (name === "anchor") return "";
      if (name === "code" || name === "noformat") {
        const language = Array.from(node.children).find(el => el.getAttributeNS(ac, "name") === "language");
        return block(codeFence(element(node, ac, "plain-text-body")?.textContent ?? "", (language?.textContent ?? "").replace(/[^a-z0-9+_-]/gi, "")));
      }
      const detail = element(node, ac, "rich-text-body");
      return block("> Confluence macro: " + markdownText(name) + (detail ? "\n" + contents(detail) : ""));
    }
    if (tag === "script" || tag === "style" || tag === "iframe") return "";
    const text = contents(node);
    if (tag === "table") {
      const rows = Array.from(node.getElementsByTagName("tr")).map(row =>
        Array.from(row.children).map(cell => contents(cell).trim().replace(/\s*\n\s*/g, " ")));
      if (!rows.length) return "";
      rows.splice(1, 0, rows[0].map(() => "---"));
      return block(rows.map(row => "| " + row.join(" | ") + " |").join("\n"));
    }
    if (tag === "ol" || tag === "ul") {
      return block(Array.from(node.children).map((item, index) => {
        const lines = contents(item).trim().split("\n");
        return (tag === "ol" ? (index + 1) + ". " : "- ") + lines.map((line, n) => n ? "    " + line : line).join("\n");
      }).join("\n"));
    }
    if (tag === "a" || tag === "link" || tag === "image" || tag === "img") {
      const attachment = element(node, ri, "attachment");
      const targetPage = element(node, ri, "page");
      const imageUrl = element(node, ri, "url");
      const linkBody = element(node, ac, "link-body") || element(node, ac, "plain-text-link-body");
      const label = (linkBody ? contents(linkBody) : text).trim() ||
        markdownText(attachment?.getAttributeNS(ri, "filename") || targetPage?.getAttributeNS(ri, "content-title") ||
          node.getAttribute("alt") || node.getAttribute("href") || "Confluence attachment");
      const anchor = node.getAttributeNS(ac, "anchor");
      const url = webLink(attachments.get(attachment?.getAttributeNS(ri, "filename")) ||
        node.getAttribute("href") || node.getAttribute("src") ||
        imageUrl?.getAttributeNS(ri, "value") || (anchor ? "#" + anchor : pageUrl), pageUrl);
      return url ? "[" + label + "](<" + url + ">)" : label;
    }
    if (/^h[1-6]$/.test(tag)) return block("#".repeat(Number(tag[1])) + " " + text);
    if (tag === "p" || tag === "div") return block(text);
    if (tag === "strong" || tag === "b") return "**" + text + "**";
    if (tag === "em" || tag === "i") return "*" + text + "*";
    if (tag === "code") {
      const marker = String.fromCharCode(96);
      const raw = node.textContent;
      const ticks = marker.repeat(Math.max(1, ...(raw.match(/\x60+/g) ?? []).map(run => run.length + 1)));
      return ticks + (raw.includes(marker) ? " " + raw + " " : raw) + ticks;
    }
    if (tag === "pre") return block(codeFence(node.textContent));
    if (tag === "br") return "\n";
    if (tag === "blockquote") return block(text.trim().split("\n").map(line => "> " + line).join("\n"));
    if (tag === "hr") return block("---");
    return text;
  }
  return contents(parsed.documentElement).trim() + "\n";
}

function diffLines(before, after) {
  const left = before.trimEnd().split("\n");
  const right = after.trimEnd().split("\n");
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let end = 0;
  while (start + end < left.length && start + end < right.length &&
      left[left.length - end - 1] === right[right.length - end - 1]) end++;
  if (start === left.length && start === right.length) return "";
  const oldLines = left.slice(start, left.length - end);
  const newLines = right.slice(start, right.length - end);
  const lines = ["@@ from line " + (start + 1) + " @@"];
  const width = newLines.length + 1;
  const cells = (oldLines.length + 1) * width;
  if (cells > 2_000_000) {
    lines.push("Large comparison: changed range shown as two blocks.");
    for (const text of oldLines) lines.push("-" + text);
    for (const text of newLines) lines.push("+" + text);
    return lines.join("\n");
  }
  const matches = new Uint32Array(cells);
  for (let a = oldLines.length - 1; a >= 0; a--) {
    for (let b = newLines.length - 1; b >= 0; b--) {
      const at = a * width + b;
      matches[at] = oldLines[a] === newLines[b] ? 1 + matches[at + width + 1] :
        Math.max(matches[at + width], matches[at + 1]);
    }
  }
  for (let a = 0, b = 0; a < oldLines.length || b < newLines.length;) {
    if (a < oldLines.length && b < newLines.length && oldLines[a] === newLines[b]) {
      lines.push(" " + oldLines[a++]);
      b++;
    } else if (a < oldLines.length && (b === newLines.length ||
        matches[(a + 1) * width + b] >= matches[a * width + b + 1])) {
      lines.push("-" + oldLines[a++]);
    } else {
      lines.push("+" + newLines[b++]);
    }
  }
  return lines.join("\n");
}

function lineChange(before, after) {
  const diff = diffLines(before, after);
  return diff ? codeFence(diff, "diff") : "No converted Markdown body difference.";
}

function parentPath(path) {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.slice(0, lastSlash);
}

function ancestors(path, stop) {
  const result = [];
  for (let folder = parentPath(path); folder && folder !== stop; folder = parentPath(folder)) result.unshift(folder);
  return result;
}

function localSlug(text) {
  return normalized(text.trim().toLowerCase()).replace(/[^\p{L}\p{N}_ -]/gu, "").replace(/\s+/g, "-");
}

function vaultReference(reference, file, app, source) {
  const url = /^[a-z][a-z+.-]*:/i.test(reference.target) || reference.target.startsWith("//");
  if (url) return null;
  const [path, anchor] = reference.target.split("#", 2);
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  const target = decoded ? app.metadataCache.getFirstLinkpathDest(decoded, file.path) : file;
  if (!target?.extension || !target.path.startsWith(source + "/")) return null;
  return { file: target, anchor };
}

async function preparedNotes(app, config) {
  const folder = app.vault.getFolderByPath(config.source);
  if (!folder) throw new Error("The selected source folder does not exist in this vault.");
  const notes = [];
  const folders = new Set();
  const titles = new Set();
  const binaries = new Map();
  const files = app.vault.getMarkdownFiles().filter(file => file.path.startsWith(config.source + "/"));
  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    for (const path of ancestors(file.path, config.source)) folders.add(path);
    const title = normalized(file.basename);
    if (titles.has(title.toLowerCase())) throw new Error("Duplicate page title in the source folder: " + title);
    if (title.length > 255) throw new Error("A source title exceeds the Confluence maximum: " + title.slice(0, 100));
    titles.add(title.toLowerCase());
    const source = await app.vault.read(file);
    const assets = new Map();
    const references = [];
    const units = markdownLines(source, reference => references.push(reference));
    for (const reference of references) {
      const target = vaultReference(reference, file, app, config.source);
      if (!target || target.file.extension?.toLowerCase() === "md") continue;
      let asset = binaries.get(target.file.path);
      if (!asset) {
        if (target.file.stat.size > 25 * 1024 * 1024) {
          throw new Error("An attachment exceeds this plugin's 25 MiB limit: " + target.file.name);
        }
        const data = await app.vault.readBinary(target.file);
        const hash = await digest(data);
        const safeName = target.file.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-100);
        asset = { data, hash, name: "cfs-" + hash.slice(0, 24) + "-" + safeName };
        binaries.set(target.file.path, asset);
      }
      assets.set(target.file.path, asset);
    }
    notes.push({ file, title, units, assets, sourceHash: await digest(source) });
  }
  return { notes, folders: Array.from(folders).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)) };
}

function resolvedStorage(note, app, client, ids) {
  return toStorage(note.units, reference => {
    const target = vaultReference(reference, note.file, app, client.config.source);
    const label = textMarkup(reference.label);
    if (target) {
      const page = ids.get(target.file.path);
      if (page) {
        const url = client.pageUrl(page) + (target.anchor ? "#" + encodeURIComponent(localSlug(target.anchor)) : "");
        return '<a href="' + xml(url) + '">' + label + "</a>";
      }
      const asset = note.assets.get(target.file.path);
      if (asset) {
        const attachment = '<ri:attachment ri:filename="' + asset.name + '" />';
        if (reference.embed && IMAGE_FILE.test(target.file.name)) {
          return '<ac:image ac:alt="' + xml(reference.label) + '">' + attachment + "</ac:image>";
        }
        return '<ac:link>' + attachment + '<ac:link-body>' + label + '</ac:link-body></ac:link>';
      }
    }
    if (/^https?:\/\//i.test(reference.target)) {
      const url = webLink(reference.target, client.config.origin);
      if (url) return '<a href="' + xml(url) + '">' + label + "</a>";
    }
    return label;
  });
}

function confirmParent(kind, remote, expected, parent, title, spaceId) {
  const id = numericId(remote.id);
  if (remote.status !== "current" || String(remote.parentId) !== parent || String(remote.spaceId) !== spaceId ||
      normalized(remote.title) !== title || (expected?.id && id !== expected.id)) {
    throw new Error("Confluence " + kind + " changed position, name or status: " + title);
  }
  return id;
}

function validateVersion(remote, entry) {
  const version = remote.version.number;
  if (version === entry.version) return false;
  if (entry.pending && version === entry.version + 1 && remote.version.message === entry.pending.message) return true;
  throw new Error("Confluence page has an independent edit: " + remote.title + ". Run Preview Confluence changes.");
}

function placeholder(entry) {
  return "<p>Confluence Folder Sync pending " + entry.ticket + "</p>";
}

class Publisher {
  constructor(client, app, profile, save) {
    this.client = client;
    this.app = app;
    this.profile = profile;
    this.save = save;
  }

  async inspect(kind, entries, key, title, parent, catalog) {
    const recorded = entries[key];
    if (recorded?.id) {
      if (!parent || !catalog.has(recorded.id)) throw new Error("A mapped item is outside the configured folder: " + title);
      const remote = kind === "page" ? await this.client.page(recorded.id) :
        await this.client.get(API + "/folders/" + recorded.id);
      confirmParent(kind, remote, recorded, parent, title, this.client.spaceId);
      if (kind === "page") validateVersion(remote, recorded);
      return remote;
    }

    const matches = kind === "page" ? await this.client.pageTitles(title) :
      Array.from(catalog.values()).filter(item => parent && String(item.parentId) === parent &&
        normalized(item.title).toLowerCase() === title.toLowerCase());
    if (!matches.length) {
      if (recorded?.creating) throw new Error("The previous create result is unknown: " + title);
      return null;
    }
    if (kind === "page" && recorded?.creating && matches.length === 1 && parent) {
      const candidate = await this.client.page(matches[0].id, undefined, true);
      if (candidate.version.number === 1 && candidate.body.storage.value.trim() === placeholder(recorded)) {
        confirmParent(kind, candidate, recorded, parent, title, this.client.spaceId);
        return candidate;
      }
    }
    throw new Error("An existing Confluence item is not linked to this source: " + title);
  }

  async plan(tree, catalog) {
    const folders = new Map([[this.client.config.source, this.client.config.folderId]]);
    for (const path of tree.folders) {
      const remote = await this.inspect("folder", this.profile.folders, "dir:" + path,
        normalized(path.split("/").at(-1)), folders.get(parentPath(path)), catalog);
      folders.set(path, remote ? numericId(remote.id) : null);
    }
    for (const note of tree.notes) {
      await this.inspect("page", this.profile.pages, "file:" + note.file.path, note.title,
        folders.get(parentPath(note.file.path)), catalog);
    }
  }

  async claim(kind, entries, key, title, parent, catalog) {
    let remote = await this.inspect(kind, entries, key, title, parent, catalog);
    const entry = entries[key] ??= { ticket: crypto.randomUUID() };
    if (!remote) {
      entry.creating = true;
      await this.save();
      try {
        remote = await this.client.create(kind, title, parent, placeholder(entry));
      } catch (error) {
        if (error instanceof ApiError && [400, 401, 403, 404, 413, 429].includes(error.status)) {
          delete entry.creating;
          await this.save();
        }
        throw error;
      }
      confirmParent(kind, remote, entry, parent, title, this.client.spaceId);
    }
    if (!entry.id) {
      entry.id = numericId(remote.id);
      if (kind === "page") {
        entry.version = remote.version.number;
        entry.title = title;
        entry.parent = parent;
      }
      delete entry.creating;
      await this.save();
    }
    catalog.set(entry.id, remote);
    return entry;
  }

  async publish(tree, catalog) {
    const folders = new Map([[this.client.config.source, this.client.config.folderId]]);
    const ids = new Map();
    for (const path of tree.folders) {
      const entry = await this.claim("folder", this.profile.folders, "dir:" + path,
        normalized(path.split("/").at(-1)), folders.get(parentPath(path)), catalog);
      folders.set(path, entry.id);
    }
    for (const note of tree.notes) {
      const entry = await this.claim("page", this.profile.pages, "file:" + note.file.path, note.title,
        folders.get(parentPath(note.file.path)), catalog);
      ids.set(note.file.path, entry.id);
    }
    let changed = 0;
    for (const note of tree.notes) {
      const entry = this.profile.pages["file:" + note.file.path];
      const page = await this.client.page(entry.id);
      confirmParent("page", page, entry, folders.get(parentPath(note.file.path)), note.title, this.client.spaceId);
      if (validateVersion(page, entry)) {
        entry.version = page.version.number;
        entry.bodyHash = entry.pending.bodyHash;
        entry.sourceHash = entry.pending.sourceHash;
        delete entry.pending;
        await this.save();
      }
      const body = resolvedStorage(note, this.app, this.client, ids);
      const bodyHash = await digest(body);
      if (bodyHash === entry.bodyHash) {
        if (entry.sourceHash !== note.sourceHash) {
          entry.sourceHash = note.sourceHash;
          await this.save();
        }
        continue;
      }
      const assets = Array.from(new Map(Array.from(note.assets.values(), asset => [asset.name, asset])).values());
      if (assets.length) {
        const existing = new Map((await this.client.attachments(entry.id)).map(asset => [asset.title, asset]));
        for (const asset of assets) {
          const found = existing.get(asset.name);
          if (!found) await this.client.upload(entry.id, asset);
          else if (found.comment !== asset.hash || found.fileSize !== asset.data.byteLength) {
            throw new Error("An attachment name exists with different content: " + note.title);
          }
        }
      }
      const message = "Confluence Folder Sync " + entry.ticket + " " + bodyHash.slice(0, 24);
      entry.pending = { bodyHash, sourceHash: note.sourceHash, message };
      await this.save();
      const result = await this.client.update(page, body, message);
      if (numericId(result.id) !== entry.id || result.version.number !== page.version.number + 1) {
        throw new Error("Confluence did not confirm the expected update.");
      }
      entry.version = result.version.number;
      entry.bodyHash = bodyHash;
      entry.sourceHash = note.sourceHash;
      delete entry.pending;
      await this.save();
      changed++;
    }
    return changed;
  }
}


function pageTrails(catalog, root) {
  const trails = new Map();
  for (const [id, item] of catalog) {
    if (item.type !== "page" || item.status !== "current") continue;
    const seen = new Set();
    const trail = [];
    let current = item;
    while (current) {
      const currentId = numericId(current.id);
      if (seen.has(currentId)) throw new Error("Confluence returned a cyclic parent hierarchy.");
      seen.add(currentId);
      trail.unshift(current);
      const parent = String(current.parentId);
      if (parent === root) {
        trails.set(id, trail);
        break;
      }
      current = catalog.get(parent);
    }
  }
  return trails;
}

async function checkedBody(client, item, version) {
  const page = await client.page(item.id, version, true);
  if (String(page.id) !== String(item.id) || String(page.spaceId) !== client.spaceId ||
      page.version.number !== (version ?? item.version.number) ||
      (version === undefined && (String(page.parentId) !== String(item.parentId) || page.status !== "current"))) {
    throw new Error("A page changed during this run. Run the command again.");
  }
  const value = page.body?.storage?.value;
  if (typeof value !== "string") throw new Error("Confluence did not return the page's storage body.");
  return value;
}

function readableComponent(item) {
  let title = normalized(item.title).replace(/[\\/:*?"<>|#^[\]\x00-\x1f]/g, "-").replace(/^[. ]+|[. ]+$/g, "");
  title = Array.from(title).slice(0, 45).join("").trim();
  return (title || "Confluence") + " -- " + numericId(item.id);
}

async function makeVaultFolders(vault, target, inbox) {
  if (!pathIn(target, inbox)) throw new Error("The import path is outside the configured import folder.");
  const parts = target.split("/");
  let folder;
  for (const part of parts) {
    folder = folder ? folder + "/" + part : part;
    if (vault.getFolderByPath(folder)) continue;
    if (vault.getAbstractFileByPath(folder)) throw new Error("A file occupies the import folder path: " + folder);
    try {
      await vault.createFolder(folder);
    } catch (error) {
      if (!vault.getFolderByPath(folder)) throw error;
    }
  }
}

function attachmentLinks(client, attachments, pageUrl) {
  const links = new Map();
  for (const file of attachments) {
    let candidate = file.downloadLink || file._links?.download;
    if (typeof candidate === "string" && candidate.startsWith("/download/")) candidate = "/wiki" + candidate;
    const safe = typeof candidate === "string" ? webLink(candidate, client.config.origin) : null;
    const url = safe && new URL(safe).origin === client.config.origin ? safe : pageUrl;
    links.set(file.title, url);
  }
  return links;
}

async function copyRemotePage(vault, client, page, trail, body, destination) {
  const directory = destination + "/" + trail.map(readableComponent).join("/");
  const id = numericId(page.id);
  const version = page.version.number;
  const url = client.pageUrl(id);
  const links = attachmentLinks(client, await client.attachments(id), url);
  const markdown = "# " + markdownText(page.title) + "\n\n[Confluence · version " + version + "](" + url + ")\n\n" +
    fromStorage(body, url, links) + (links.size ? "\n## Confluence attachments\n\n" +
      Array.from(links, ([title, link]) => "- [" + markdownText(title) + "](<" + link + ">)").join("\n") + "\n" : "");
  await makeVaultFolders(vault, directory, client.config.inbox);
  const path = directory + "/v" + version + ".md";
  const existing = vault.getFileByPath(path);
  if (existing && await vault.read(existing) !== markdown) {
    throw new Error("An existing local file has different contents: " + path);
  }
  return existing ?? await vault.create(path, markdown);
}

async function remotePages(client, catalog) {
  const trails = pageTrails(catalog, client.config.folderId);
  const pages = await client.currentPages(Array.from(trails.keys()));
  for (const [id, page] of pages) {
    if (String(page.parentId) !== String(trails.get(id).at(-1).parentId)) {
      throw new Error("A page moved during this run. Run the command again.");
    }
  }
  return { trails, pages };
}

async function downloadSnapshot(vault, client, remote, selectedId) {
  const copies = [];
  const selection = selectedId ? [[selectedId, remote.pages.get(selectedId)]] : Array.from(remote.pages);
  if (selection.some(([, page]) => !page)) throw new Error("The selected page is unavailable in this folder.");
  if (!selection.length) throw new Error("The selected folder contains no pages.");
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = client.config.inbox + "/Snapshots/" + date + " " + crypto.randomUUID().slice(0, 8);
  try {
    for (const [id, page] of selection) {
      const body = await checkedBody(client, page);
      copies.push(await copyRemotePage(vault, client, page, remote.trails.get(id), body, destination));
    }
  } catch (error) {
    const saved = copies.length ? " " + copies.length + " saved under " + destination + "." : "";
    throw new Error("Snapshot stopped. " + error.message + saved);
  }
  const summary = copies.length + " current " + (copies.length === 1 ? "copy saved" : "copies saved");
  if (copies.length === 1) return { file: copies[0], summary };
  const links = copies.map(file => {
    const route = file.path.slice(destination.length + 1);
    return "- [" + markdownText(parentPath(route).split("/").at(-1)) + "](<" + encodeURI(route).replace(/#/g, "%23") + ">)";
  });
  const file = await vault.create(destination + "/Snapshot index.md",
    "# Confluence snapshot\n\n" + summary + "\n\n" + links.join("\n") + "\n");
  return { file, summary };
}

async function incoming(app, client, catalog, profile, save, importNew) {
  const { trails, pages } = await remotePages(client, catalog);
  const linked = new Map(Object.entries(profile.pages).filter(([, entry]) => entry.id).map(([key, entry]) =>
    [entry.id, { ...entry, path: key.slice(5) }]));
  const changes = [];
  let newCount = 0;
  let changedCount = 0;
  let importedCount = 0;
  for (const [id, page] of pages) {
    const local = linked.get(id) ?? profile.imports[id];
    const label = "[" + markdownText(page.title) + "](" + client.pageUrl(id) + ")";
    if (!local) {
      newCount++;
      if (importNew) {
        const body = await checkedBody(client, page);
        const file = await copyRemotePage(app.vault, client, page, trails.get(id), body,
          client.config.inbox + "/Imported pages");
        profile.imports[id] = { path: file.path, version: page.version.number, title: page.title,
          parent: String(page.parentId) };
        await save();
        importedCount++;
      }
      changes.push("- New · " + label);
      continue;
    }
    const version = page.version.number;
    const moved = String(page.parentId) !== local.parent;
    const renamed = page.title !== local.title;
    if (version === local.version && !moved && !renamed) continue;
    changedCount++;
    if (importNew) continue;
    const details = ["### " + label, "- Confluence version " + local.version + " → " + version,
      "- Local path: " + markdownText(local.path)];
    const file = app.vault.getFileByPath(local.path);
    const localText = file ? await app.vault.read(file) : null;
    const both = linked.has(id) && localText !== null && local.sourceHash && await digest(localText) !== local.sourceHash;
    if (both) details.push("- Both the local note and the Confluence page changed.");
    if (moved) details.push("- The Confluence parent changed.");
    if (renamed) details.push("- The Confluence title changed.");
    if (version !== local.version) {
      const url = client.pageUrl(id);
      const latest = fromStorage(await checkedBody(client, page), url);
      try {
        details.push(lineChange(fromStorage(await checkedBody(client, page, local.version), url), latest));
      } catch (error) {
        if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
        details.push("The previous version cannot be read.", codeFence(latest, "markdown"));
      }
      if (both) details.push("Current local text compared with Confluence:", lineChange(localText, latest));
    }
    changes.push(details.join("\n\n"));
  }

  const missing = new Set([...linked.keys(), ...Object.keys(profile.imports)]);
  for (const id of pages.keys()) missing.delete(id);
  for (const id of missing) changes.push("- Outside the selected hierarchy or unavailable · " + client.pageUrl(id));
  const summary = newCount + " new · " + changedCount + " changed · " + importedCount +
    " imported · " + missing.size + " unavailable";
  const title = importNew ? "Confluence import report" : "Confluence change preview";
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  const path = client.config.inbox + "/" + title + " " + date + " " + crypto.randomUUID().slice(0, 8) + ".md";
  const instructions = importNew ?
    "New pages are saved under Imported pages. Attachment links open in Confluence." :
    "Review the differences and copy the changes you want to incorporate into the original note.";
  await makeVaultFolders(app.vault, client.config.inbox, client.config.inbox);
  const file = await app.vault.create(path, "# " + title + "\n\n" + summary + "\n\n" + instructions +
    (changes.length ? "\n\n" + changes.join("\n\n") : "") + "\n");
  return { file, summary };
}

class SyncDashboard extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.pages = [];
    this.versions = [];
    this.status = "Load pages to view their Confluence versions.";
  }

  onOpen() {
    this.opened = true;
    this.contentEl.addClass("cfs-dashboard");
    this.render();
  }

  onClose() {
    this.opened = false;
    this.contentEl.empty();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Confluence Folder Sync" });
    contentEl.createEl("p", { text: this.status, attr: { role: "status", "aria-live": "polite" } });
    const button = (label, callback, disabled = false) => component =>
      component.setButtonText(label).setDisabled(this.busy || disabled).onClick(callback);
    const command = action => () => {
      this.close();
      void this.plugin.run(action);
    };
    new Setting(contentEl).setName("Check and sync")
      .addButton(button("Preview changes", command("preview")))
      .addButton(button("Import new pages", command("import")))
      .addButton(button("Publish folder", command("publish"), !this.plugin.data.settings.allowPublish));
    new Setting(contentEl).setName("Download the full folder")
      .setDesc("Save every current page as a new snapshot under the import folder.")
      .addButton(button("Download snapshot", () => this.saveSnapshot()));
    new Setting(contentEl).setName("Page versions")
      .addButton(button("Load pages", () => this.loadPages()));

    if (!this.pages.length) return;
    const selectPage = new Setting(contentEl).setName("Confluence page");
    selectPage.addDropdown(dropdown => {
      this.pageDropdown = dropdown;
      dropdown.setDisabled(this.busy);
      this.filterPages(this.filter ?? "");
      dropdown.onChange(value => {
        this.pageId = value;
        this.versions = [];
        this.difference = null;
        this.render();
      });
    });
    new Setting(contentEl).setName("Filter pages")
      .addText(input => input.setValue(this.filter ?? "").setPlaceholder("Title or folder")
        .setDisabled(this.busy).onChange(value => this.filterPages(value)));
    new Setting(contentEl).setName("Selected page")
      .addButton(button("Load versions", () => this.loadVersions(), !this.pageId))
      .addButton(button("Download latest copy", () => this.saveSnapshot(this.pageId), !this.pageId));
    if (this.versions.length > 1) {
      const version = (field, name) => dropdown => {
        dropdown.setDisabled(this.busy);
        dropdown.selectEl.setAttribute("aria-label", name);
        for (const entry of this.versions) {
          const date = entry.createdAt ? " · " + entry.createdAt.slice(0, 10) : "";
          dropdown.addOption(String(entry.number), "v" + entry.number + date);
        }
        dropdown.setValue(String(this[field])).onChange(value => { this[field] = Number(value); });
      };
      new Setting(contentEl).setName("Compare versions")
        .addDropdown(version("before", "Base version"))
        .addDropdown(version("after", "Comparison version"))
        .addButton(button("Compare", () => this.compareVersions()));
    }
    if (this.difference) {
      contentEl.createEl("h3", { text: this.difference.title });
      const diff = contentEl.createEl("pre", { cls: "cfs-diff", attr: { tabindex: "0", "aria-label": "Version differences" } });
      for (const line of this.difference.text.split("\n")) {
        const cls = line.startsWith("+") ? "cfs-added" : line.startsWith("-") ? "cfs-removed" : "";
        diff.createSpan({ text: line + "\n", cls });
      }
    }
  }

  filterPages(text) {
    this.filter = text;
    const term = normalized(text.trim()).toLowerCase();
    const dropdown = this.pageDropdown;
    dropdown.selectEl.replaceChildren();
    dropdown.addOption("", "Choose a page");
    for (const page of this.pages) {
      if (normalized(page.label).toLowerCase().includes(term) || page.id === this.pageId) {
        dropdown.addOption(page.id, page.label);
      }
    }
    dropdown.setValue(this.pageId ?? "");
  }

  async perform(message, task) {
    if (this.busy) return;
    this.busy = true;
    this.status = message;
    this.render();
    try {
      await this.plugin.withConnection(task);
    } catch (error) {
      this.status = error instanceof Error ? error.message : "The Confluence action failed.";
    } finally {
      this.busy = false;
      if (this.opened) this.render();
    }
  }

  loadPages() {
    return this.perform("Loading Confluence pages…", async ({ client, folder }) => {
      const remote = await remotePages(client, await client.catalog());
      this.pages = Array.from(remote.trails, ([id, trail]) => ({
        id, label: trail.map(node => node.title).join(" / "),
      })).sort((a, b) => a.label.localeCompare(b.label));
      if (!remote.pages.has(this.pageId)) {
        this.pageId = "";
        this.versions = [];
        this.difference = null;
      }
      this.status = folder.title + " · " + this.pages.length + " pages";
    });
  }

  selected(message, task) {
    const id = this.pageId;
    return this.perform(message, async ({ client }) => {
      const remote = await remotePages(client, await client.catalog());
      const page = remote.pages.get(id);
      if (!page) throw new Error("The selected page is no longer in this Confluence folder.");
      await task(client, page);
    });
  }

  loadVersions() {
    return this.selected("Loading page versions…", async (client, page) => {
      const current = page.version;
      const versions = new Map([[current.number, current]]);
      for (const entry of await client.pageVersions(page.id)) {
        if (Number.isInteger(entry.number) && entry.number > 0) versions.set(entry.number, entry);
      }
      this.versions = Array.from(versions.values()).sort((a, b) => b.number - a.number);
      this.after = this.versions[0].number;
      this.before = this.versions[1]?.number;
      this.difference = null;
      this.status = page.title + " · " + this.versions.length + " available versions";
    });
  }

  compareVersions() {
    const before = this.before;
    const after = this.after;
    return this.selected("Comparing page versions…", async (client, page) => {
      if (before === after) throw new Error("Choose two different versions.");
      const url = client.pageUrl(page.id);
      const [oldBody, newBody] = await Promise.all([checkedBody(client, page, before), checkedBody(client, page, after)]);
      const diff = diffLines(fromStorage(oldBody, url), fromStorage(newBody, url));
      this.difference = { title: page.title + " · v" + before + " → v" + after,
        text: diff || "No converted Markdown body difference." };
      this.status = "Version comparison complete.";
    });
  }

  saveSnapshot(id) {
    return this.perform("Preparing the current Confluence snapshot…", async ({ client, folder }) => {
      const remote = await remotePages(client, await client.catalog());
      if (!this.opened) return;
      if (!id) {
        if (!remote.pages.size) throw new Error("The selected folder contains no pages.");
        const approved = await this.plugin.confirm(
          "Download Confluence snapshot",
          "Save the current versions of " + remote.pages.size + " pages from " + folder.title +
          " in a new snapshot under " + client.config.inbox + "?",
          "Download snapshot",
        );
        if (!approved || !this.opened) {
          this.status = "Snapshot cancelled.";
          return;
        }
      }
      const result = await downloadSnapshot(this.app.vault, client, remote, id);
      this.status = result.summary;
      await this.app.workspace.getLeaf("tab").openFile(result.file);
      if (this.opened) this.close();
      new Notice(result.summary);
    });
  }
}

const DEFAULT_SETTINGS = {
  folderUrl: "", source: "Confluence source", inbox: "Confluence inbox",
  email: "", secretId: "", allowPublish: false,
};

class Confirmation extends Modal {
  constructor(app, title, summary, buttonLabel, accept) {
    super(app);
    this.title = title;
    this.summary = summary;
    this.buttonLabel = buttonLabel;
    this.accept = accept;
    this.confirmed = false;
  }

  onOpen() {
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { text: this.summary });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton(button => button.setButtonText(this.buttonLabel).setCta().onClick(() => {
        this.confirmed = true;
        this.close();
      }));
  }

  onClose() {
    this.contentEl.empty();
    this.accept(this.confirmed);
  }
}

class SyncSettings extends PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl, plugin } = this;
    containerEl.empty();
    const settings = plugin.data.settings;
    const text = (name, description, property, placeholder) => {
      new Setting(containerEl).setName(name).setDesc(description).addText(field => {
        field.setValue(settings[property]).setPlaceholder(placeholder).onChange(value => plugin.configure(property, value));
      });
    };
    text("Confluence folder URL", "Copy the URL of a folder from the Confluence sidebar.", "folderUrl", "https://example.atlassian.net/wiki/spaces/DOC/folder/1234");
    text("Atlassian email", "Use the account that issued the Confluence Cloud token.", "email", "name@example.com");
    new Setting(containerEl).setName("Confluence API token").setDesc("Select a scoped Atlassian API token stored in Obsidian.")
      .addComponent(el => new SecretComponent(plugin.app, el).setValue(settings.secretId)
        .onChange(value => plugin.configure("secretId", value ?? "")));
    text("Source vault folder", "Publish only notes and referenced files from this folder.", "source", "Project");
    text("Import vault folder", "Save previews and imported copies in a separate folder.", "inbox", "Confluence inbox");
    new Setting(containerEl).setName("Enable publish").setDesc("Allow explicit, confirmed uploads from this vault.")
      .addToggle(toggle => toggle.setValue(settings.allowPublish).onChange(value => plugin.configure("allowPublish", value)));
    new Setting(containerEl).setName("Connection").addButton(button => button.setButtonText("Test connection")
      .onClick(() => plugin.run("connect")));
  }
}

class ConfluenceFolderSync extends Plugin {
  async onload() {
    const stored = await this.loadData() ?? {};
    this.data = { settings: { ...DEFAULT_SETTINGS, ...stored.settings }, profiles: stored.profiles ?? {} };
    this.saving = Promise.resolve();
    this.addSettingTab(new SyncSettings(this));
    const openDashboard = () => new SyncDashboard(this).open();
    this.addRibbonIcon("arrow-right-left", "Open Confluence sync dashboard", openDashboard);
    this.addCommand({ id: "dashboard", name: "Open sync dashboard", callback: openDashboard });
    this.addCommand({ id: "publish", name: "Publish vault folder to Confluence", callback: () => this.run("publish") });
    this.addCommand({ id: "preview", name: "Preview Confluence changes", callback: () => this.run("preview") });
    this.addCommand({ id: "import", name: "Import new Confluence pages", callback: () => this.run("import") });
  }

  persist() {
    const snapshot = structuredClone(this.data);
    const saved = this.saving.catch(() => {}).then(() => this.saveData(snapshot));
    this.saving = saved;
    return saved;
  }

  async configure(key, value) {
    this.data.settings[key] = value;
    try {
      await this.persist();
    } catch {
      new Notice("Confluence Folder Sync could not save the settings.");
    }
  }

  confirm(title, summary, button) {
    return new Promise(resolve => new Confirmation(this.app, title, summary, button, resolve).open());
  }

  async withConnection(task) {
    if (this.running) throw new Error("A Confluence command is already running in this vault.");
    this.running = true;
    try {
      await this.saving;
      const config = validatedConfig(this.data.settings);
      const token = this.app.secretStorage.getSecret(config.secretId);
      if (!token) throw new Error("Choose a valid token in the plugin settings.");
      const client = new ConfluenceCloud(config, token);
      const folder = await client.connect();
      const key = JSON.stringify([config.origin, config.folderId, config.source]);
      const profile = this.data.profiles[key] ??= { folders: {}, pages: {}, imports: {} };
      return await task({ client, folder, config, profile, save: () => this.persist() });
    } finally {
      this.running = false;
    }
  }

  async run(action) {
    const progress = new Notice("Connecting to Confluence…", 0);
    try {
      await this.withConnection(async ({ client, folder, config, profile, save }) => {
        if (action === "connect") {
          new Notice("Connected to Confluence folder " + folder.title + " (" + config.folderId + ").");
          return;
        }
        if (action === "publish" && !config.allowPublish) {
          throw new Error("Enable publishing in the plugin settings first.");
        }
        const catalog = await client.catalog();
        if (action !== "publish") {
          const result = await incoming(this.app, client, catalog, profile, save, action === "import");
          await this.app.workspace.getLeaf("tab").openFile(result.file);
          new Notice(result.summary);
          return;
        }
        const tree = await preparedNotes(this.app, config);
        if (!tree.notes.length) throw new Error("The selected folder contains no Markdown notes.");
        const publisher = new Publisher(client, this.app, profile, save);
        await publisher.plan(tree, catalog);
        progress.hide();
        const approved = await this.confirm("Publish to Confluence",
          "Publish " + tree.notes.length + " notes from " + config.source + " to " +
          new URL(config.origin).hostname + " / " + folder.title + " (folder " + config.folderId + ").",
          "Publish");
        if (!approved) return;
        const status = new Notice("Publishing to Confluence…", 0);
        try {
          const updated = await publisher.publish(tree, catalog);
          new Notice("Confluence: " + updated + " updated, " + (tree.notes.length - updated) + " unchanged.");
        } finally {
          status.hide();
        }
      });
    } catch (error) {
      const message = error instanceof ApiError || error instanceof Error ? error.message : "The operation failed.";
      new Notice("Confluence Folder Sync: " + message, 12000);
    } finally {
      progress.hide();
    }
  }
}

module.exports = ConfluenceFolderSync;
