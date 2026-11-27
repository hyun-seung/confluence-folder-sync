const DEFAULT_SETTINGS = {
  folderUrl: "", source: "Confluence source", inbox: "Confluence inbox",
  email: "", secretId: "", allowPublish: false, language: "auto",
  autoCheck: false, autoPublish: false, autoMinutes: 5,
  mermaidMode: "code",
  connectionMode: "publisher",
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
    let context = connectionContext(plugin);
    const configure = (key, value, expected = context) => {
      try {
        assertConnection(plugin, expected);
        const pending = plugin.configure(key, value, expected);
        context = connectionContext(plugin);
        return Promise.resolve(pending).then(saved => { if (!saved) this.display(); return saved; });
      } catch (error) { new Notice(localizedError(error, plugin.language)); this.display(); return Promise.resolve(false); }
    };
    const action = callback => () => {
      try { assertConnection(plugin, context); return callback(); }
      catch (error) { new Notice(localizedError(error, plugin.language)); }
    };
    new Setting(containerEl).setName(t("Saved connections and templates"))
      .setDesc(t("Active connection: {name}", { name: activeConnectionName(plugin) }))
      .addButton(button => button.setButtonText(t("Manage saved connections"))
        .onClick(action(() => new ConnectionsModal(plugin, () => this.display()).open())));
    new Setting(containerEl).setName(t("Connection setup and diagnostics"))
      .setDesc(t("Check a draft connection step by step without publishing or changing notes."))
      .addButton(button => button.setButtonText(t("Open setup wizard")).onClick(action(() => new SetupModal(plugin, () => this.display()).open())));
    new Setting(containerEl).setName(t("Language"))
      .setDesc(t("Follow Obsidian or choose the language for this plugin."))
      .addDropdown(dropdown => dropdown.addOption("auto", t("Follow Obsidian"))
        .addOption("en", "English").addOption("ko", "한국어").setValue(settings.language)
        .onChange(async value => {
          await configure("language", value);
          this.display();
        }));
    const text = (name, description, property, placeholder) => {
      new Setting(containerEl).setName(t(name)).setDesc(t(description)).addText(field => {
        field.setValue(settings[property]).setPlaceholder(placeholder).onChange(value => configure(property, value));
      });
    };
    text("Confluence folder URL", "Copy the URL of a folder from the Confluence sidebar.", "folderUrl", "https://example.atlassian.net/wiki/spaces/DOC/folder/1234");
    text("Atlassian email", "Use the account that issued the Confluence Cloud token.", "email", "name@example.com");
    new Setting(containerEl).setName(t("Confluence API token")).setDesc(t("Select a scoped Atlassian API token stored in Obsidian."))
      .addComponent(el => new SecretComponent(plugin.app, el).setValue(settings.secretId)
        .onChange(value => configure("secretId", value ?? "")));
    text("Source vault folder", "Publish only notes and referenced files from this folder.", "source", "Project");
    text("Import vault folder", "Save previews and imported copies in a separate folder.", "inbox", "Confluence inbox");
    new Setting(containerEl).setName(t("Mermaid publication"))
      .setDesc(t("Render diagrams locally as PNG and keep their source. Image mode requires manual review; no external renderer is used."))
      .addDropdown(dropdown => dropdown.addOption("code", t("Source code"))
        .addOption("image", t("Local image and source")).setValue(settings.mermaidMode)
        .onChange(async value => { await configure("mermaidMode", value); this.display(); }));
    new Setting(containerEl).setName(t("Confluence access mode"))
      .setDesc(t("Read-only connections can preview and import. Publisher connections require a separate publish opt-in."))
      .addDropdown(dropdown => dropdown.addOption("read-only", t("Read-only in Confluence"))
        .addOption("publisher", t("Publisher")).setValue(settings.connectionMode)
        .onChange(async value => { await configure("connectionMode", value); this.display(); }));
    new Setting(containerEl).setName(t("Enable publish")).setDesc(t("Allow explicit, confirmed uploads from this vault."))
      .addToggle(toggle => toggle.setValue(settings.allowPublish).setDisabled(settings.connectionMode === "read-only")
        .onChange(value => configure("allowPublish", value)));
    new Setting(containerEl).setName(t("Connection")).addButton(button => button.setButtonText(t("Test connection"))
      .onClick(action(() => plugin.run("connect"))));
    new Setting(containerEl).setName(t("Automatic checks"))
      .setDesc(t("Check after source changes and at the selected interval while Obsidian is open. No automatic imports or deletions."))
      .addToggle(toggle => toggle.setValue(settings.autoCheck).onChange(async enabled => {
        await configure("autoCheck", enabled);
        this.display();
      }));
    new Setting(containerEl).setName(t("Check interval"))
      .addDropdown(dropdown => dropdown.addOption("5", t("5 minutes")).addOption("15", t("15 minutes"))
        .addOption("60", t("60 minutes")).setValue(String(settings.autoMinutes)).setDisabled(!settings.autoCheck)
        .onChange(value => configure("autoMinutes", Number(value))));
    new Setting(containerEl).setName(t("Automatic publication"))
      .setDesc(t("Upload edits to linked pages only. New notes, moves and conflicts require manual review."))
      .addToggle(toggle => toggle.setValue(settings.autoPublish).setDisabled(!settings.autoCheck || !settings.allowPublish)
        .onChange(async enabled => {
          try {
            const approvalContext = context;
            assertConnection(plugin, approvalContext);
            const config = enabled ? validatedConfig(settings) : null;
            if (enabled && !await plugin.confirm(t("Enable automatic publication"),
              t("Automatically update linked pages from {source} at {destination} while Obsidian is open?",
                { source: config.source, destination: new URL(config.origin).hostname + " / " + config.folderId }),
              t("Enable automatic publication"))) return;
            await configure("autoPublish", enabled, approvalContext);
          } catch (error) {
            new Notice(localizedError(error, plugin.language), 12000);
          } finally {
            this.display();
          }
        }));
  }
}

