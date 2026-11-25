const DEFAULT_SETTINGS = {
  folderUrl: "", source: "Confluence source", inbox: "Confluence inbox",
  email: "", secretId: "", allowPublish: false, language: "auto",
};

class Confirmation extends Modal {
  constructor(app, title, summary, buttonLabel, cancelLabel, accept) {
    super(app);
    this.title = title;
    this.summary = summary;
    this.buttonLabel = buttonLabel;
    this.cancelLabel = cancelLabel;
    this.accept = accept;
    this.confirmed = false;
  }

  onOpen() {
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { text: this.summary });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(this.cancelLabel).onClick(() => this.close()))
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
    const t = (message, values) => plugin.t(message, values);
    new Setting(containerEl).setName(t("Language"))
      .setDesc(t("Follow Obsidian or choose the language for this plugin."))
      .addDropdown(dropdown => dropdown.addOption("auto", t("Follow Obsidian"))
        .addOption("en", "English").addOption("ko", "한국어").setValue(settings.language)
        .onChange(async value => {
          await plugin.configure("language", value);
          this.display();
        }));
    const text = (name, description, property, placeholder) => {
      new Setting(containerEl).setName(t(name)).setDesc(t(description)).addText(field => {
        field.setValue(settings[property]).setPlaceholder(placeholder).onChange(value => plugin.configure(property, value));
      });
    };
    text("Confluence folder URL", "Copy the URL of a folder from the Confluence sidebar.", "folderUrl", "https://example.atlassian.net/wiki/spaces/DOC/folder/1234");
    text("Atlassian email", "Use the account that issued the Confluence Cloud token.", "email", "name@example.com");
    new Setting(containerEl).setName(t("Confluence API token")).setDesc(t("Select a scoped Atlassian API token stored in Obsidian."))
      .addComponent(el => new SecretComponent(plugin.app, el).setValue(settings.secretId)
        .onChange(value => plugin.configure("secretId", value ?? "")));
    text("Source vault folder", "Publish only notes and referenced files from this folder.", "source", "Project");
    text("Import vault folder", "Save previews and imported copies in a separate folder.", "inbox", "Confluence inbox");
    new Setting(containerEl).setName(t("Enable publish")).setDesc(t("Allow explicit, confirmed uploads from this vault."))
      .addToggle(toggle => toggle.setValue(settings.allowPublish).onChange(value => plugin.configure("allowPublish", value)));
    new Setting(containerEl).setName(t("Connection")).addButton(button => button.setButtonText(t("Test connection"))
      .onClick(() => plugin.run("connect")));
  }
}

