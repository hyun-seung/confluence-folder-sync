async function prepareConflict(app, client, profile, page) {
  const { path, entry } = mappedSource(profile, numericId(page.id), client.config.source);
  if (entry.pending || entry.creating || !entry.bodyHash) {
    throw new Error("The link has an unfinished publish. Resolve it before reviewing edits.");
  }
  if (page.title !== entry.title || String(page.parentId) !== entry.parent) {
    throw new Error("Resolve page moves or title changes before resolving text.");
  }
  const file = app.vault.getFileByPath(path);
  if (!file) throw new SyncError("The linked local Markdown file is unavailable: {path}", { path });
  const original = await app.vault.read(file);
  const latest = await checkedBody(client, page);
  const prior = await checkedBody(client, page, entry.version);
  const url = client.pageUrl(page.id);
  return { id: String(page.id), path, original, local: original, base: fromStorage(prior, url),
    remote: fromStorage(latest, url), version: page.version.number, baseVersion: entry.version,
    title: page.title, parent: String(page.parentId), bodyHash: await digest(latest),
    inventory: attachmentInventory(await client.attachments(page.id)),
    target: publicationTarget(client.config) };
}

async function resolveConflict(app, client, profile, save, review, text, recordBackup) {
  if (review.target !== publicationTarget(client.config) || typeof text !== "string") {
    throw new Error("The Confluence page or destination changed. Review the latest version again.");
  }
  const { path, entry } = mappedSource(profile, review.id, client.config.source);
  if (path !== review.path || entry.version !== review.baseVersion || entry.pending || entry.creating) {
    throw new Error("The Confluence page or its link changed. Review the latest version again.");
  }
  const file = app.vault.getFileByPath(path);
  if (!file || await app.vault.read(file) !== review.original || !editorMatches(app, path, review.original)) {
    throw new Error("The local note changed after review. Review it again.");
  }
  const checkRemote = async () => {
    const page = await client.page(review.id, undefined, true);
    if (String(page.id) !== review.id || page.status !== "current" || String(page.spaceId) !== client.spaceId || page.title !== review.title ||
        String(page.parentId) !== review.parent || page.version.number !== review.version ||
        await digest(page.body?.storage?.value ?? "") !== review.bodyHash ||
        JSON.stringify(attachmentInventory(await client.attachments(review.id))) !== JSON.stringify(review.inventory)) {
      throw new Error("The Confluence page changed. Review the conflict again.");
    }
  };
  await checkRemote();
  const { backup } = await saveNoteBackup(app, client.config, path, review.original, text, recordBackup);
  await checkRemote();
  await app.vault.process(file, current => {
    if (current !== review.original || file.path !== path || !editorMatches(app, path, current)) {
      throw new Error("The local note changed while applying the selection. No local change was applied.");
    }
    return text;
  });
  const priorEntry = structuredClone(entry);
  entry.version = review.version;
  entry.bodyHash = review.bodyHash;
  entry.sourceHash = await digest(review.remote);
  entry.remoteAttachments = review.inventory;
  entry.requiresReview = true;
  delete entry.migratedInputHash;
  delete entry.inputHash;
  try {
    if (text === review.remote) {
      const tree = await preparedNotes(app, client.config);
      const note = tree.notes.find(item => item.path === path);
      if (!note || note.sourceHash !== await digest(text) || file.path !== path || !editorMatches(app, path, text)) {
        throw new Error("The local note changed after review. Review it again.");
      }
      entry.migratedInputHash = note.inputHash;
      entry.sourceHash = note.sourceHash;
    }
    await save();
  } catch (error) {
    for (const key of Object.keys(entry)) delete entry[key];
    Object.assign(entry, priorEntry);
    throw error;
  }
  return { backup, path, afterHash: await digest(text) };
}

class ConflictModal extends Modal {
  constructor(plugin, review) {
    super(plugin.app);
    this.plugin = plugin;
    this.review = review;
    this.text = review.original;
    this.t = (message, values) => plugin.t(message, values);
  }

  onOpen() {
    this.opened = true;
    this.contentEl.addClass("cfs-conflict");
    this.render();
  }

  onClose() {
    this.opened = false;
    this.contentEl.empty();
  }

  render() {
    const { contentEl, t, review } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("Resolve text conflict") });
    contentEl.createEl("p", { text: review.path + " · Confluence v" + review.baseVersion + " → v" + review.version });
    contentEl.createEl("p", { text: t("Review converted text. Attachments stay in Confluence. Publishing the resolution is a separate action.") });
    const columns = contentEl.createDiv({ cls: "cfs-conflict-columns" });
    for (const [label, text] of [["Previous baseline", review.base], ["Current local note", review.local], ["Current Confluence page", review.remote]]) {
      const column = columns.createDiv();
      column.createEl("h3", { text: t(label) });
      column.createEl("pre", { text, attr: { tabindex: "0", "aria-label": t(label) } });
    }
    new Setting(contentEl).setName(t("Resolution text"))
      .addButton(button => button.setButtonText(t("Use local text")).setDisabled(this.busy)
        .onClick(() => { this.text = review.local; this.render(); }))
      .addButton(button => button.setButtonText(t("Use Confluence text")).setDisabled(this.busy)
        .onClick(() => { this.text = review.remote; this.render(); }));
    const editor = contentEl.createEl("textarea", { cls: "cfs-resolution", attr: { "aria-label": t("Resolution text") } });
    editor.value = this.text;
    editor.disabled = Boolean(this.busy);
    editor.addEventListener("input", () => { this.text = editor.value; });
    if (this.status) contentEl.createEl("p", { text: this.status, attr: { role: "status" } });
    new Setting(contentEl).addButton(button => button.setButtonText(t("Save resolution locally")).setCta()
      .setDisabled(this.busy).onClick(() => this.apply()));
  }

  async apply() {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      if (!await this.plugin.confirm(this.t("Save resolution locally"),
        this.t("Back up {path}, save the reviewed text, and accept Confluence v{version} as the new baseline?",
          { path: this.review.path, version: this.review.version }), this.t("Apply changes")) || !this.opened) return;
      const result = await this.plugin.operation("Resolve text conflict", ({ client, profile, save }) =>
        resolveConflict(this.app, client, profile, save, this.review, this.text, receipt => this.plugin.recordBackup(receipt)));
      this.status = this.t("Resolution saved. Review publication to upload your chosen text.");
      this.close();
      new Notice(this.status);
      return result;
    } catch (error) {
      this.status = localizedError(error, this.plugin.language);
    } finally {
      this.busy = false;
      if (this.opened) this.render();
    }
  }
}