class ConfluenceFolderSync extends Plugin {
  async onload() {
    mermaidRenderers.set(this.app, new LocalMermaid());
    const stored = await this.loadData() ?? {};
    this.connectionEpoch = (this.connectionEpoch ?? 0) + 1;
    this.data = { ...loadConnections(stored), profiles: stored.profiles ?? {},
      history: Array.isArray(stored.history) ? stored.history : [], backups: Array.isArray(stored.backups) ? stored.backups : [],
      mappingBackups: Array.isArray(stored.mappingBackups) ? stored.mappingBackups : [] };
    this.data.settings.autoCheck = this.data.settings.autoCheck === true;
    this.data.settings.autoPublish = this.data.settings.autoPublish === true && this.data.settings.autoCheck &&
      this.data.settings.allowPublish === true;
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
      { id: "setup", name: "Connection setup and diagnostics", callback: () => new SetupModal(this).open() },
      { id: "saved-connections", name: "Saved connections and templates", callback: () => new ConnectionsModal(this).open() },
      { id: "connections", name: "Connections and recovery", callback: () => new MappingModal(this).open() },
      { id: "history", name: "Activity and backups", callback: () => new HistoryModal(this).open() },
      { id: "publish", name: "Publish vault folder to Confluence", callback: () => this.run("publish") },
      { id: "preview", name: "Preview Confluence changes", callback: () => this.run("preview") },
      { id: "import", name: "Import new Confluence pages", callback: () => this.run("import") },
    ];
    this.registerCommands();
    this.automatic = new AutomaticSync(this);
    for (const event of ["create", "modify", "delete"]) {
      this.registerEvent(this.app.vault.on(event, file => this.automatic.changed(file)));
    }
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.automatic.changed(file, oldPath)));
    this.register(() => this.automatic.dispose());
    this.app.workspace.onLayoutReady(() => this.automatic.configure());
  }

  get language() {
    return syncLanguage(this.data.settings.language, typeof getLanguage === "function" ? getLanguage() : "en");
  }

  onunload() {
    this.unloaded = true;
    this.connectionEpoch++;
    this.automatic?.dispose();
    mermaidRenderers.get(this.app)?.dispose();
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
    syncActiveConnection(this.data);
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
          for (const [key, profile] of Object.entries(this.data.profiles)) {
            // A configured-root rename is transferred explicitly in management,
            // preserving the old baseline and folder ownership until confirmation.
            const sourceRoot = mappingProfileKey(key)?.[2];
            if (sourceRoot && pathIn(sourceRoot, event.oldPath)) continue;
            try {
              rekeySource(profile, event.oldPath, event.newPath);
            } catch (error) {
              if (error.code !== "RENAME_COLLISION") throw error;
              profile.renameConflicts ??= [];
              profile.renameConflicts = profile.renameConflicts.filter(item => item.to !== event.oldPath);
              profile.renameConflicts.push({ from: error.from, to: event.newPath });
              new Notice(localizedError(error, this.language), 12000);
            }
          }
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

  async configure(key, value, expected = connectionContext(this)) {
    try { assertConnection(this, expected); } catch (error) { new Notice(localizedError(error, this.language)); return false; }
    if (this.setupSaving || this.connectionSaving) {
      new Notice(this.t("Wait until connection settings finish saving."));
      return false;
    }
    if (this.running) { new Notice(this.t("A Confluence command is already running in this vault.")); return false; }
    if ((!CONNECTION_KEYS.includes(key) && key !== "language") || typeof value !== typeof DEFAULT_SETTINGS[key]) return false;
    if ((key === "connectionMode" && !["publisher", "read-only"].includes(value)) ||
        (["allowPublish", "autoPublish"].includes(key) && value && this.data.settings.connectionMode === "read-only") ||
        (key === "autoPublish" && value && (!this.data.settings.allowPublish || !this.data.settings.autoCheck))) return false;
    this.data.settings[key] = value;
    if (CONNECTION_KEYS.includes(key)) this.connectionEpoch = (this.connectionEpoch ?? 0) + 1;
    if (this.data.settings.connectionMode === "read-only") this.data.settings.allowPublish = this.data.settings.autoPublish = false;
    if (["folderUrl", "source", "inbox", "email", "secretId", "mermaidMode", "connectionMode"].includes(key) ||
        (key === "allowPublish" && !value) || (key === "autoCheck" && !value)) {
      this.data.settings.autoPublish = false;
    }
    try {
      await this.persist();
      if (key === "language") this.registerCommands();
      this.automatic?.configure();
      return true;
    } catch {
      new Notice(this.t("Confluence Folder Sync could not save the settings."));
      return false;
    }
  }

  confirm(title, summary, button) {
    return new Promise(resolve => new Confirmation(this.app, title, summary, button, this.t("Cancel"), resolve).open());
  }

  testSetup(draft, check) {
    return this.exclusive(() => verifySetup(this.app, draft,
      (config, token, guard) => new ConfluenceCloud(config, token, requestUrl, { check: guard }), check));
  }

  saveSetup(draft, verified, baseline, check) {
    return this.exclusive(async () => {
      checkConnectionScopes(this.data, { ...this.data.settings, ...draft });
      const result = await commitSetup(this, draft, verified, baseline, check);
      this.connectionEpoch = (this.connectionEpoch ?? 0) + 1;
      return result;
    });
  }

  async exclusive(task) {
    const context = connectionContext(this);
    if (this.unloaded) throw new Error("The plugin is disabled. Reopen it before continuing.");
    if (this.running) throw new Error("A Confluence command is already running in this vault.");
    await this.applyRenames();
    assertConnection(this, context);
    if (this.running) throw new Error("A Confluence command is already running in this vault.");
    this.running = true;
    try {
      await this.saving.catch(() => this.persist());
      assertConnection(this, context);
      return await task();
    } finally {
      try { await this.applyRenames(); } finally { this.running = false; }
    }
  }

  withConnection(task, options = {}) {
    return this.exclusive(async () => {
      const config = validatedConfig({ ...this.data.settings, language: this.language });
      checkConnectionScopes(this.data, config);
      const context = connectionContext(this);
      config.connectionContext = context;
      config.connectionId = this.data.activeConnectionId;
      config.checkPreparation = () => {
        assertConnection(this, context);
        if (this.unloaded) {
          const error = new Error("The operation was cancelled. Completed changes are preserved.");
          error.name = "AbortError";
          throw error;
        }
      };
      const token = this.app.secretStorage.getSecret(config.secretId);
      if (!token) throw new Error("Choose a valid token in the plugin settings.");
      const client = new ConfluenceCloud(config, token, requestUrl, {
        check: () => {
          assertConnection(this, context);
          if (this.unloaded) {
            const error = new Error("The operation was cancelled. Completed changes are preserved.");
            error.name = "AbortError";
            throw error;
          }
        },
        onWait: milliseconds => new Notice(this.t("Confluence is busy. Waiting {seconds} seconds before retrying a read.",
          { seconds: Math.ceil(milliseconds / 1000) }), 5000),
      });
      const folder = await client.connect();
      const key = publicationTarget(config);
      const profile = this.data.profiles[key] ??= { folders: {}, pages: {}, imports: {} };
      if (profile.movedTo && !options.management) throw new Error("This source profile was migrated. Use its destination source or migrate it back.");
      return task({ client, folder, config, profile, save: () => this.persist() });
    });
  }

  async recordOperation(action, task) {
    const item = { id: crypto.randomUUID(), time: new Date().toISOString(), action, status: "Running",
      connectionId: this.data.activeConnectionId ?? "default" };
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
      if (!this.unloaded) await this.persist();
    }
  }

  operation(action, task, options) {
    return this.withConnection(context => this.recordOperation(action, () => task(context)), options);
  }

  async recordBackup(receipt) {
    this.data.backups.push(receipt);
    this.data.backups = this.data.backups.slice(-100);
    await this.persist();
  }

  preparePublication() {
    return this.withConnection(async ({ client, profile }) => {
      const tree = await preparedNotes(this.app, client.config, () => client.check?.());
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
        const tree = await preparedNotes(this.app, config, () => client.check?.());
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

