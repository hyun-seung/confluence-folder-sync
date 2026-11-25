async function saveNoteBackup(app, config, path, original, after, record = async () => {}) {
  if (!path.startsWith(config.source + "/") || vaultPath(path) !== path) {
    throw new Error("The linked note is outside the configured source folder.");
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-") + " " + crypto.randomUUID().slice(0, 8);
  const backup = config.inbox + "/Backups/" + stamp + "/" + path.slice(config.source.length + 1);
  await makeVaultFolders(app.vault, parentPath(backup), config.inbox);
  await app.vault.create(backup, original);
  const receipt = { id: crypto.randomUUID(), time: new Date().toISOString(), path, backup,
    backupHash: await digest(original), afterHash: await digest(after), target: publicationTarget(config) };
  await record(receipt);
  return receipt;
}

async function restoreNoteBackup(app, config, receipt, record) {
  if (receipt.target !== publicationTarget(config) || vaultPath(receipt.path) !== receipt.path ||
      !receipt.path.startsWith(config.source + "/") || vaultPath(receipt.backup) !== receipt.backup ||
      !receipt.backup.startsWith(config.inbox + "/Backups/")) {
    throw new Error("This backup belongs to another source or destination.");
  }
  const file = app.vault.getFileByPath(receipt.path);
  const backup = app.vault.getFileByPath(receipt.backup);
  if (!file || !backup || file.extension !== "md") throw new Error("The note or backup is unavailable.");
  const original = await app.vault.read(file);
  const text = await app.vault.read(backup);
  if (await digest(text) !== receipt.backupHash) throw new Error("The backup contents changed. Open it for manual review.");
  if (await digest(original) !== receipt.afterHash || !editorMatches(app, file.path, original)) {
    throw new Error("The note changed after this backup. Open the backup and review it manually.");
  }
  const recovery = await saveNoteBackup(app, config, file.path, original, text, record);
  await app.vault.process(file, current => {
    if (file.path !== receipt.path || current !== original || !editorMatches(app, receipt.path, current)) {
      throw new Error("The local note changed while applying the selection. No local change was applied.");
    }
    return text;
  });
  return recovery;
}

class HistoryModal extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.t = (message, values) => plugin.t(message, values);
  }

  onOpen() {
    this.contentEl.addClass("cfs-history");
    this.render();
  }

  render() {
    const { contentEl, plugin, t } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("Activity and backups") });
    if (this.status) contentEl.createEl("p", { text: this.status, attr: { role: "status" } });
    contentEl.createEl("h3", { text: t("Recent operations") });
    for (const item of plugin.data.history.slice().reverse().slice(0, 30)) {
      const result = item.status === "Running" && !plugin.running ? "Interrupted" : item.status;
      new Setting(contentEl).setName(t(item.action) + " · " + t(result))
        .setDesc(item.time + (item.error ? " · " + item.error : item.count !== undefined ? " · " + item.count : ""));
    }
    if (!plugin.data.history.length) contentEl.createEl("p", { text: t("No recorded operations yet.") });
    contentEl.createEl("h3", { text: t("Local note backups") });
    for (const receipt of plugin.data.backups.slice().reverse().slice(0, 30)) {
      new Setting(contentEl).setName(receipt.path).setDesc(receipt.time)
        .addButton(button => button.setButtonText(t("Open backup")).onClick(async () => {
          const file = this.app.vault.getFileByPath(receipt.backup);
          if (file) await this.app.workspace.getLeaf("tab").openFile(file);
          this.close();
        }))
        .addButton(button => button.setButtonText(t("Restore backup")).setDisabled(this.busy || plugin.running)
          .onClick(() => this.restore(receipt)));
    }
    if (!plugin.data.backups.length) contentEl.createEl("p", { text: t("No recorded backups yet.") });
  }

  async restore(receipt) {
    this.busy = true;
    this.render();
    try {
      if (!await this.plugin.confirm(this.t("Restore backup"),
        this.t("Restore {path}? The current note will be backed up first.", { path: receipt.path }),
        this.t("Restore backup"))) return;
      await this.plugin.exclusive(() => this.plugin.recordOperation("Restore backup", () =>
        restoreNoteBackup(this.app, validatedConfig(this.plugin.data.settings), receipt,
          item => this.plugin.recordBackup(item))));
      this.status = this.t("Backup restored locally.");
    } catch (error) {
      this.status = localizedError(error, this.plugin.language);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
