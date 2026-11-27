// Management changes local metadata only. Publication remains a separate review.
function mappingProfileKey(key) {
  try {
    const parts = JSON.parse(key);
    if (Array.isArray(parts) && parts.length === 3 && parts.every(value => typeof value === "string")) return parts;
  } catch { /* Ignore legacy or invalid profile keys. */ }
  return null;
}

function mappingInterrupted(entry) {
  return Boolean(entry?.creating || entry?.pending || Object.keys(entry?.uploadIntents ?? {}).length);
}

async function mappingInventory(app, client, profile) {
  const tree = await preparedNotes(app, client.config, () => client.check?.());
  const catalog = await client.catalog();
  const visible = pageTrails(catalog, client.config.folderId);
  const paths = new Set(tree.notes.map(note => note.path));
  for (const key of Object.keys(profile.pages)) {
    if (key.startsWith("file:" + client.config.source + "/")) paths.add(key.slice(5));
  }
  const ids = Object.values(profile.pages).map(entry => entry.id).filter(Boolean);
  const rows = Array.from(paths).sort().map(path => {
    const entry = profile.pages["file:" + path];
    const local = tree.notes.some(note => note.path === path);
    const conflict = profile.renameConflicts?.some(item => pathIn(path, item.from) || pathIn(path, item.to)) ||
      (entry?.id && ids.filter(id => id === entry.id).length > 1);
    const status = conflict ? "Mapping conflict" : !local ? "Local file missing" : !entry ? "Unlinked" :
      mappingInterrupted(entry) ? "Interrupted publication" : !visible.has(entry.id) ? "Unavailable" : "Linked";
    return { path, id: entry?.id ?? "", status };
  });
  return { rows, pages: Array.from(visible, ([id, trail]) => ({ id,
    label: trail.map(item => item.title).join(" / ") })).sort((a, b) => a.label.localeCompare(b.label)) };
}

function mappingOwners(profiles, config, id) {
  return Object.entries(profiles).flatMap(([key, profile]) => {
    const parts = mappingProfileKey(key);
    if (!parts || parts[0] !== config.origin) return [];
    return Object.entries(profile.pages ?? {}).filter(([, entry]) => entry.id === id)
      .map(([path]) => ({ target: key, path }));
  });
}

