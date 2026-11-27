function publicationTarget(config) {
  return JSON.stringify([config.origin, config.folderId, config.source]);
}

function attachmentsConflict(entry, note, files) {
  if (!entry.remoteAttachments) return false;
  const desired = new Map(publicationAssets(note).map(asset => [asset.name, asset]));
  const raw = new Map(files.map(file => [file.title, file]));
  return attachmentDiff(entry.remoteAttachments, attachmentInventory(files)).some(change => {
    const asset = desired.get(change.title);
    const intent = entry.uploadIntents?.[change.title];
    const file = raw.get(change.title);
    // A known content-addressed upload may have succeeded before a prior request
    // was interrupted. Existing/deleted/edited remote versions still conflict.
    const hash = intent?.hash ?? asset?.hash;
    const size = intent?.size ?? asset?.data.byteLength;
    return change.kind !== "Added" || !hash || change.version !== 1 ||
      file?.comment !== hash || file?.fileSize !== size;
  });
}

function selectionTree(tree, paths) {
  const selected = new Set(paths);
  const notes = tree.notes.filter(note => selected.has(note.path));
  const folders = new Set(notes.flatMap(note => ancestors(note.path, tree.source)));
  return { ...tree, notes, folders: tree.folders.filter(path => folders.has(path)) };
}

async function publicationReview(app, client, profile, tree, catalog) {
  client = client instanceof ReviewReads ? client : new ReviewReads(client);
  await client.preloadPages(tree.notes.map(note => profile.pages["file:" + note.path]?.id)
    .filter(id => id && catalog.has(id)));
  const config = client.config;
  const publisher = new Publisher(client, app, profile, async () => {});
  const folders = new Map([[config.source, { id: config.folderId }]]);
  const ids = new Map(Object.entries(profile.pages)
    .filter(([key, entry]) => key.startsWith("file:" + config.source + "/") && entry.id && catalog.has(entry.id))
    .map(([key, entry]) => [key.slice(5), entry.id]));
  for (const path of tree.folders) {
    const parent = folders.get(parentPath(path));
    try {
      if (parent?.error) throw parent.error;
      const remote = await publisher.inspect("folder", profile.folders, "dir:" + path,
        normalized(path.split("/").at(-1)), parent?.id ?? null, catalog);
      folders.set(path, { id: remote?.id ?? null });
    } catch (error) {
      folders.set(path, { error });
    }
  }
  const rows = await mapConcurrent(tree.notes, async note => {
    await client.check();
    const entry = profile.pages["file:" + note.path];
    const parent = folders.get(parentPath(note.path));
    const row = { path: note.path, inputHash: note.inputHash, title: note.title, id: entry?.id ?? null,
      renamedFrom: entry?.renamedFrom ?? null,
      dependencies: Array.from(new Set(note.dependencies.filter(path => path !== note.path && !ids.has(path)))) };
    try {
      if (note.problem) throw note.problem;
      if (!editorMatches(app, note.path, note.original)) throw new Error("Save the open editor before publication.");
      if (parent?.error) throw parent.error;
      const page = await publisher.inspect("page", profile.pages, "file:" + note.path,
        note.title, parent?.id ?? null, catalog);
      row.version = page?.version.number ?? null;
      row.parent = page ? String(page.parentId) : null;
      if (page && entry.remoteAttachments) {
        const files = await client.attachments(page.id);
        row.inventoryHash = await digest(JSON.stringify(attachmentInventory(files)));
        if (attachmentsConflict(entry, note, files)) {
          throw new Error("Confluence attachments changed. Review the conflict before publishing.");
        }
      }
      row.outputHash = await digest(resolvedStorage(note, app, client, ids));
      row.formatReviewRequired = Boolean(page && entry.bodyHash && (entry.formatRevision ?? 0) < MARKDOWN_FORMAT_REVISION &&
        entry.sourceHash === note.sourceHash && !preservePublishedBody(entry, note));
      if (row.formatReviewRequired) row.reason = translate(config.language,
        "Review this attachment change manually after the Markdown upgrade.");
      row.status = !page ? "New" : entry.creating || entry.pending ||
        page.title !== note.title || String(page.parentId) !== parent?.id ? "Changed" :
        preservePublishedBody(entry, note) ||
        row.outputHash === entry.bodyHash ? "Unchanged" : "Changed";
    } catch (error) {
      if (error.name === "AbortError") throw error;
      row.status = "Conflict";
      row.reason = localizedError(error, config.language);
    }
    return row;
  });
  for (const row of rows) row.fingerprint = await digest(JSON.stringify(row));
  return { target: publicationTarget(config), rows, source: config.source,
    destination: new URL(config.origin).hostname + " / " + config.folderId };
}

