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

