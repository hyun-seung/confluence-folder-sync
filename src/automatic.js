function automaticCandidates(review, profile, tree) {
  const notes = new Map(tree.notes.map(note => [note.path, note]));
  return review.rows.filter(row => {
    const entry = profile.pages["file:" + row.path];
    const note = notes.get(row.path);
    const baseline = entry?.inputHash ?? entry?.migratedInputHash;
    return row.status === "Changed" && !row.formatReviewRequired && row.id && entry && note && !entry.renamedFrom &&
      entry.bodyHash && entry.sourceHash && !entry.requiresReview && !entry.pending && !entry.creating && !row.dependencies.length &&
      (baseline ? baseline !== note.inputHash : entry.sourceHash !== note.sourceHash);
  }).map(row => row.path);
}

class AutomaticSync {
  constructor(plugin, timers = globalThis) {
    this.plugin = plugin;
    this.timers = timers;
  }

  configure() {
    if (this.disposed) return;
    this.clearTimers();
    if (!this.plugin.data.settings.autoCheck) return;
    const minutes = [5, 15, 60].includes(this.plugin.data.settings.autoMinutes) ? this.plugin.data.settings.autoMinutes : 5;
    this.interval = this.timers.setInterval(() => this.schedule(), minutes * 60_000);
    this.schedule();
  }

  changed(file, oldPath) {
    const source = this.plugin.data.settings.source + "/";
    if (file.path.startsWith(source) || oldPath?.startsWith(source)) this.schedule();
  }

  schedule(delay = 5000) {
    if (this.disposed || !this.plugin.data.settings.autoCheck || this.timer) return;
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  async run() {
    const plugin = this.plugin;
    if (this.disposed || !plugin.data.settings.autoCheck) return;
    if (this.busy || plugin.running || Date.now() - (this.lastAttempt ?? 0) < 60_000) {
      this.schedule(60_000);
      return;
    }
    this.busy = true;
    this.lastAttempt = Date.now();
    try {
      const result = await plugin.operation("Automatic check", async ({ client, profile, save }) => {
        const tree = await preparedNotes(plugin.app, client.config, () => client.check?.());
        const catalog = await client.catalog();
        const reads = new ReviewReads(client);
        const review = await publicationReview(plugin.app, reads, profile, tree, catalog);
        const remote = await remotePages(reads, catalog);
        const linked = new Map(Object.values(profile.pages).map(entry => [entry.id, entry]));
        const remoteChanges = new Set();
        const tracked = [];
        for (const [id, page] of remote.pages) {
          const entry = linked.get(id) ?? profile.imports[id];
          if (!entry || entry.version !== page.version.number || entry.title !== page.title ||
              entry?.parent !== String(page.parentId)) remoteChanges.add(id);
          if (entry?.remoteAttachments) tracked.push([id, entry]);
        }
        await mapConcurrent(tracked, async ([id, entry]) => {
          const inventory = attachmentInventory(await reads.attachments(id));
          if (attachmentDiff(entry.remoteAttachments, inventory).length) remoteChanges.add(id);
        });
        let published = 0;
        if (plugin.data.settings.autoPublish && plugin.data.settings.allowPublish) {
          const paths = automaticCandidates(review, profile, tree);
          if (paths.length) {
            published = await plugin.recordOperation("Automatic publish", () =>
              publishSelection(plugin.app, client, profile, save, review, paths, {
                check: () => {
                  if (this.disposed || !plugin.data.settings.autoCheck || !plugin.data.settings.autoPublish ||
                      !plugin.data.settings.allowPublish || publicationTarget(validatedConfig(plugin.data.settings)) !== review.target) {
                    const error = new Error("The operation was cancelled. Completed changes are preserved.");
                    error.name = "AbortError";
                    throw error;
                  }
                },
              }));
          }
        }
        return { review, remoteChanges: remoteChanges.size, published };
      });
      const counts = Object.fromEntries(["New", "Changed", "Conflict"].map(status =>
        [status, result.review.rows.filter(row => row.status === status).length]));
      const message = plugin.t("Automatic review: {new} new, {changed} changed, {conflicts} conflicts, {remote} remote changes, {published} published.",
        { new: counts.New, changed: counts.Changed, conflicts: counts.Conflict, remote: result.remoteChanges, published: result.published });
      plugin.automaticStatus = new Date().toLocaleTimeString() + " · " + message;
      if ((counts.New || counts.Changed || counts.Conflict || result.remoteChanges || result.published) && message !== this.lastMessage) {
        new Notice(message, 10000);
      }
      this.lastMessage = message;
    } catch (error) {
      const message = localizedError(error, plugin.language);
      plugin.automaticStatus = message;
      if (message !== this.lastMessage) new Notice(message, 12000);
      this.lastMessage = message;
    } finally {
      this.busy = false;
    }
  }

  clearTimers() {
    if (this.timer) this.timers.clearTimeout(this.timer);
    if (this.interval) this.timers.clearInterval(this.interval);
    this.timer = null;
    this.interval = null;
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
  }
}