function checkedSelection(review, current, paths) {
  if (review.target !== current.target) throw new Error("The publication destination changed. Refresh the review.");
  const selected = new Set(paths);
  if (!selected.size) throw new Error("Select at least one eligible note.");
  const ready = new Map(current.rows.map(row => [row.path, row]));
  const previous = new Map(review.rows.map(row => [row.path, row]));
  for (const path of selected) {
    const row = ready.get(path);
    const prior = previous.get(path);
    if (!prior || !row || !["New", "Changed"].includes(row.status) || row.fingerprint !== prior.fingerprint) {
      throw new Error("A selected note or page changed. Refresh the publication review.");
    }
    if (row.dependencies.some(dependency => !selected.has(dependency))) {
      throw new Error("Also select the unpublished notes referenced by your selection.");
    }
  }
  return selected;
}

async function checkPublicationInput(app, note, source) {
  const changed = () => { throw new Error("A selected note or page changed. Refresh the publication review."); };
  if (!unchangedSourcePaths(note, source)) changed();
  const inputs = [note.file, ...Array.from(note.assets.values(), asset => asset.file)];
  const stamp = file => JSON.stringify([file.stat?.ctime, file.stat?.mtime, file.stat?.size]);
  const revisions = inputs.map(stamp);
  const text = await app.vault.read(note.file);
  const sourceHash = await digest(text);
  if (!unchangedSourcePaths(note, source) || sourceHash !== note.sourceHash || !editorMatches(app, note.path, note.original)) changed();
  for (const [path, asset] of note.assets) {
    if (asset.file.path !== path || !visibleSourcePath(path, source)) changed();
    const data = await app.vault.readBinary(asset.file);
    if (data.byteLength > MAX_ATTACHMENT_BYTES) changed();
    const hash = await digest(data);
    if (!unchangedSourcePaths(note, source) || hash !== asset.hash) changed();
  }
  for (const asset of note.diagrams?.values() ?? []) {
    if (await digest(asset.data) !== asset.hash) changed();
  }
  const finalHash = await digest(await app.vault.read(note.file));
  if (!unchangedSourcePaths(note, source) || finalHash !== note.sourceHash ||
      !editorMatches(app, note.path, note.original) || inputs.some((file, index) => stamp(file) !== revisions[index])) changed();
}

async function publishSelection(app, client, profile, save, review, paths, control = {}) {
  const previousCheck = client.check;
  client.check = async () => { await previousCheck?.(); await control.check?.(); };
  try {
    await client.check();
    return await publishReviewedSelection(app, client, profile, save, review, paths, control);
  } finally {
    client.check = previousCheck;
  }
}

async function publishReviewedSelection(app, client, profile, save, review, paths, control) {
  if (!client.config.allowPublish) throw new Error("Enable publishing in the plugin settings first.");
  const tree = await preparedNotes(app, client.config, () => client.check?.());
  tree.source = client.config.source;
  const catalog = await client.catalog();
  const current = await publicationReview(app, client, profile, tree, catalog);
  const selected = checkedSelection(review, current, paths);
  const subset = selectionTree(tree, selected);
  // Re-read after remote preflight. A modal can stay open while local files change.
  for (const note of subset.notes) {
    await checkPublicationInput(app, note, client.config.source);
  }
  const publisher = new Publisher(client, app, profile, save);
  await publisher.plan(subset, catalog);
  return publisher.publish(subset, catalog, {
    ...control,
    check: async note => {
      await control.check?.(note);
      for (const selectedNote of note ? [note] : subset.notes) {
        await checkPublicationInput(app, selectedNote, client.config.source);
      }
    },
  });
}

class PublicationModal extends Modal {
  constructor(plugin, review) {
    super(plugin.app);
    this.plugin = plugin;
    this.review = review;
    this.selection = new Set();
    this.t = (message, values) => plugin.t(message, values);
  }

  onOpen() {
    this.opened = true;
    this.contentEl.addClass("cfs-publication");
    this.render();
  }

  onClose() {
    this.opened = false;
    this.cancelled = true;
    this.contentEl.empty();
  }

