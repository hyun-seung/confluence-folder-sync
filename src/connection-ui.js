class ConnectionsModal extends ConnectionScopedModal {
  constructor(plugin, onChanged = () => {}) {
    super(plugin);
    this.t = (message, values) => plugin.t(message, values);
    this.onChanged = onChanged;
    this.selectedId = plugin.data.activeConnectionId;
    this.renameName = plugin.data.connections[this.selectedId].name;
    this.newName = "";
    this.importText = "";
    this.urls = new Set();
  }

  onOpen() { this.opened = true; this.contentEl.addClass("cfs-connections"); this.render(); }
  onClose() {
    this.opened = false;
    this.importText = this.exportText = "";
    this.importPreview = null;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.contentEl.empty();
  }

  render() {
    const { contentEl, plugin, t } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("Saved connections and templates") });
    contentEl.createEl("p", { text: t("Active connection: {name}", { name: activeConnectionName(plugin) }) });
    contentEl.createEl("p", { text: t("Connections with the same source and Confluence target share page links. Removing a saved connection keeps its links, history and stored secret.") });
    if (this.status) contentEl.createEl("p", { text: this.status, attr: { role: "status", "aria-live": "polite" } });
    new Setting(contentEl).setName(t("Saved connection")).addDropdown(dropdown => {
      dropdown.selectEl.setAttribute("aria-label", t("Saved connection"));
      for (const [id, entry] of Object.entries(plugin.data.connections)) dropdown.addOption(id, entry.name === "Default connection" ? t(entry.name) : entry.name);
      dropdown.setValue(this.selectedId).setDisabled(this.busy).onChange(id => {
        this.selectedId = id;
        this.renameName = plugin.data.connections[id].name;
        this.render();
      });
    }).addButton(button => button.setButtonText(t("Switch connection"))
      .setDisabled(this.busy || this.selectedId === plugin.data.activeConnectionId)
      .onClick(() => this.change({ kind: "switch", id: this.selectedId })));
    new Setting(contentEl).setName(t("Connection name")).addText(input => input.setValue(this.renameName)
      .onChange(value => { this.renameName = value; })).addButton(button => button.setButtonText(t("Rename connection"))
      .setDisabled(this.busy).onClick(() => this.change({ kind: "rename", id: this.selectedId, name: this.renameName })))
      .addButton(button => button.setButtonText(t("Remove saved connection"))
        .setDisabled(this.busy || this.selectedId === plugin.data.activeConnectionId)
        .onClick(() => this.remove()));
    new Setting(contentEl).setName(t("New connection name")).addText(input => input.setValue(this.newName)
      .onChange(value => { this.newName = value; }))
      .addButton(button => button.setButtonText(t("Create connection")).setDisabled(this.busy)
        .onClick(() => this.change({ kind: "create", name: this.newName })));
    new Setting(contentEl).setName(t("Configure active connection"))
      .addButton(button => button.setButtonText(t("Open setup wizard")).setDisabled(this.busy).onClick(() => {
        try { this.checkConnection(); this.close(); new SetupModal(plugin).open(); }
        catch (error) { this.status = localizedError(error, plugin.language); this.render(); }
      }));

    contentEl.createEl("h3", { text: t("Share a setup template") });
    contentEl.createEl("p", { text: t("Templates exclude tokens, secret names, account emails, connection names, local paths, page links and document contents. Imported connections start with publishing and automation off.") });
    new Setting(contentEl).setName(t("Include Confluence target URL"))
      .setDesc(t("Optional: share the organization site and space/folder IDs. Query strings, fragments and page titles are removed."))
      .addToggle(toggle => toggle.setValue(Boolean(this.includeTarget)).setDisabled(this.busy).onChange(value => {
        this.includeTarget = value; this.exportText = null; this.render();
      }));
    new Setting(contentEl).addButton(button => button.setButtonText(t("Preview template")).setDisabled(this.busy).onClick(() => {
      try {
        this.checkConnection();
        this.exportText = setupTemplate(plugin.data.settings, this.includeTarget);
        this.status = "";
      } catch (error) { this.exportText = null; this.status = localizedError(error, plugin.language); }
      this.render();
    })).addButton(button => button.setButtonText(t("Download template"))
      .setDisabled(this.busy || !this.exportText).onClick(() => this.download()));
    if (this.exportText) contentEl.createEl("pre", { text: this.exportText, cls: "cfs-diff cfs-template-preview", attr: { tabindex: "0" } });

    contentEl.createEl("h3", { text: t("Import a setup template") });
    const input = contentEl.createEl("textarea", { cls: "cfs-resolution cfs-template-input", attr: {
      "aria-label": t("Setup template JSON"), rows: "7", spellcheck: "false",
    } });
    input.value = this.importText;
    input.disabled = Boolean(this.busy);
    input.addEventListener("input", () => {
      this.importText = input.value;
      this.importPreview = null;
      this.importButton?.setDisabled(true);
    });
    const picker = contentEl.createEl("input", { attr: { type: "file", accept: ".json,application/json", hidden: "" } });
    picker.addEventListener("change", async () => {
      try {
        const expected = this.connectionContext;
        const file = picker.files?.[0];
        if (!file) return;
        if (file.size > 8192) throw new SyncError("The setup template is invalid or unsupported.");
        const text = await file.text();
        assertConnection(plugin, expected);
        if (!this.opened) return;
        this.importText = text;
        this.previewImport();
      } catch {
        this.importPreview = null;
        this.status = t("The setup template is invalid or unsupported.");
        if (this.opened) this.render();
      }
    });
    new Setting(contentEl).addButton(button => button.setButtonText(t("Choose template file")).setDisabled(this.busy)
      .onClick(() => picker.click()))
      .addButton(button => button.setButtonText(t("Validate template")).setDisabled(this.busy).onClick(() => this.previewImport()))
      .addButton(button => {
        this.importButton = button;
        button.setButtonText(t("Import as new connection")).setDisabled(this.busy || !this.importPreview)
          .onClick(() => this.import());
      });
    if (this.importPreview) contentEl.createEl("pre", { text: JSON.stringify(this.importPreview, null, 2), cls: "cfs-diff cfs-template-preview", attr: { tabindex: "0" } });
  }

  previewImport() {
    try {
      this.checkConnection();
      this.importPreview = parseSetupTemplate(this.importText);
      this.status = this.t("Template validated locally. Choose a new connection name before importing.");
    } catch (error) { this.importPreview = null; this.status = localizedError(error, this.plugin.language); }
    this.render();
  }

  download() {
    try {
      this.checkConnection();
      if (!this.exportText || this.exportText !== setupTemplate(this.plugin.data.settings, this.includeTarget)) throw new SyncError(CONNECTION_STALE);
      const url = URL.createObjectURL(new Blob([this.exportText], { type: "application/json" }));
      this.urls.add(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "confluence-folder-sync-template.json";
      document.body.append(anchor);
      anchor.click(); anchor.remove();
      setTimeout(() => { URL.revokeObjectURL(url); this.urls.delete(url); }, 1000);
    } catch (error) { this.status = localizedError(error, this.plugin.language); this.render(); }
  }

  async remove() {
    try {
      this.checkConnection();
      const expected = this.connectionContext;
      const id = this.selectedId;
      if (!await this.plugin.confirm(this.t("Remove saved connection"),
        this.t("Remove only this saved connection's settings? Its notes, pages, links and stored secret are retained."), this.t("Remove saved connection"))) return;
      assertConnection(this.plugin, expected);
      if (this.opened) await this.change({ kind: "remove", id }, expected);
    } catch (error) { this.status = localizedError(error, this.plugin.language); if (this.opened) this.render(); }
  }

  async import() {
    try {
      this.checkConnection();
      const expected = this.connectionContext;
      const text = this.importText;
      const name = this.newName;
      parseSetupTemplate(text);
      connectionName(name);
      if (!await this.plugin.confirm(this.t("Import as new connection"),
        this.t("Create a new connection from this template? Configure your own account, secret and local folders before connecting."), this.t("Import as new connection"))) return;
      assertConnection(this.plugin, expected);
      if (!this.opened || this.importText !== text || this.newName !== name) throw new SyncError(CONNECTION_STALE);
      await this.change({ kind: "import", text, name }, expected);
    } catch (error) { this.status = localizedError(error, this.plugin.language); if (this.opened) this.render(); }
  }

  async change(action, expected = this.connectionContext) {
    if (this.busy) return;
    this.busy = true;
    this.render();
    let started = false;
    try {
      assertConnection(this.plugin, expected);
      started = true;
      await changeConnection(this.plugin, action, expected, () => {
        if (!this.opened || this.plugin.unloaded) { const error = new Error(); error.name = "AbortError"; throw error; }
      });
      this.selectedId = this.plugin.data.activeConnectionId;
      this.renameName = this.plugin.data.connections[this.selectedId].name;
      this.newName = "";
      this.importText = "";
      this.importPreview = this.exportText = null;
      this.status = this.t("Connection settings saved. Background checks and automatic publication are off.");
      this.onChanged();
    } catch (error) { this.status = localizedError(error, this.plugin.language); }
    finally {
      if (started) this.connectionContext = connectionContext(this.plugin);
      this.busy = false;
      if (this.opened) this.render();
    }
  }
}
