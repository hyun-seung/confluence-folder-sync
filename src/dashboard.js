class SyncDashboard extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.pages = [];
    this.versions = [];
    this.status = "Load pages to view their Confluence versions.";
  }

  onOpen() {
    this.opened = true;
    this.contentEl.addClass("cfs-dashboard");
    this.render();
  }

  onClose() {
    this.opened = false;
    this.contentEl.empty();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Confluence Folder Sync" });
    contentEl.createEl("p", { text: this.status, attr: { role: "status", "aria-live": "polite" } });
    const button = (label, callback, disabled = false) => component =>
      component.setButtonText(label).setDisabled(this.busy || disabled).onClick(callback);
    const command = action => () => {
      this.close();
      void this.plugin.run(action);
    };
    new Setting(contentEl).setName("Check and sync")
      .addButton(button("Preview changes", command("preview")))
      .addButton(button("Import new pages", command("import")))
      .addButton(button("Publish folder", command("publish"), !this.plugin.data.settings.allowPublish));
    new Setting(contentEl).setName("Download the full folder")
      .setDesc("Save every current page as a new snapshot under the import folder.")
      .addButton(button("Download snapshot", () => this.saveSnapshot()));
    new Setting(contentEl).setName("Page versions")
      .addButton(button("Load pages", () => this.loadPages()));

    if (!this.pages.length) return;
    const selectPage = new Setting(contentEl).setName("Confluence page");
    selectPage.addDropdown(dropdown => {
      this.pageDropdown = dropdown;
      dropdown.setDisabled(this.busy);
      this.filterPages(this.filter ?? "");
      dropdown.onChange(value => {
        this.pageId = value;
        this.versions = [];
        this.difference = null;
        this.render();
      });
    });
    new Setting(contentEl).setName("Filter pages")
      .addText(input => input.setValue(this.filter ?? "").setPlaceholder("Title or folder")
        .setDisabled(this.busy).onChange(value => this.filterPages(value)));
    new Setting(contentEl).setName("Selected page")
      .addButton(button("Load versions", () => this.loadVersions(), !this.pageId))
      .addButton(button("Download latest copy", () => this.saveSnapshot(this.pageId), !this.pageId));
    if (this.versions.length > 1) {
      const version = (field, name) => dropdown => {
        dropdown.setDisabled(this.busy);
        dropdown.selectEl.setAttribute("aria-label", name);
        for (const entry of this.versions) {
          const date = entry.createdAt ? " · " + entry.createdAt.slice(0, 10) : "";
          dropdown.addOption(String(entry.number), "v" + entry.number + date);
        }
        dropdown.setValue(String(this[field])).onChange(value => { this[field] = Number(value); });
      };
      new Setting(contentEl).setName("Compare versions")
        .addDropdown(version("before", "Base version"))
        .addDropdown(version("after", "Comparison version"))
        .addButton(button("Compare", () => this.compareVersions()));
    }
    if (this.difference) {
      contentEl.createEl("h3", { text: this.difference.title });
      const diff = contentEl.createEl("pre", { cls: "cfs-diff", attr: { tabindex: "0", "aria-label": "Version differences" } });
      for (const line of this.difference.text.split("\n")) {
        const cls = line.startsWith("+") ? "cfs-added" : line.startsWith("-") ? "cfs-removed" : "";
        diff.createSpan({ text: line + "\n", cls });
      }
    }
  }

  filterPages(text) {
    this.filter = text;
    const term = normalized(text.trim()).toLowerCase();
    const dropdown = this.pageDropdown;
    dropdown.selectEl.replaceChildren();
    dropdown.addOption("", "Choose a page");
    for (const page of this.pages) {
      if (normalized(page.label).toLowerCase().includes(term) || page.id === this.pageId) {
        dropdown.addOption(page.id, page.label);
      }
    }
    dropdown.setValue(this.pageId ?? "");
  }

  async perform(message, task) {
    if (this.busy) return;
    this.busy = true;
    this.status = message;
    this.render();
    try {
      await this.plugin.withConnection(task);
    } catch (error) {
      this.status = error instanceof Error ? error.message : "The Confluence action failed.";
    } finally {
      this.busy = false;
      if (this.opened) this.render();
    }
  }

  loadPages() {
    return this.perform("Loading Confluence pages…", async ({ client, folder }) => {
      const remote = await remotePages(client, await client.catalog());
      this.pages = Array.from(remote.trails, ([id, trail]) => ({
        id, label: trail.map(node => node.title).join(" / "),
      })).sort((a, b) => a.label.localeCompare(b.label));
      if (!remote.pages.has(this.pageId)) {
        this.pageId = "";
        this.versions = [];
        this.difference = null;
      }
      this.status = folder.title + " · " + this.pages.length + " pages";
    });
  }

  selected(message, task) {
    const id = this.pageId;
    return this.perform(message, async ({ client }) => {
      const remote = await remotePages(client, await client.catalog());
      const page = remote.pages.get(id);
      if (!page) throw new Error("The selected page is no longer in this Confluence folder.");
      await task(client, page);
    });
  }

  loadVersions() {
    return this.selected("Loading page versions…", async (client, page) => {
      const current = page.version;
      const versions = new Map([[current.number, current]]);
      for (const entry of await client.pageVersions(page.id)) {
        if (Number.isInteger(entry.number) && entry.number > 0) versions.set(entry.number, entry);
      }
      this.versions = Array.from(versions.values()).sort((a, b) => b.number - a.number);
      this.after = this.versions[0].number;
      this.before = this.versions[1]?.number;
      this.difference = null;
      this.status = page.title + " · " + this.versions.length + " available versions";
    });
  }

  compareVersions() {
    const before = this.before;
    const after = this.after;
    return this.selected("Comparing page versions…", async (client, page) => {
      if (before === after) throw new Error("Choose two different versions.");
      const url = client.pageUrl(page.id);
      const [oldBody, newBody] = await Promise.all([checkedBody(client, page, before), checkedBody(client, page, after)]);
      const diff = diffLines(fromStorage(oldBody, url), fromStorage(newBody, url));
      this.difference = { title: page.title + " · v" + before + " → v" + after,
        text: diff || "No converted Markdown body difference." };
      this.status = "Version comparison complete.";
    });
  }

  saveSnapshot(id) {
    return this.perform("Preparing the current Confluence snapshot…", async ({ client, folder }) => {
      const remote = await remotePages(client, await client.catalog());
      if (!this.opened) return;
      if (!id) {
        if (!remote.pages.size) throw new Error("The selected folder contains no pages.");
        const approved = await this.plugin.confirm(
          "Download Confluence snapshot",
          "Save the current versions of " + remote.pages.size + " pages from " + folder.title +
          " in a new snapshot under " + client.config.inbox + "?",
          "Download snapshot",
        );
        if (!approved || !this.opened) {
          this.status = "Snapshot cancelled.";
          return;
        }
      }
      const result = await downloadSnapshot(this.app.vault, client, remote, id);
      this.status = result.summary;
      await this.app.workspace.getLeaf("tab").openFile(result.file);
      if (this.opened) this.close();
      new Notice(result.summary);
    });
  }
}