class ConfluenceFolderSync extends Plugin {
  async onload() {
    const stored = await this.loadData() ?? {};
    this.data = { settings: { ...DEFAULT_SETTINGS, ...stored.settings }, profiles: stored.profiles ?? {},
      history: Array.isArray(stored.history) ? stored.history : [], backups: Array.isArray(stored.backups) ? stored.backups : [] };
    this.saving = Promise.resolve();
    this.renameEvents = [];
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.renameEvents.push({ oldPath, newPath: file.path });
      if (!this.running) void this.applyRenames().catch(error =>
        new Notice(localizedError(error, this.language), 12000));
    }));
    this.addSettingTab(new SyncSettings(this));
    const openDashboard = () => new SyncDashboard(this).open();
    this.ribbon = this.addRibbonIcon("arrow-right-left", this.t("Open Confluence sync dashboard"), openDashboard);
    this.commandDefinitions = [
      { id: "dashboard", name: "Open sync dashboard", callback: openDashboard },
      { id: "history", name: "Activity and backups", callback: () => new HistoryModal(this).open() },
      { id: "publish", name: "Publish vault folder to Confluence", callback: () => this.run("publish") },
      { id: "preview", name: "Preview Confluence changes", callback: () => this.run("preview") },
      { id: "import", name: "Import new Confluence pages", callback: () => this.run("import") },
    ];
    this.registerCommands();
  }

  get language() {
    return syncLanguage(this.data.settings.language, typeof getLanguage === "function" ? getLanguage() : "en");
  }

  t(message, values) {
    return translate(this.language, message, values);
  }

  registerCommands() {
    for (const command of this.commandDefinitions) {
      if (this.commandsRegistered) this.removeCommand(command.id);
      this.addCommand({ ...command, name: this.t(command.name) });
    }
    this.commandsRegistered = true;
    this.ribbon.setAttribute("aria-label", this.t("Open Confluence sync dashboard"));
  }

  persist() {
    const snapshot = structuredClone(this.data);
    const saved = this.saving.catch(() => {}).then(() => this.saveData(snapshot));
    this.saving = saved;
    return saved;
  }

  applyRenames() {
    if (this.applyingRenames) return this.applyingRenames;
    if (!this.renameEvents.length) return Promise.resolve();
    this.applyingRenames = (async () => {
      while (this.renameEvents.length) {
        const event = this.renameEvents[0];
        const previous = structuredClone(this.data.profiles);
        try {
          for (const profile of Object.values(this.data.profiles)) rekeySource(profile, event.oldPath, event.newPath);
          await this.persist();
          this.renameEvents.shift();
        } catch (error) {
          this.data.profiles = previous;
          throw error;
        }
      }
    })().finally(() => { this.applyingRenames = null; });
    return this.applyingRenames;
  }

  async configure(key, value) {
    this.data.settings[key] = value;
    try {
      await this.persist();
      if (key === "language") this.registerCommands();
    } catch {
      new Notice(this.t("Confluence Folder Sync could not save the settings."));
    }
  }

  confirm(title, summary, button) {
    return new Promise(resolve => new Confirmation(this.app, title, summary, button, this.t("Cancel"), resolve).open());
  }

  async exclusive(task) {
    if (this.running) throw new Error("A Confluence command is already running in this vault.");
    await this.applyRenames();
    if (this.running) throw new Error("A Confluence command is already running in this vault.");
    this.running = true;
    try {
      await this.saving.catch(() => this.persist());
      return await task();
    } finally {
      this.running = false;
      await this.applyRenames();
    }
  }

  withConnection(task) {
    return this.exclusive(async () => {
      const config = validatedConfig({ ...this.data.settings, language: this.language });
      const token = this.app.secretStorage.getSecret(config.secretId);
      if (!token) throw new Error("Choose a valid token in the plugin settings.");
      const client = new ConfluenceCloud(config, token);
      const folder = await client.connect();
      const key = publicationTarget(config);
      const profile = this.data.profiles[key] ??= { folders: {}, pages: {}, imports: {} };
      return task({ client, folder, config, profile, save: () => this.persist() });
    });
  }

  async recordOperation(action, task) {
    const item = { id: crypto.randomUUID(), time: new Date().toISOString(), action, status: "Running" };
    this.data.history.push(item);
    this.data.history = this.data.history.slice(-100);
    await this.persist();
    try {
      const result = await task();
      item.status = "Succeeded";
      if (typeof result === "number") item.count = result;
      return result;
    } catch (error) {
      item.status = error?.name === "AbortError" ? "Cancelled" : "Failed";
      item.error = localizedError(error, this.language).slice(0, 600);
      throw error;
    } finally {
      item.finished = new Date().toISOString();
      await this.persist();
    }
  }

  operation(action, task) {
    return this.withConnection(context => this.recordOperation(action, () => task(context)));
  }

  async recordBackup(receipt) {
    this.data.backups.push(receipt);
    this.data.backups = this.data.backups.slice(-100);
    await this.persist();
  }

  preparePublication() {
    return this.withConnection(async ({ client, profile }) => {
      const tree = await preparedNotes(this.app, client.config);
      return publicationReview(this.app, client, profile, tree, await client.catalog());
    });
  }

  async run(action) {
    const progress = new Notice(this.t("Connecting to Confluence…"), 0);
    try {
      await this.operation(action === "publish" ? "Review publication" : action === "preview" ? "Preview changes" :
        action === "import" ? "Import new pages" : "Test connection", async ({ client, folder, config, profile, save }) => {
        if (action === "connect") {
          new Notice(this.t("Connected to Confluence folder {title} ({id}).", { title: folder.title, id: config.folderId }));
          return;
        }
        const catalog = await client.catalog();
        if (action !== "publish") {
          const result = await incoming(this.app, client, catalog, profile, save, action === "import");
          await this.app.workspace.getLeaf("tab").openFile(result.file);
          new Notice(result.summary);
          return;
        }
        const tree = await preparedNotes(this.app, config);
        const review = await publicationReview(this.app, client, profile, tree, catalog);
        new PublicationModal(this, review).open();
      });
    } catch (error) {
      const message = localizedError(error, this.language);
      new Notice("Confluence Folder Sync: " + message, 12000);
    } finally {
      progress.hide();
    }
  }
}

module.exports = ConfluenceFolderSync;

