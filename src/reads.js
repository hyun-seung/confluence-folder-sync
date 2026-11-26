// One read-only review owns this cache. Never pass it to a writer or retain it across commands.
class ReviewReads {
  constructor(client) {
    this.client = client;
    this.config = client.config;
    this.spaceId = client.spaceId;
    this.cache = new Map();
    this.metadata = new Map();
  }

  async check() { await this.client.check?.(); }

  async read(method, args) {
    await this.check();
    const key = JSON.stringify([method, ...args]);
    if (!this.cache.has(key)) this.cache.set(key, Promise.resolve().then(() => this.client[method](...args)));
    return structuredClone(await this.cache.get(key));
  }

  async preloadPages(ids) {
    const missing = [...new Set(ids)].filter(id => !this.metadata.has(id));
    if (typeof this.client.currentPages !== "function") return;
    const batches = [];
    for (let start = 0; start < missing.length; start += 25) batches.push(missing.slice(start, start + 25));
    await mapConcurrent(batches, async batch => {
      await this.check();
      try {
        const pages = await this.client.currentPages(batch, { allowMissing: true });
        for (const id of batch) this.metadata.set(id, pages.has(id) ? { page: structuredClone(pages.get(id)) } :
          { error: new Error("A page changed location or became inaccessible. Run the command again.") });
      } catch (error) {
        if (error.name === "AbortError") throw error;
        for (const id of batch) this.metadata.set(id, { error });
      }
    });
  }

  async page(id, version, readBody = false) {
    await this.check();
    if (version === undefined && !readBody && this.metadata.has(id)) {
      const record = this.metadata.get(id);
      if (record.error) throw record.error;
      return structuredClone(record.page);
    }
    return this.read("page", [id, version, readBody]);
  }

  async currentPages(ids) {
    await this.preloadPages(ids);
    const pages = await mapConcurrent(ids, async id => [id, await this.page(id)]);
    return new Map(pages);
  }

  get(path, params = {}) { return this.read("get", [path, params]); }
  pageTitles(title) { return this.read("pageTitles", [title]); }
  attachments(id) { return this.read("attachments", [id]); }
  pageUrl(id) { return this.client.pageUrl(id); }
}
