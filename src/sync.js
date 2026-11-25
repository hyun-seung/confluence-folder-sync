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
    if (titles.has(title.toLowerCase())) throw new SyncError("Duplicate page title in the source folder: {title}", { title });
    if (title.length > 255) throw new SyncError("A source title exceeds the Confluence maximum: {title}", { title: title.slice(0, 100) });
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
        if (target.file.stat.size > MAX_ATTACHMENT_BYTES) {
          throw new SyncError("An attachment exceeds this plugin's 25 MiB limit: {name}", { name: target.file.name });
        }
        const data = await app.vault.readBinary(target.file);
        const hash = await digest(data);
        const safeName = target.file.name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-100);
        asset = { data, hash, name: "cfs-" + hash.slice(0, 24) + "-" + safeName };
        binaries.set(target.file.path, asset);
      }
      assets.set(target.file.path, asset);
    }
    const sourceHash = await digest(source);
    const assetHashes = Array.from(assets, ([path, asset]) => [path, asset.hash])
      .sort(([left], [right]) => left.localeCompare(right));
    const inputHash = await digest(JSON.stringify([sourceHash, assetHashes]));
    notes.push({ file, title, units, assets, sourceHash, inputHash });
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
    throw new SyncError("Confluence {kind} changed position, name or status: {title}", { kind, title });
  }
  return id;
}

function validateVersion(remote, entry) {
  const version = remote.version.number;
  if (version === entry.version) return false;
  if (entry.pending && version === entry.version + 1 && remote.version.message === entry.pending.message) return true;
  throw new SyncError("Confluence page has an independent edit: {title}. Run Preview Confluence changes.", { title: remote.title });
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
      if (!parent || !catalog.has(recorded.id)) throw new SyncError("A mapped item is outside the configured folder: {title}", { title });
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
      if (recorded?.creating) throw new SyncError("The previous create result is unknown: {title}", { title });
      return null;
    }
    if (kind === "page" && recorded?.creating && matches.length === 1 && parent) {
      const candidate = await this.client.page(matches[0].id, undefined, true);
      if (candidate.version.number === 1 && candidate.body.storage.value.trim() === placeholder(recorded)) {
        confirmParent(kind, candidate, recorded, parent, title, this.client.spaceId);
        return candidate;
      }
    }
    throw new SyncError("An existing Confluence item is not linked to this source: {title}", { title });
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
        delete entry.migratedInputHash;
        await this.save();
      }
      if (entry.migratedInputHash === note.inputHash) continue;
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
            throw new SyncError("An attachment name exists with different content: {title}", { title: note.title });
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
      if (!entry.remoteAttachments || assets.length) {
        const inventory = attachmentInventory(await this.client.attachments(entry.id));
        if (!entry.remoteAttachments) {
          entry.remoteAttachments = inventory;
        } else {
          const managed = new Set(assets.map(asset => asset.name));
          const merged = new Map(entry.remoteAttachments.map(asset => [asset.id, asset]));
          for (const asset of inventory) if (managed.has(asset.title)) merged.set(asset.id, asset);
          entry.remoteAttachments = Array.from(merged.values());
        }
      }
      entry.version = result.version.number;
      entry.bodyHash = bodyHash;
      entry.sourceHash = note.sourceHash;
      delete entry.pending;
      delete entry.migratedInputHash;
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
    if (vault.getAbstractFileByPath(folder)) throw new SyncError("A file occupies the import folder path: {path}", { path: folder });
    try {
      await vault.createFolder(folder);
    } catch (error) {
      if (!vault.getFolderByPath(folder)) throw error;
    }
  }
}