  render() {
    const { contentEl, t, review } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("Review publication") });
    contentEl.createEl("p", { text: review.source + " → " + review.destination });
    const counts = ["New", "Changed", "Unchanged", "Conflict"].map(status =>
      t(status) + " " + review.rows.filter(row => row.status === status).length);
    contentEl.createEl("p", { text: counts.join(" · "), attr: { role: "status", "aria-live": "polite" } });
    if (this.status) contentEl.createEl("p", { text: this.status, attr: { role: "status" } });
    if (!this.plugin.data.settings.allowPublish) contentEl.createEl("p", { text: t("Enable publishing in the plugin settings first.") });
    const controls = new Setting(contentEl);
    controls.addButton(button => button.setButtonText(t("Select eligible notes")).setDisabled(this.busy)
      .onClick(() => {
        this.selection = new Set(review.rows.filter(row => ["New", "Changed"].includes(row.status)).map(row => row.path));
        this.render();
      }));
    controls.addButton(button => button.setButtonText(t("Clear selection")).setDisabled(this.busy)
      .onClick(() => { this.selection.clear(); this.render(); }));
    controls.addButton(button => button.setButtonText(t("Refresh review")).setDisabled(this.busy).onClick(() => this.refresh()));
    if (this.busy) controls.addButton(button => button.setButtonText(t("Cancel"))
      .onClick(() => { this.cancelled = true; this.status = t("Cancelling after the current request…"); this.render(); }));
    new Setting(contentEl).setName(t("Filter notes")).addText(input => input.setValue(this.filter ?? "")
      .setPlaceholder(t("Title or folder")).setDisabled(this.busy).onChange(value => {
        this.filter = value;
        this.renderRows();
      }));
    this.rowsEl = contentEl.createDiv({ cls: "cfs-publication-rows" });
    this.renderRows();
    new Setting(contentEl).setName(t("Selected notes: {count}", { count: this.selection.size }))
      .addButton(button => {
        this.publishButton = button;
        button.setButtonText(t("Publish selected")).setCta()
          .setDisabled(this.busy || !this.selection.size || !this.plugin.data.settings.allowPublish)
          .onClick(() => this.publish());
      });
  }

  renderRows() {
    const { rowsEl, t } = this;
    rowsEl.empty();
    const query = normalized(this.filter ?? "").trim().toLowerCase();
    for (const row of this.review.rows.filter(item => normalized(item.path).toLowerCase().includes(query))) {
      const description = row.reason ?? (row.renamedFrom ? t("Linked page moved from {path}", { path: row.renamedFrom }) : row.dependencies.length ?
        t("Also required: {paths}", { paths: row.dependencies.join(", ") }) : row.id ? "Confluence " + row.id + " · v" + row.version : "");
      new Setting(rowsEl).setName(t(row.status) + " · " + row.path).setDesc(description)
        .addToggle(toggle => toggle.setValue(this.selection.has(row.path))
          .setDisabled(this.busy || !["New", "Changed"].includes(row.status)).onChange(enabled => {
            if (enabled) this.selection.add(row.path);
            else this.selection.delete(row.path);
            this.render();
          }));
    }
  }

  async refresh() {
    this.busy = true;
    this.render();
    try {
      this.review = await this.plugin.preparePublication();
      this.selection.clear();
      this.status = "";
    } catch (error) {
      this.status = localizedError(error, this.plugin.language);
    } finally {
      this.busy = false;
      if (this.opened) this.render();
    }
  }

  async publish() {
    if (this.busy || !this.opened) return;
    this.busy = true;
    this.cancelled = false;
    const paths = Array.from(this.selection);
    this.render();
    try {
      if (!await this.plugin.confirm(this.t("Publish selected"),
        this.t("Publish {count} selected notes to {destination}?", { count: paths.length, destination: this.review.destination }),
        this.t("Publish")) || !this.opened) return;
      const updated = await this.plugin.operation("Publish selected", ({ client, profile, save }) =>
        publishSelection(this.app, client, profile, save, this.review, paths, {
          check: () => {
            if (this.cancelled || this.plugin.unloaded) {
              const error = new Error("The operation was cancelled. Completed changes are preserved.");
              error.name = "AbortError";
              throw error;
            }
            if (!this.plugin.data.settings.allowPublish) throw new Error("Enable publishing in the plugin settings first.");
            if (publicationTarget(validatedConfig(this.plugin.data.settings)) !== this.review.target) {
              throw new Error("The publication destination changed. Refresh the review.");
            }
          },
          progress: (done, total, path) => {
            this.status = this.t("Publishing {done}/{total}: {path}", { done, total, path });
            if (this.opened) this.render();
          },
        }));
      this.status = this.t("Published {count} selected notes.", { count: updated });
      this.review = await this.plugin.preparePublication();
      this.selection.clear();
    } catch (error) {
      this.status = localizedError(error, this.plugin.language);
    } finally {
      this.busy = false;
      if (this.opened) this.render();
    }
  }
}
