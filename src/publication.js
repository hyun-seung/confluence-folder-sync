function publicationTarget(config) {
  return JSON.stringify([config.origin, config.folderId, config.source]);
}

function selectionTree(tree, paths) {
  const selected = new Set(paths);
  const notes = tree.notes.filter(note => selected.has(note.path));
  const folders = new Set(notes.flatMap(note => ancestors(note.path, tree.source)));
  return { ...tree, notes, folders: tree.folders.filter(path => folders.has(path)) };
}

async function publicationReview(app, client, profile, tree, catalog) {
  const config = client.config;
  const publisher = new Publisher(client, app, profile, async () => {});
  const folders = new Map([[config.source, { id: config.folderId }]]);
  const ids = new Map(Object.entries(profile.pages)
    .filter(([key, entry]) => key.startsWith("file:") && entry.id && catalog.has(entry.id))
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
  const rows = [];
  for (const note of tree.notes) {
    const entry = profile.pages["file:" + note.path];
    const parent = folders.get(parentPath(note.path));
    const row = { path: note.path, inputHash: note.inputHash, title: note.title, id: entry?.id ?? null,
      dependencies: Array.from(new Set(note.dependencies.filter(path => path !== note.path && !ids.has(path)))) };
    try {
      if (parent?.error) throw parent.error;
      const page = await publisher.inspect("page", profile.pages, "file:" + note.path,
        note.title, parent?.id ?? null, catalog);
      row.version = page?.version.number ?? null;
      row.parent = page ? String(page.parentId) : null;
      row.outputHash = await digest(resolvedStorage(note, app, client, ids));
      row.status = !page ? "New" : entry.creating || entry.pending ? "Changed" :
        entry.migratedInputHash === note.inputHash ||
        row.outputHash === entry.bodyHash ? "Unchanged" : "Changed";
    } catch (error) {
      row.status = "Conflict";
      row.reason = localizedError(error, config.language);
    }
    rows.push(row);
  }
  for (const row of rows) row.fingerprint = await digest(JSON.stringify(row));
  return { target: publicationTarget(config), rows, source: config.source,
    destination: new URL(config.origin).hostname + " / " + config.folderId };
}

function checkedSelection(review, current, paths) {
  if (review.target !== current.target) throw new Error("The publication destination changed. Refresh the review.");
  const selected = new Set(paths);
  if (!selected.size) throw new Error("Select at least one eligible note.");
  const ready = new Map(current.rows.map(row => [row.path, row]));
  for (const path of selected) {
    const row = ready.get(path);
    const prior = review.rows.find(item => item.path === path);
    if (!prior || !row || !["New", "Changed"].includes(row.status) || row.fingerprint !== prior.fingerprint) {
      throw new Error("A selected note or page changed. Refresh the publication review.");
    }
    if (row.dependencies.some(dependency => !selected.has(dependency))) {
      throw new Error("Also select the unpublished notes referenced by your selection.");
    }
  }
  return selected;
}

async function publishSelection(app, client, profile, save, review, paths, control = {}) {
  if (!client.config.allowPublish) throw new Error("Enable publishing in the plugin settings first.");
  const tree = await preparedNotes(app, client.config);
  tree.source = client.config.source;
  const catalog = await client.catalog();
  const current = await publicationReview(app, client, profile, tree, catalog);
  const selected = checkedSelection(review, current, paths);
  const subset = selectionTree(tree, selected);
  // Re-read after remote preflight. A modal can stay open while local files change.
  for (const note of subset.notes) {
    if (note.file.path !== note.path || await digest(await app.vault.read(note.file)) !== note.sourceHash) {
      throw new Error("A selected note or page changed. Refresh the publication review.");
    }
  }
  const publisher = new Publisher(client, app, profile, save);
  await publisher.plan(subset, catalog);
  return publisher.publish(subset, catalog, {
    ...control,
    check: async note => {
      await control.check?.(note);
      for (const selectedNote of note ? [note] : subset.notes) {
        if (selectedNote.file.path !== selectedNote.path ||
            await digest(await app.vault.read(selectedNote.file)) !== selectedNote.sourceHash) {
          throw new Error("A selected note or page changed. Refresh the publication review.");
        }
        for (const [path, asset] of selectedNote.assets) {
          if (asset.file.path !== path || await digest(await app.vault.readBinary(asset.file)) !== asset.hash) {
            throw new Error("A selected note or page changed. Refresh the publication review.");
          }
        }
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
      const description = row.reason ?? (row.dependencies.length ?
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
    const paths = Array.from(this.selection);
    this.render();
    try {
      if (!await this.plugin.confirm(this.t("Publish selected"),
        this.t("Publish {count} selected notes to {destination}?", { count: paths.length, destination: this.review.destination }),
        this.t("Publish")) || !this.opened) return;
      const updated = await this.plugin.withConnection(({ client, profile, save }) =>
        publishSelection(this.app, client, profile, save, this.review, paths));
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