function attachmentName(entry) {
  const name = normalized(entry.title).replace(/[\\/:*?"<>|#^[\]\x00-\x1f]/g, "-").trim();
  return entry.id + "-v" + entry.version + "-" + (Array.from(name).slice(-100).join("").replace(/[. ]+$/g, "") || "attachment");
}

async function copyRemotePage(vault, client, page, trail, body, destination) {
  const directory = destination + "/" + trail.map(readableComponent).join("/");
  const id = numericId(page.id);
  const version = page.version.number;
  const url = client.pageUrl(id);
  const attachments = await client.attachments(id);
  const inventory = attachmentInventory(attachments);
  const seen = new Set();
  if (inventory.some(asset => asset.size > MAX_ATTACHMENT_BYTES)) {
    throw new SyncError("A Confluence attachment exceeds the 25 MiB limit for {title}.", { title: page.title });
  }
  await makeVaultFolders(vault, directory, client.config.inbox);
  if (attachments.length) await makeVaultFolders(vault, directory + "/Attachments", client.config.inbox);
  const links = new Map();
  for (const attachment of attachments) {
    const entry = attachmentEntry(attachment);
    if (seen.has(entry.title)) throw new Error("Confluence returned duplicate attachment names.");
    seen.add(entry.title);
    const name = attachmentName(entry);
    const path = directory + "/Attachments/" + name;
    const data = await client.downloadAttachment(id, attachment);
    const prior = vault.getFileByPath(path);
    if (!prior) await vault.createBinary(path, data);
    else if (await digest(await vault.readBinary(prior)) !== await digest(data)) {
      throw new SyncError("An existing local attachment has different content: {name}", { name });
    }
    links.set(entry.title, { path: "Attachments/" + encodeURIComponent(name), image: IMAGE_FILE.test(entry.title) });
  }
  const markdown = "# " + markdownText(page.title) + "\n\n[Confluence · version " + version + "](" + url + ")\n\n" +
    fromStorage(body, url, links) + (links.size ? "\n## Confluence attachments\n\n" +
      Array.from(links, ([title, link]) => "- [" + markdownText(title) + "](<" + link.path + ">)").join("\n") + "\n" : "");
  const path = directory + "/v" + version + ".md";
  const existing = vault.getFileByPath(path);
  if (existing && await vault.read(existing) !== markdown) {
    throw new SyncError("An existing local file has different contents: {path}", { path });
  }
  const file = existing ?? await vault.create(path, markdown);
  return { file, inventory };
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
  const language = client.config.language ?? "en";
  const t = (message, values) => translate(language, message, values);
  const copies = [];
  const selection = selectedId ? [[selectedId, remote.pages.get(selectedId)]] : Array.from(remote.pages);
  if (selection.some(([, page]) => !page)) throw new Error("The selected page is unavailable in this folder.");
  if (!selection.length) throw new Error("The selected folder contains no pages.");
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = client.config.inbox + "/Snapshots/" + date + " " + crypto.randomUUID().slice(0, 8);
  try {
    for (const [id, page] of selection) {
      const body = await checkedBody(client, page);
      const copy = await copyRemotePage(vault, client, page, remote.trails.get(id), body, destination);
      copies.push(copy.file);
    }
  } catch (error) {
    throw new SyncError("Snapshot stopped after {count} copies. {reason} Check {path} for saved files.",
      { count: copies.length, reason: localizedError(error, language), path: destination });
  }
  const summary = t("{count} current copies saved", { count: copies.length });
  if (copies.length === 1) return { file: copies[0], summary };
  const links = copies.map(file => {
    const route = file.path.slice(destination.length + 1);
    return "- [" + markdownText(parentPath(route).split("/").at(-1)) + "](<" + encodeURI(route).replace(/#/g, "%23") + ">)";
  });
  const file = await vault.create(destination + "/Snapshot index.md",
    "# " + t("Confluence snapshot") + "\n\n" + summary + "\n\n" + links.join("\n") + "\n");
  return { file, summary };
}

async function incoming(app, client, catalog, profile, save, importNew) {
  const language = client.config.language ?? "en";
  const t = (message, values) => translate(language, message, values);
  const { trails, pages } = await remotePages(client, catalog);
  const linked = new Map(Object.entries(profile.pages).filter(([, entry]) => entry.id).map(([key, entry]) =>
    [entry.id, { ...entry, path: key.slice(5) }]));
  const changes = [];
  let newCount = 0;
  let changedCount = 0;
  let importedCount = 0;
  let baselines = 0;
  const remoteAttachments = new Map();
  if (!importNew) {
    const trackedIds = Array.from(pages.keys()).filter(id => linked.has(id) || profile.imports[id]);
    for (let start = 0; start < trackedIds.length; start += 4) {
      const batch = trackedIds.slice(start, start + 4);
      await Promise.all(batch.map(async id => {
        remoteAttachments.set(id, attachmentInventory(await client.attachments(id)));
      }));
    }
  }
  for (const [id, page] of pages) {
    const local = linked.get(id) ?? profile.imports[id];
    const label = "[" + markdownText(page.title) + "](" + client.pageUrl(id) + ")";
    if (!local) {
      newCount++;
      if (importNew) {
        const body = await checkedBody(client, page);
        const copy = await copyRemotePage(app.vault, client, page, trails.get(id), body,
          client.config.inbox + "/Imported pages");
        profile.imports[id] = { path: copy.file.path, version: page.version.number, title: page.title,
          parent: String(page.parentId), remoteAttachments: copy.inventory };
        await save();
        importedCount++;
      }
      changes.push("- " + t("New") + " · " + label);
      continue;
    }
    const version = page.version.number;
    const moved = String(page.parentId) !== local.parent;
    const renamed = page.title !== local.title;
    const inventory = remoteAttachments.get(id);
    let fileChanges = [];
    if (inventory) {
      if (local.remoteAttachments) {
        fileChanges = attachmentDiff(local.remoteAttachments, inventory);
      } else {
        const entry = linked.has(id) ? profile.pages["file:" + local.path] : profile.imports[id];
        entry.remoteAttachments = inventory;
        baselines++;
      }
    }
    if (version === local.version && !moved && !renamed && !fileChanges.length) continue;
    changedCount++;
    if (importNew) continue;
    const details = ["### " + label, "- " + t("Confluence version {before} → {after}", { before: local.version, after: version }),
      "- " + t("Local path: {path}", { path: markdownText(local.path) })];
    const file = app.vault.getFileByPath(local.path);
    const localText = file ? await app.vault.read(file) : null;
    const both = linked.has(id) && localText !== null && local.sourceHash && await digest(localText) !== local.sourceHash;
    if (both) details.push("- " + t("Both the local note and the Confluence page changed."));
    if (moved) details.push("- " + t("The Confluence parent changed."));
    if (renamed) details.push("- " + t("The Confluence title changed."));
    for (const file of fileChanges) {
      const versionLabel = file.before ? "v" + file.before + " → v" + file.version : "v" + file.version;
      details.push("- " + t("Attachment " + file.kind.toLowerCase()) + " · " + markdownText(file.title) + " · " + versionLabel);
    }
    if (version !== local.version) {
      const url = client.pageUrl(id);
      const latest = fromStorage(await checkedBody(client, page), url);
      try {
        details.push(lineChange(fromStorage(await checkedBody(client, page, local.version), url), latest, language));
      } catch (error) {
        if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
        details.push(t("The previous version cannot be read."), codeFence(latest, "markdown"));
      }
      if (both) details.push(t("Current local text compared with Confluence:"), lineChange(localText, latest, language));
    }
    changes.push(details.join("\n\n"));
  }

  const missing = new Set([...linked.keys(), ...Object.keys(profile.imports)]);
  for (const id of pages.keys()) missing.delete(id);
  for (const id of missing) changes.push("- " + t("Outside the selected hierarchy or unavailable") + " · " + client.pageUrl(id));
  const summary = t("{new} new · {changed} changed · {imported} imported · {missing} unavailable",
    { new: newCount, changed: changedCount, imported: importedCount, missing: missing.size });
  const title = importNew ? "Confluence import report" : "Confluence change preview";
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  const path = client.config.inbox + "/" + title + " " + date + " " + crypto.randomUUID().slice(0, 8) + ".md";
  const instructions = importNew ?
    "New pages and their attachments are saved under Imported pages." :
    "Review the differences and copy the changes you want to incorporate into the original note.";
  if (baselines) {
    await save();
    changes.unshift(t("Recorded current attachment versions for {count} previously tracked pages.", { count: baselines }));
  }
  await makeVaultFolders(app.vault, client.config.inbox, client.config.inbox);
  const file = await app.vault.create(path, "# " + t(title) + "\n\n" + summary + "\n\n" + t(instructions) +
    (changes.length ? "\n\n" + changes.join("\n\n") : "") + "\n");
  return { file, summary };
}