async function prepareMappingChange(app, client, data, request) {
  const config = client.config;
  const target = publicationTarget(config);
  const profile = data.profiles[target];
  if (!profile) throw new Error("Refresh the connection management screen.");
  const state = await digest(JSON.stringify(data.profiles));
  const next = structuredClone(data.profiles);
  const destination = next[target];
  const tree = await preparedNotes(app, config, () => client.check?.());
  const catalog = await client.catalog();
  const trails = pageTrails(catalog, config.folderId);
  const locals = [];
  const remotes = [];
  const changes = [];
  const noteAt = path => {
    const note = tree.notes.find(item => item.path === path);
    if (!note || note.problem || !editorMatches(app, path, note.original)) {
      throw new Error("Save a valid note inside the active source folder before reconnecting.");
    }
    guardMappedPath(profile, path);
    locals.push({ path, sourceHash: note.sourceHash, inputHash: note.inputHash });
    return note;
  };
  const pageAt = async id => {
    id = numericId(id);
    const listed = catalog.get(id);
    if (!trails.has(id) || !listed) throw new Error("The selected page is unavailable in this folder.");
    const page = await client.page(id, undefined, true);
    confirmParent("page", page, { id }, String(listed.parentId), normalized(listed.title), client.spaceId);
    const body = page.body?.storage?.value;
    if (typeof body !== "string") throw new Error("Confluence did not return the page's storage body.");
    const files = await client.attachments(id);
    const bodyHash = await digest(body);
    remotes.push({ id, title: page.title, parent: String(page.parentId), version: page.version.number,
      message: page.version.message ?? "", bodyHash, inventory: attachmentInventory(files) });
    return { page, body, bodyHash, files, inventory: attachmentInventory(files) };
  };
  const folderAt = async path => {
    let parent = config.folderId;
    for (const folder of ancestors(path, config.source)) {
      const key = "dir:" + folder;
      const title = normalized(folder.split("/").at(-1));
      const entry = destination.folders[key];
      const matches = Array.from(catalog.values()).filter(item => item.type === "folder" &&
        item.status === "current" && String(item.parentId) === parent && normalized(item.title) === title);
      if (matches.length !== 1 || (entry && entry.id !== String(matches[0].id))) {
        throw new Error("The matching Confluence folder hierarchy is missing or ambiguous.");
      }
      const remote = await client.get(API + "/folders/" + numericId(matches[0].id));
      confirmParent("folder", remote, entry, parent, title, client.spaceId);
      remotes.push({ folder: String(remote.id), parent, title });
      destination.folders[key] ??= { id: String(remote.id), ticket: "reconnected-" + remote.id };
      parent = String(remote.id);
    }
    return parent;
  };
  if (request.action === "reconnect") {
    const note = noteAt(request.path);
    const key = "file:" + note.path;
    if (destination.pages[key]) throw new Error("The destination note already has a mapping.");
    const oldKey = request.from ? "file:" + request.from : null;
    const prior = oldKey ? profile.pages[oldKey] : null;
    if (oldKey && (!pathIn(request.from, config.source) || !prior || app.vault.getFileByPath(request.from))) {
      throw new Error("Choose a missing local mapping as the previous link.");
    }
    const remote = await pageAt(request.id);
    if (mappingOwners(data.profiles, config, request.id).some(owner => owner.target !== target || owner.path !== oldKey)) {
      throw new Error("The page is already linked to another note or source profile.");
    }
    if (prior) {
      if (prior.id !== request.id || mappingInterrupted(prior) || prior.renamedFrom || !prior.bodyHash ||
          prior.version !== remote.page.version.number || prior.bodyHash !== remote.bodyHash ||
          prior.title !== remote.page.title || prior.parent !== String(remote.page.parentId) ||
          prior.sourceHash !== note.sourceHash || (prior.inputHash ?? prior.migratedInputHash) !== note.inputHash || !prior.remoteAttachments ||
          attachmentDiff(prior.remoteAttachments, remote.inventory).length) {
        throw new Error("The previous link or its contents changed. Resolve the differences before reconnecting.");
      }
      delete destination.pages[oldKey];
      destination.pages[key] = { ...structuredClone(prior), renamedFrom: request.from, requiresReview: true };
      changes.push(request.from + " → " + note.path + " · " + request.id);
    } else {
      const parent = await folderAt(note.path);
      const ids = new Map(Object.entries(profile.pages).filter(([, entry]) => entry.id)
        .map(([path, entry]) => [path.slice(5), entry.id]));
      ids.set(note.path, request.id);
      if (note.dependencies.some(path => !ids.has(path)) || remote.page.title !== note.title ||
          String(remote.page.parentId) !== parent || resolvedStorage(note, app, client, ids) !== remote.body ||
          Array.from(note.assets.values()).some(asset => !remote.files.some(file => file.title === asset.name &&
            file.comment === asset.hash && file.fileSize === asset.data.byteLength))) {
        throw new Error("The note and existing page do not match. Download a copy and reconcile them first.");
      }
      destination.pages[key] = { id: request.id, ticket: "reconnected-" + request.id,
        version: remote.page.version.number, title: remote.page.title, parent,
        bodyHash: remote.bodyHash, sourceHash: note.sourceHash, inputHash: note.inputHash,
        remoteAttachments: remote.inventory, requiresReview: true };
      changes.push(note.path + " ↔ " + request.id);
    }
  } else if (request.action === "recover") {
    const note = noteAt(request.path);
    const key = "file:" + note.path;
    const entry = destination.pages[key];
    if (!mappingInterrupted(entry)) throw new Error("This mapping has no interrupted publication.");
    if (!entry.id && entry.creating) {
      const parent = await folderAt(note.path);
      const candidates = await client.pageTitles(note.title);
      if (candidates.length !== 1) throw new Error("The create result cannot be proved. Keep the recovery marker and inspect Confluence.");
      const remote = await pageAt(String(candidates[0].id));
      if (remote.page.version.number !== 1 || remote.body.trim() !== placeholder(entry) ||
          remote.page.title !== note.title || String(remote.page.parentId) !== parent ||
          mappingOwners(data.profiles, config, String(remote.page.id)).length) {
        throw new Error("The create result cannot be proved. Keep the recovery marker and inspect Confluence.");
      }
      Object.assign(entry, { id: String(remote.page.id), version: 1, title: note.title, parent, requiresReview: true });
      delete entry.creating;
      changes.push(note.path + " ↔ " + entry.id);
    } else {
      const owners = mappingOwners(data.profiles, config, entry.id);
      if (owners.length !== 1 || owners[0].target !== target || owners[0].path !== key) {
        throw new Error("The page is already linked to another note or source profile.");
      }
      const remote = await pageAt(entry.id);
      const pending = entry.pending;
      const completed = pending && remote.page.version.number === entry.version + 1 &&
        remote.page.version.message === pending.message && remote.bodyHash === pending.bodyHash;
      const unchanged = remote.page.version.number === entry.version && remote.bodyHash === entry.bodyHash;
      const title = completed ? pending.title ?? entry.title : entry.title;
      const parent = completed ? pending.parent ?? entry.parent : entry.parent;
      if ((!completed && !unchanged) || remote.page.title !== title || String(remote.page.parentId) !== parent ||
          !entry.remoteAttachments || attachmentsConflict(entry, note, remote.files)) {
        throw new Error("The interrupted result changed independently. Review the conflict before recovery.");
      }
      if (!completed) throw new Error("The page update is not confirmed. Resume it through Review publication; no marker was cleared.");
      entry.version = remote.page.version.number;
      entry.bodyHash = pending.bodyHash;
      entry.sourceHash = pending.sourceHash;
      entry.inputHash = pending.inputHash;
      entry.formatRevision = pending.formatRevision ?? 0;
      entry.title = title;
      entry.parent = parent;
      entry.remoteAttachments = remote.inventory;
      if (pending.preserveMigrated) entry.migratedInputHash = pending.inputHash;
      else delete entry.migratedInputHash;
      delete entry.pending;
      delete entry.uploadIntents;
      delete entry.renamedFrom;
      entry.requiresReview = true;
      changes.push(note.path + " · v" + entry.version);
    }
  } else if (request.action === "migrate") {
    const parts = mappingProfileKey(request.fromTarget);
    const origin = data.profiles[request.fromTarget];
    if (!parts || parts[0] !== config.origin || parts[1] !== config.folderId || parts[2] === config.source ||
        !origin || !Object.keys(origin.pages ?? {}).length || Object.keys(profile.pages).length ||
        Object.keys(profile.folders).length || Object.keys(profile.retiredFolders ?? {}).length ||
        profile.renameConflicts?.length || origin.renameConflicts?.length || Object.keys(origin.retiredFolders ?? {}).length) {
      throw new Error("Choose an established source profile for this destination and an empty current mapping.");
    }
    const oldSource = vaultPath(parts[2]);
    // This action moves ownership; the previous profile remains a read-only tombstone.
    for (const [key, entry] of Object.entries(origin.pages)) {
      if (!key.startsWith("file:" + oldSource + "/") || mappingInterrupted(entry) || entry.renamedFrom) {
        throw new Error("Resolve interrupted publications and moves before migrating the source root.");
      }
      const path = config.source + key.slice(5 + oldSource.length);
      const note = noteAt(path);
      const remote = await pageAt(entry.id);
      const previousInputs = await publicationInputHash(note.sourceHash,
        Array.from(note.assets, ([path, asset]) => [oldSource + path.slice(config.source.length), asset.hash])
          .sort(([left], [right]) => left.localeCompare(right)), note.diagrams);
      if (entry.sourceHash !== note.sourceHash || (entry.migratedInputHash ?? entry.inputHash) !== previousInputs ||
          entry.bodyHash !== remote.bodyHash ||
          entry.version !== remote.page.version.number || entry.title !== remote.page.title ||
          entry.parent !== String(remote.page.parentId) || !entry.remoteAttachments ||
          attachmentDiff(entry.remoteAttachments, remote.inventory).length ||
          mappingOwners(data.profiles, config, entry.id).length !== 1) {
        throw new Error("A migration baseline differs. Resolve it in the previous configuration first.");
      }
      destination.pages["file:" + path] = { ...structuredClone(entry), inputHash: note.inputHash, requiresReview: true };
      if (entry.migratedInputHash) destination.pages["file:" + path].migratedInputHash = note.inputHash;
      changes.push(key.slice(5) + " → " + path + " · " + entry.id);
    }
    for (const [key, entry] of Object.entries(origin.folders ?? {})) {
      if (!key.startsWith("dir:" + oldSource + "/") || !entry.id || entry.creating) {
        throw new Error("Resolve interrupted publications and moves before migrating the source root.");
      }
      const remote = catalog.get(entry.id);
      if (!remote || remote.type !== "folder" || remote.status !== "current") {
        throw new Error("The matching Confluence folder hierarchy is missing or ambiguous.");
      }
      destination.folders["dir:" + config.source + key.slice(4 + oldSource.length)] = structuredClone(entry);
    }
    // Verify every mapped branch against its expected relative hierarchy.
    for (const key of Object.keys(destination.folders)) await folderAt(key.slice(4) + "/check.md");
    for (const note of locals) await folderAt(note.path);
    next[request.fromTarget] = { pages: {}, folders: {}, imports: structuredClone(origin.imports ?? {}), movedTo: target };
    delete destination.movedTo;
  } else throw new Error("Choose a connection management action.");
  // Remote reads can take time: re-read all local inputs after the last await.
  const latest = await preparedNotes(app, config, () => client.check?.());
  for (const local of locals) {
    const note = latest.notes.find(item => item.path === local.path);
    if (!note || note.inputHash !== local.inputHash || !editorMatches(app, local.path, note.original)) {
      throw new Error("The local note changed after review. Review it again.");
    }
  }
  if (state !== await digest(JSON.stringify(data.profiles))) throw new Error("The mapping changed. Preview it again.");
  const plan = { target, request: structuredClone(request), state, locals, remotes, changes, next };
  plan.fingerprint = await digest(JSON.stringify(plan));
  return plan;
}

