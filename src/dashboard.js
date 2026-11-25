class SyncDashboard extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.t = (message, values) => plugin.t(message, values);
    this.pages = [];
    this.versions = [];
    this.status = this.t("Load pages to view their Confluence versions.");
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
    const { contentEl, t } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Confluence Folder Sync" });
    contentEl.createEl("p", { text: this.status, attr: { role: "status", "aria-live": "polite" } });
    const button = (label, callback, disabled = false) => component =>
      component.setButtonText(t(label)).setDisabled(this.busy || disabled).onClick(callback);
    const command = action => () => {
      this.close();
      void this.plugin.run(action);
    };
    new Setting(contentEl).setName(t("Check and sync"))
      .addButton(button("Preview changes", command("preview")))
      .addButton(button("Import new pages", command("import")))
      .addButton(button("Publish folder", command("publish"), !this.plugin.data.settings.allowPublish));
    new Setting(contentEl).setName(t("Download the full folder"))
      .setDesc(t("Save every current page as a new snapshot under the import folder."))
      .addButton(button("Download snapshot", () => this.saveSnapshot()));
    new Setting(contentEl).setName(t("Page versions"))
      .addButton(button("Load pages", () => this.loadPages()));

    if (!this.pages.length) return;
    const selectPage = new Setting(contentEl).setName(t("Confluence page"));
    selectPage.addDropdown(dropdown => {
      this.pageDropdown = dropdown;
      dropdown.setDisabled(this.busy);
      this.filterPages(this.filter ?? "");
      dropdown.onChange(value => {
        this.pageId = value;
        this.versions = [];
        this.difference = null;
        this.review = null;
        this.backup = null;
        this.render();
      });
    });
    new Setting(contentEl).setName(t("Filter pages"))
      .addText(input => input.setValue(this.filter ?? "").setPlaceholder(t("Title or folder"))
        .setDisabled(this.busy).onChange(value => this.filterPages(value)));
    new Setting(contentEl).setName(t("Selected page"))
      .addButton(button("Load versions", () => this.loadVersions(), !this.pageId))
      .addButton(button("Review local application", () => this.loadReview(), !this.pageId))
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
      new Setting(contentEl).setName(t("Compare versions"))
        .addDropdown(version("before", t("Base version")))
        .addDropdown(version("after", t("Comparison version")))
        .addButton(button("Compare", () => this.compareVersions()));
    }
    if (this.difference) {
      contentEl.createEl("h3", { text: this.difference.title });
      this.renderDiff(contentEl, this.difference.text.split("\n"), t("Version differences"));
    }
    if (this.review?.hunks.length) {
      const { path, baseVersion, version, hunks } = this.review;
      contentEl.createEl("h3", { text: t("Apply selected changes to {path}", { path }) });
      contentEl.createEl("p", { text: "Confluence v" + baseVersion + " → v" + version });
      for (const [index, hunk] of hunks.entries()) {
        const label = t("Change {number}", { number: index + 1 });
        new Setting(contentEl).setName(label).setDesc(hunk.at === null ?
          t("The local context is missing or ambiguous.") : t("Local line {number}", { number: hunk.at + 1 }))
          .addToggle(toggle => toggle.setDisabled(this.busy || hunk.at === null)
            .setValue(this.selection.has(index)).onChange(enabled => {
              if (enabled) this.selection.add(index);
              else this.selection.delete(index);
              this.applyButton?.setDisabled(this.selection.size === 0);
            }));
        this.renderDiff(contentEl, [
          ...hunk.remove.map(line => "-" + line), ...hunk.insert.map(line => "+" + line),
        ], label);
      }
      new Setting(contentEl).addButton(component => {
        this.applyButton = component;
        button("Apply selected changes", () => this.applyReview(), !this.selection.size)(component);
      });
    }
    if (this.backup) {
      new Setting(contentEl).setName(t("Backup saved"))
        .addButton(button("Open backup", async () => {
          const file = this.app.vault.getFileByPath(this.backup);
          if (file) await this.app.workspace.getLeaf("tab").openFile(file);
          this.close();
        }));
    }
  }

  renderDiff(parent, lines, label) {
    const diff = parent.createEl("pre", { cls: "cfs-diff", attr: { tabindex: "0", "aria-label": label } });
    for (const line of lines) {
      const cls = line.startsWith("+") ? "cfs-added" : line.startsWith("-") ? "cfs-removed" : "";
      diff.createSpan({ text: line + "\n", cls });
    }
  }

  filterPages(text) {
    this.filter = text;
    const term = normalized(text.trim()).toLowerCase();
    const dropdown = this.pageDropdown;
    dropdown.selectEl.replaceChildren();
    dropdown.addOption("", this.t("Choose a page"));
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
    this.status = this.t(message);
    this.render();
    try {
      await this.plugin.withConnection(task);
    } catch (error) {
      this.status = localizedError(error, this.plugin.language);
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
        this.review = null;
      }
      this.status = this.t("{folder} · {count} pages", { folder: folder.title, count: this.pages.length });
    });
  }

  selected(message, task) {
    const id = this.pageId;
    return this.perform(message, async ({ client, profile }) => {
      const remote = await remotePages(client, await client.catalog());
      const page = remote.pages.get(id);
      if (!page) throw new Error("The selected page is no longer in this Confluence folder.");
      await task(client, page, profile);
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
      this.status = this.t("{title} · {count} available versions", { title: page.title, count: this.versions.length });
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
        text: diff || this.t("No converted Markdown body difference.") };
      this.status = this.t("Version comparison complete.");
    });
  }

  loadReview() {
    return this.selected("Finding changes that match the local note…", async (client, page, profile) => {
      this.review = null;
      this.backup = null;
      this.review = await prepareLocalReview(this.app, client, profile, page);
      this.selection = new Set();
      const total = this.review.hunks.length;
      const available = this.review.hunks.filter(hunk => hunk.at !== null).length;
      this.status = total ? this.t("{available} of {total} changes match the local note.", { available, total }) :
        this.t("No incoming body changes.");
    });
  }

  applyReview() {
    const review = this.review;
    const selection = Array.from(this.selection);
    return this.selected("Checking the selected changes…", async (client, page, profile) => {
      if (!this.opened) return;
      const approved = await this.plugin.confirm(this.t("Apply selected changes"),
        this.t("Apply {count} changes to {path}? A backup will be saved first.", { count: selection.length, path: review.path }),
        this.t("Apply changes"));
      if (!approved || !this.opened) {
        this.status = this.t("Application cancelled.");
        return;
      }
      const result = await applyLocalReview(this.app, client, profile, page, review, selection);
      this.review = null;
      this.selection = new Set();
      this.backup = result.backup;
      this.status = this.t("{count} changes applied to the local note.", { count: result.count });
    });
  }

  saveSnapshot(id) {
    return this.perform("Preparing the current Confluence snapshot…", async ({ client, folder }) => {
      const remote = await remotePages(client, await client.catalog());
      if (!this.opened) return;
      if (!id) {
        if (!remote.pages.size) throw new Error("The selected folder contains no pages.");
        const approved = await this.plugin.confirm(
          this.t("Download Confluence snapshot"),
          this.t("Save the current versions of {count} pages from {folder} in a new snapshot under {inbox}?",
            { count: remote.pages.size, folder: folder.title, inbox: client.config.inbox }),
          this.t("Download snapshot"),
        );
        if (!approved || !this.opened) {
          this.status = this.t("Snapshot cancelled.");
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