async function applyMappingChange(app, client, data, save, review, check = () => {}) {
  check();
  const fresh = await prepareMappingChange(app, client, data, review.request);
  if (fresh.fingerprint !== review.fingerprint) throw new Error("The mapping changed. Preview it again.");
  check();
  const profiles = data.profiles;
  const backups = data.mappingBackups ?? [];
  const receipt = { id: crypto.randomUUID(), time: new Date().toISOString(), target: review.target,
    action: review.request.action, changes: review.changes, profiles: structuredClone(profiles) };
  data.profiles = fresh.next;
  data.mappingBackups = [...backups, receipt].slice(-10);
  data.settings.autoPublish = false;
  try { await save(); } catch (error) {
    data.profiles = profiles;
    data.mappingBackups = backups;
    throw error;
  }
  return review.changes.length;
}

class MappingModal extends ConnectionScopedModal {
  constructor(plugin) {
    super(plugin);
    this.plugin = plugin;
    this.t = (message, values) => plugin.t(message, values);
    this.action = "reconnect";
    this.status = this.t("Load connections to inspect local mapping state.");
  }

  onOpen() { this.opened = true; this.contentEl.addClass("cfs-management"); this.render(); }
  onClose() { this.opened = false; this.contentEl.empty(); }

  render() {
    const { contentEl, t } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("Connections and recovery") });
    contentEl.createEl("p", { text: t("Management updates local links only. Documents stay unchanged. Automatic publication is disabled after applying a change.") });
    contentEl.createEl("p", { text: this.status, attr: { role: "status", "aria-live": "polite" } });
    new Setting(contentEl).addButton(button => button.setButtonText(t("Load connections")).setDisabled(this.busy)
      .onClick(() => this.load()));
    if (!this.inventory) return;
    const select = (name, field, options) => {
      new Setting(contentEl).setName(t(name)).addDropdown(dropdown => {
        dropdown.selectEl.setAttribute("aria-label", t(name));
        dropdown.addOption("", t("Choose an item"));
        for (const [value, label] of options) dropdown.addOption(value, label);
        dropdown.setValue(this[field] ?? "").setDisabled(this.busy).onChange(value => {
          this[field] = value; this.review = null; this.render();
        });
      });
    };
    new Setting(contentEl).setName(t("Filter connections")).addText(input => input.setValue(this.filter ?? "")
      .setDisabled(this.busy).onChange(value => { this.filter = value; this.renderRows(); }));
    this.rowsEl = contentEl.createDiv({ cls: "cfs-management-rows" });
    this.renderRows();
    select("Management action", "action", [["reconnect", t("Reconnect existing page")],
      ["recover", t("Recover completed publication")], ["migrate", t("Migrate source root")]]);
    if (this.action === "migrate") {
      select("Previous source profile", "fromTarget", this.sources);
    } else {
      select("Local note", "path", this.inventory.rows.filter(row => this.action === "recover" ?
        row.status === "Interrupted publication" : row.status === "Unlinked").map(row => [row.path, row.path]));
      if (this.action === "reconnect") {
        select("Previous missing link (optional)", "from", this.inventory.rows.filter(row => row.status === "Local file missing")
          .map(row => [row.path, row.path + " · " + row.id]));
        select("Existing Confluence page", "id", this.inventory.pages.map(page => [page.id, page.label + " · " + page.id]));
      }
    }
    new Setting(contentEl).addButton(button => button.setButtonText(t("Preview mapping change"))
      .setDisabled(this.busy || !this.action).onClick(() => this.preview()));
    if (this.review) {
      contentEl.createEl("h3", { text: t("Mapping change preview") });
      contentEl.createEl("p", { text: this.review.target });
      const list = contentEl.createEl("ul");
      for (const change of this.review.changes) list.createEl("li", { text: change });
      new Setting(contentEl).addButton(button => button.setButtonText(t("Apply mapping change")).setCta()
        .setDisabled(this.busy).onClick(() => this.apply()));
    }
  }

  renderRows() {
    this.rowsEl.empty();
    const term = normalized(this.filter ?? "").toLowerCase();
    for (const row of this.inventory.rows.filter(item => (item.path + " " + item.id + " " + this.t(item.status)).toLowerCase().includes(term))) {
      this.rowsEl.createEl("p", { text: this.t(row.status) + " · " + row.path + (row.id ? " · " + row.id : "") });
    }
  }

  async perform(task) {
    if (this.busy) return;
    this.busy = true; this.render();
    try { this.checkConnection(); await task(); } catch (error) { this.review = null; this.status = localizedError(error, this.plugin.language); }
    finally { this.busy = false; if (this.opened) this.render(); }
  }

  load() {
    return this.perform(async () => {
      this.review = null;
      await this.plugin.withConnection(async ({ client, profile }) => {
        this.inventory = await mappingInventory(this.app, client, profile);
        this.sources = Object.entries(this.plugin.data.profiles).filter(([key, entry]) => {
          const parts = mappingProfileKey(key);
          return parts && parts[0] === client.config.origin && parts[1] === client.config.folderId &&
            parts[2] !== client.config.source && Object.keys(entry.pages ?? {}).length;
        }).map(([key]) => [key, mappingProfileKey(key)[2]]);
      }, { management: true });
      this.status = this.t("{count} local mapping items loaded.", { count: this.inventory.rows.length });
    });
  }

  preview() {
    const request = this.action === "migrate" ? { action: this.action, fromTarget: this.fromTarget } :
      this.action === "recover" ? { action: this.action, path: this.path } :
        { action: this.action, path: this.path, from: this.from || null, id: this.id };
    return this.perform(async () => {
      this.review = null;
      this.review = await this.plugin.withConnection(({ client }) => prepareMappingChange(this.app, client, this.plugin.data, request), { management: true });
      this.status = this.t("Review the proposed links before applying. A local metadata backup will be retained.");
    });
  }

  apply() {
    const review = this.review;
    return this.perform(async () => {
      if (!review || !await this.plugin.confirm(this.t("Apply mapping change"),
        this.t("Apply {count} reviewed link changes? Documents stay unchanged; automatic publication will be disabled.",
          { count: review.changes.length }), this.t("Apply mapping change")) || !this.opened) return;
      this.checkConnection();
      await this.plugin.operation("Manage connections", ({ client, config, save }) =>
        applyMappingChange(this.app, client, this.plugin.data, save, review, () => {
          if (!this.opened || this.plugin.unloaded || publicationTarget(validatedConfig(this.plugin.data.settings)) !== publicationTarget(config)) {
            throw new Error("The mapping changed. Preview it again.");
          }
        }), { management: true });
      this.plugin.automatic?.configure();
      this.review = null; this.inventory = null;
      this.status = this.t("Connection metadata saved. Reload connections, then review publication manually.");
    });
  }
}
